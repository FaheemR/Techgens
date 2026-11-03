import { and, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  creditsToNano,
  evaluateBudget,
  nanoToCredits,
  periodEnd,
  periodStart,
  type BudgetDTO,
  type BudgetPeriod,
  type BudgetScope,
  type UsageSummaryDTO,
} from "@techgens/core";
import { schema, type Agent, type Budget, type Job, type Role } from "@techgens/db";
import type { Techgens } from "../app";

export interface UsageInput {
  jobId: string | null;
  agentId: string | null;
  roleId: string | null;
  department: string | null;
  initiativeId: string | null;
  productId: string | null;
  model: string | null;
  nanoAiu: number;
  premiumRequests: number;
  inputTokens: number;
  outputTokens: number;
  source?: "copilot-sdk" | "cloud-agent" | "estimate";
}

const l = schema.usageLedger;

/** Credits for people: "10", "0.5", "0.0035". */
export function fmtCredits(credits: number): string {
  return Math.abs(credits) >= 0.01 || credits === 0 ? String(Number(credits.toFixed(2))) : credits.toPrecision(2);
}

const WINDOW_NAMES: Record<BudgetPeriod, string> = { day: "today", week: "this week", month: "this month", total: "the total budget" };

/** "for today (until 2026-11-04 00:00 UTC)" / "on top of the total budget": how long a grant on a budget lasts. */
export function grantWindow(period: BudgetPeriod, windowEndsAt: Date | string | null): string {
  if (period === "total" || !windowEndsAt) return "on top of the total budget";
  return `for ${WINDOW_NAMES[period]} (until ${new Date(windowEndsAt).toISOString().slice(0, 16).replace("T", " ")} UTC)`;
}

export class BudgetService {
  constructor(private readonly app: Techgens) {}

  async ensureAgentBudget(agentId: string, dailyCredits: number, overwrite = false): Promise<void> {
    const values = { scope: "agent" as const, scopeId: agentId, period: "day" as const, limitCredits: dailyCredits };
    if (overwrite) {
      await this.app.db
        .insert(schema.budgets)
        .values(values)
        .onConflictDoUpdate({ target: [schema.budgets.scope, schema.budgets.scopeId, schema.budgets.period], set: { limitCredits: dailyCredits, updatedAt: new Date() } });
    } else {
      await this.app.db.insert(schema.budgets).values(values).onConflictDoNothing();
    }
  }

  async recordUsage(input: UsageInput): Promise<void> {
    if (input.nanoAiu <= 0 && input.premiumRequests <= 0 && input.inputTokens <= 0) return;
    await this.app.db.insert(l).values({ ...input, source: input.source ?? "copilot-sdk" });
    if (input.jobId) {
      await this.app.db
        .update(schema.jobs)
        .set({
          usageNanoAiu: sql`${schema.jobs.usageNanoAiu} + ${Math.round(input.nanoAiu)}`,
          premiumRequests: sql`${schema.jobs.premiumRequests} + ${input.premiumRequests}`,
        })
        .where(eq(schema.jobs.id, input.jobId));
    }
    this.app.bus.emitSoon({
      type: "usage.recorded",
      actorType: input.agentId ? "agent" : "system",
      actorId: input.agentId,
      subjectType: "job",
      subjectId: input.jobId,
      summary: `${nanoToCredits(input.nanoAiu).toFixed(4)} credits on ${input.model ?? "model"}`,
      data: { nanoAiu: input.nanoAiu, model: input.model, initiativeId: input.initiativeId },
    });
  }

  private scopeCondition(scope: BudgetScope, scopeId: string | null): SQL | undefined {
    switch (scope) {
      case "company":
        return undefined;
      case "agent":
        return eq(l.agentId, scopeId!);
      case "department":
        return eq(l.department, scopeId!);
      case "initiative":
        return eq(l.initiativeId, scopeId!);
      case "product":
        return eq(l.productId, scopeId!);
    }
  }

  async spentNano(scope: BudgetScope, scopeId: string | null, since: Date): Promise<number> {
    const cond = this.scopeCondition(scope, scopeId);
    const [row] = await this.app.db
      .select({ total: sql<string>`coalesce(sum(${l.nanoAiu}), 0)` })
      .from(l)
      .where(cond ? and(cond, gte(l.createdAt, since)) : gte(l.createdAt, since));
    return Number(row?.total ?? 0);
  }

  private async extraCredits(budgetId: string, start: Date): Promise<number> {
    const rows = await this.app.db
      .select({ extra: schema.budgetAlerts.extraCredits })
      .from(schema.budgetAlerts)
      .where(and(eq(schema.budgetAlerts.budgetId, budgetId), eq(schema.budgetAlerts.periodStart, start)));
    return rows.reduce((s, r) => s + r.extra, 0);
  }

  /** Spend of the budget's current window. Grants by the CEO only extend the current window (they expire with it). */
  async evaluate(b: Budget, labels?: Map<string, string>, now: Date = new Date()): Promise<BudgetDTO> {
    const start = periodStart(b.period, now);
    const spent = await this.spentNano(b.scope, b.scopeId, start);
    const granted = await this.extraCredits(b.id, start);
    const ev = evaluateBudget(spent, b.limitCredits + granted, b.warnPct);
    return {
      id: b.id,
      scope: b.scope,
      scopeId: b.scopeId,
      scopeLabel: labels?.get(`${b.scope}:${b.scopeId}`) ?? (b.scope === "company" ? "Company" : (b.scopeId ?? b.scope)),
      period: b.period,
      limitCredits: b.limitCredits,
      grantedCredits: granted,
      windowEndsAt: periodEnd(b.period, now)?.toISOString() ?? null,
      warnPct: b.warnPct,
      enabled: b.enabled,
      spentCredits: ev.spentCredits,
      state: b.enabled ? ev.state : "ok",
    };
  }

  /** Human name of a budget's scope: "Company", an initiative title, "Morgan (Chief of Staff)", … */
  async scopeName(scope: BudgetScope, scopeId: string | null): Promise<string> {
    if (scope === "company" || !scopeId) return "Company";
    if (scope === "department") return `${scopeId.charAt(0).toUpperCase()}${scopeId.slice(1)} department`;
    return (await this.labels()).get(`${scope}:${scopeId}`) ?? scopeId;
  }

  /** Decision note for a grant on `budgetId`, e.g. "Granted 10 extra credits for today (until 2026-11-04 00:00 UTC)." */
  async describeGrant(budgetId: string | null, credits: number, now: Date = new Date()): Promise<string> {
    const [b] = budgetId ? await this.app.db.select().from(schema.budgets).where(eq(schema.budgets.id, budgetId)) : [];
    const amount = `${fmtCredits(credits)} extra credit${credits === 1 ? "" : "s"}`;
    return b ? `Granted ${amount} ${grantWindow(b.period, periodEnd(b.period, now))}.` : `Granted ${amount}.`;
  }

  /** Budgets that constrain a job of `agent` (company, department, agent, initiative, product). */
  private async applicable(agent: Agent, role: Role, job: Pick<Job, "initiativeId">): Promise<Budget[]> {
    const conds: SQL[] = [eq(schema.budgets.scope, "company"), and(eq(schema.budgets.scope, "department"), eq(schema.budgets.scopeId, role.department))!, and(eq(schema.budgets.scope, "agent"), eq(schema.budgets.scopeId, agent.id))!];
    if (job.initiativeId) {
      conds.push(and(eq(schema.budgets.scope, "initiative"), eq(schema.budgets.scopeId, job.initiativeId))!);
      const [ini] = await this.app.db.select({ productId: schema.initiatives.productId }).from(schema.initiatives).where(eq(schema.initiatives.id, job.initiativeId));
      if (ini?.productId) conds.push(and(eq(schema.budgets.scope, "product"), eq(schema.budgets.scopeId, ini.productId))!);
    }
    return this.app.db.select().from(schema.budgets).where(and(eq(schema.budgets.enabled, true), or(...conds)));
  }

  /** Returns the first exceeded budget (if any). Emits one warning per budget window when crossing the threshold. */
  async check(agent: Agent, role: Role, job: Pick<Job, "initiativeId">): Promise<BudgetDTO | null> {
    for (const b of await this.applicable(agent, role, job)) {
      const dto = await this.evaluate(b);
      if (dto.state === "exceeded") return dto;
      if (dto.state === "warn") {
        const inserted = await this.app.db
          .insert(schema.budgetAlerts)
          .values({ budgetId: b.id, periodStart: periodStart(b.period), state: "warn" })
          .onConflictDoNothing()
          .returning();
        if (inserted.length) {
          await this.app.bus.emit({ type: "budget.warning", subjectType: "budget", subjectId: b.id, summary: `${b.scope} budget at ${Math.round((dto.spentCredits / (dto.limitCredits + dto.grantedCredits)) * 100)}% (${b.period})`, data: { ...dto } });
        }
      }
    }
    return null;
  }

  /** CEO granted extra credits for the current window of a budget (the base limit is unchanged; the grant expires with the window). */
  async grantExtra(budgetId: string, credits: number): Promise<void> {
    const [b] = await this.app.db.select().from(schema.budgets).where(eq(schema.budgets.id, budgetId));
    if (!b) return;
    const start = periodStart(b.period);
    await this.app.db
      .insert(schema.budgetAlerts)
      .values({ budgetId, periodStart: start, state: "exceeded", extraCredits: credits })
      .onConflictDoUpdate({
        target: [schema.budgetAlerts.budgetId, schema.budgetAlerts.periodStart, schema.budgetAlerts.state],
        set: { extraCredits: sql`${schema.budgetAlerts.extraCredits} + ${credits}` },
      });
  }

  async spentTodayByAgent(): Promise<Map<string, number>> {
    const rows = await this.app.db
      .select({ agentId: l.agentId, total: sql<string>`sum(${l.nanoAiu})` })
      .from(l)
      .where(gte(l.createdAt, periodStart("day")))
      .groupBy(l.agentId);
    return new Map(rows.filter((r) => r.agentId).map((r) => [r.agentId!, nanoToCredits(Number(r.total))]));
  }

  async agentDailyLimits(): Promise<Map<string, number>> {
    const rows = await this.app.db.select().from(schema.budgets).where(and(eq(schema.budgets.scope, "agent"), eq(schema.budgets.period, "day")));
    return new Map(rows.map((r) => [r.scopeId!, r.limitCredits]));
  }

  private async labels(): Promise<Map<string, string>> {
    const [agents, initiatives, products] = await Promise.all([
      this.app.db.select({ id: schema.agents.id, name: schema.agents.name, role: schema.roles.title }).from(schema.agents).innerJoin(schema.roles, eq(schema.agents.roleId, schema.roles.id)),
      this.app.db.select({ id: schema.initiatives.id, title: schema.initiatives.title }).from(schema.initiatives),
      this.app.db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products),
    ]);
    const m = new Map<string, string>();
    for (const a of agents) m.set(`agent:${a.id}`, `${a.name} (${a.role})`);
    for (const i of initiatives) m.set(`initiative:${i.id}`, i.title);
    for (const p of products) m.set(`product:${p.id}`, p.name);
    return m;
  }

  async listBudgets(): Promise<BudgetDTO[]> {
    const rows = await this.app.db.select().from(schema.budgets).orderBy(schema.budgets.scope, schema.budgets.createdAt);
    const labels = await this.labels();
    for (const r of rows) if (r.scope === "department") labels.set(`department:${r.scopeId}`, r.scopeId ?? "");
    return Promise.all(rows.map((b) => this.evaluate(b, labels)));
  }

  async upsertBudgets(items: Array<{ scope: BudgetScope; scopeId: string | null; period: BudgetPeriod; limitCredits: number; warnPct?: number; enabled?: boolean }>): Promise<BudgetDTO[]> {
    for (const i of items) {
      const values = { scope: i.scope, scopeId: i.scope === "company" ? null : i.scopeId, period: i.period, limitCredits: i.limitCredits, warnPct: i.warnPct ?? 80, enabled: i.enabled ?? true };
      if (values.scopeId === null) {
        const [existing] = await this.app.db.select().from(schema.budgets).where(and(eq(schema.budgets.scope, i.scope), sql`${schema.budgets.scopeId} is null`, eq(schema.budgets.period, i.period)));
        if (existing) {
          await this.app.db.update(schema.budgets).set({ ...values, updatedAt: new Date() }).where(eq(schema.budgets.id, existing.id));
          continue;
        }
        await this.app.db.insert(schema.budgets).values(values);
        continue;
      }
      await this.app.db
        .insert(schema.budgets)
        .values(values)
        .onConflictDoUpdate({ target: [schema.budgets.scope, schema.budgets.scopeId, schema.budgets.period], set: { ...values, updatedAt: new Date() } });
    }
    return this.listBudgets();
  }

  async deleteBudget(id: string): Promise<void> {
    await this.app.db.delete(schema.budgets).where(eq(schema.budgets.id, id));
  }

  async summary(days = 30): Promise<UsageSummaryDTO> {
    const db = this.app.db;
    const sum = async (since: Date) => nanoToCredits(await this.spentNano("company", null, since));
    const since = new Date(Date.now() - days * 86_400_000);
    const [byAgent, byDept, byIni, daily, prem] = await Promise.all([
      db.select({ agentId: l.agentId, name: schema.agents.name, total: sql<string>`sum(${l.nanoAiu})` }).from(l).leftJoin(schema.agents, eq(l.agentId, schema.agents.id)).where(gte(l.createdAt, periodStart("month"))).groupBy(l.agentId, schema.agents.name),
      db.select({ department: l.department, total: sql<string>`sum(${l.nanoAiu})` }).from(l).where(gte(l.createdAt, periodStart("month"))).groupBy(l.department),
      db.select({ id: l.initiativeId, title: schema.initiatives.title, total: sql<string>`sum(${l.nanoAiu})` }).from(l).leftJoin(schema.initiatives, eq(l.initiativeId, schema.initiatives.id)).where(gte(l.createdAt, periodStart("month"))).groupBy(l.initiativeId, schema.initiatives.title),
      db.select({ day: sql<string>`to_char(date_trunc('day', ${l.createdAt}), 'YYYY-MM-DD')`, total: sql<string>`sum(${l.nanoAiu})` }).from(l).where(gte(l.createdAt, since)).groupBy(sql`1`).orderBy(sql`1`),
      db.select({ total: sql<string>`coalesce(sum(${l.premiumRequests}), 0)` }).from(l).where(gte(l.createdAt, periodStart("month"))),
    ]);
    return {
      todayCredits: await sum(periodStart("day")),
      weekCredits: await sum(periodStart("week")),
      monthCredits: await sum(periodStart("month")),
      premiumRequestsMonth: Number(prem[0]?.total ?? 0),
      byAgent: byAgent.filter((r) => r.agentId).map((r) => ({ agentId: r.agentId!, agentName: r.name ?? "unknown", credits: nanoToCredits(Number(r.total)) })).sort((a, b) => b.credits - a.credits),
      byDepartment: byDept.map((r) => ({ department: r.department ?? "unknown", credits: nanoToCredits(Number(r.total)) })).sort((a, b) => b.credits - a.credits),
      byInitiative: byIni.filter((r) => r.id).map((r) => ({ initiativeId: r.id!, title: r.title ?? "", credits: nanoToCredits(Number(r.total)) })).sort((a, b) => b.credits - a.credits),
      daily: daily.map((r) => ({ day: r.day, credits: nanoToCredits(Number(r.total)) })),
      budgets: await this.listBudgets(),
    };
  }

  async initiativeSpend(initiativeIds: string[]): Promise<Map<string, number>> {
    if (!initiativeIds.length) return new Map();
    const rows = await this.app.db.select({ id: l.initiativeId, total: sql<string>`sum(${l.nanoAiu})` }).from(l).where(inArray(l.initiativeId, initiativeIds)).groupBy(l.initiativeId);
    return new Map(rows.map((r) => [r.id!, nanoToCredits(Number(r.total))]));
  }

  async recentLedger(limit = 50) {
    return this.app.db.select().from(l).orderBy(desc(l.createdAt)).limit(limit);
  }

  creditsToNano = creditsToNano;
}
