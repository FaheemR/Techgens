import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  DomainError,
  LIFECYCLE_STAGES,
  STAGES,
  nextStage,
  stageIndex,
  type ApprovalOutcome,
  type InitiativeDetailDTO,
  type InitiativeStatus,
  type InitiativeSummaryDTO,
  type LifecycleStage,
  type StageProgress,
} from "@techgens/core";
import { schema, type Approval, type Initiative, type Job, type WorkItem } from "@techgens/db";
import type { Techgens } from "../app";
import { stageBrief } from "../engine/prompts";

export interface CreateInitiativeInput {
  title: string;
  directive: string;
  summary?: string;
  productId?: string | null;
  productName?: string;
  targetDate?: string | null;
  budgetCredits?: number | null;
  skipStages?: LifecycleStage[];
  createdByAgentId?: string | null;
}

export class LifecycleService {
  constructor(private readonly app: Techgens) {}

  async get(id: string): Promise<Initiative> {
    const [row] = await this.app.db.select().from(schema.initiatives).where(eq(schema.initiatives.id, id));
    if (!row) throw new DomainError("initiative not found", "not_found");
    return row;
  }

  async create(input: CreateInitiativeInput): Promise<Initiative> {
    let productId = input.productId ?? null;
    if (!productId) {
      const name = input.productName?.trim() || input.title;
      const product = (await this.app.company.findProductByName(name)) ?? (await this.app.company.createProduct({ name, description: input.summary ?? input.directive }));
      productId = product.id;
    }
    const [ini] = await this.app.db
      .insert(schema.initiatives)
      .values({
        title: input.title,
        directive: input.directive,
        summary: input.summary ?? "",
        productId,
        status: "active",
        stage: "intake",
        skipStages: input.skipStages ?? [],
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        budgetCredits: input.budgetCredits ?? null,
      })
      .returning();
    if (input.budgetCredits) {
      await this.app.budget.upsertBudgets([{ scope: "initiative", scopeId: ini!.id, period: "total", limitCredits: input.budgetCredits }]);
    }
    await this.app.db.insert(schema.decisions).values({
      initiativeId: ini!.id,
      type: "event",
      summary: "Initiative created from CEO directive",
      details: input.directive,
      actorType: input.createdByAgentId ? "agent" : "ceo",
      actorAgentId: input.createdByAgentId ?? null,
    });
    await this.app.bus.emit({ type: "initiative.created", subjectType: "initiative", subjectId: ini!.id, summary: ini!.title, data: { productId } });
    await this.startStage(ini!, "intake");
    return this.get(ini!.id);
  }

  async stageWorkItem(initiativeId: string, stage: LifecycleStage): Promise<WorkItem | null> {
    const [row] = await this.app.db
      .select()
      .from(schema.workItems)
      .where(and(eq(schema.workItems.initiativeId, initiativeId), eq(schema.workItems.kind, "stage"), eq(schema.workItems.stage, stage)))
      .orderBy(desc(schema.workItems.createdAt))
      .limit(1);
    return row ?? null;
  }

  async startStage(ini: Initiative, stage: LifecycleStage, feedback?: string): Promise<Job | null> {
    const def = STAGES[stage];
    const product = ini.productId ? await this.app.company.getProduct(ini.productId) : null;
    await this.app.db.update(schema.initiatives).set({ stage, updatedAt: new Date() }).where(eq(schema.initiatives.id, ini.id));
    await this.app.bus.emit({ type: "initiative.stage_changed", subjectType: "initiative", subjectId: ini.id, summary: `${ini.title} → ${def.title}`, data: { stage } });

    if (def.requiresRepo && product && !product.repoOwner) {
      try {
        await this.app.github.bootstrapProductRepo(product.id);
      } catch (err) {
        await this.pause(ini.id, `Repository setup needed: ${(err as Error).message}`);
        return null;
      }
    }
    const owner = (await this.app.org.agentForRole(def.ownerRole)) ?? (await this.app.org.agentForRole("chief-of-staff"));
    if (!owner) throw new DomainError(`no agent available for ${def.ownerRole}`, "unavailable");
    const item = await this.app.work.create({
      kind: "stage",
      stage,
      title: def.title,
      description: def.instructions,
      initiativeId: ini.id,
      productId: ini.productId,
      assigneeAgentId: owner.id,
      status: "in_progress",
      priority: "p1",
    });
    const fresh = await this.get(ini.id);
    const prompt = stageBrief({
      initiative: fresh,
      stage,
      product: product ? await this.app.company.getProduct(product.id) : null,
      documents: await this.app.docs.list({ initiativeId: ini.id }),
      milestones: await this.milestones(ini.id),
      feedback,
    });
    return this.app.engine.createJob({ agentId: owner.id, workItemId: item.id, initiativeId: ini.id, prompt, kind: "work" });
  }

  async milestones(initiativeId: string) {
    return this.app.db.select().from(schema.milestones).where(eq(schema.milestones.initiativeId, initiativeId)).orderBy(asc(schema.milestones.sortOrder));
  }

  /** Called when a stage owner's job finishes. Enforces gates even if the agent did not request approval. */
  async onStageJobFinished(job: Job, item: WorkItem): Promise<void> {
    if (!item.initiativeId || !item.stage) return;
    const ini = await this.get(item.initiativeId);
    if (ini.status !== "active" || ini.stage !== item.stage) return;
    if (job.status !== "succeeded" || job.result?.outcome === "blocked") {
      await this.app.notifications.notify({ kind: "escalation", title: `${ini.title}: ${STAGES[item.stage].title} is blocked`, body: job.error ?? job.result?.summary ?? "", link: `/initiatives/${ini.id}` });
      return;
    }
    const gate = STAGES[item.stage].gate;
    if (!gate) return this.advance(ini.id);
    const latest = await this.app.approvals.latest(ini.id, gate);
    if (latest && latest.updatedAt >= item.createdAt) {
      if (latest.status === "approved") return this.advance(ini.id);
      if (latest.status === "pending") return;
    }
    const kinds = STAGES[item.stage].deliverables;
    const docs = (await this.app.docs.list({ initiativeId: ini.id })).filter((d) => kinds.includes(d.kind as never));
    await this.app.approvals.request({
      kind: gate,
      title: `${STAGES[item.stage].title} — ${ini.title}`,
      summary: job.result?.summary ?? "Stage completed.",
      initiativeId: ini.id,
      workItemId: item.id,
      jobId: job.id,
      documentIds: docs.map((d) => d.id),
      requestedByAgentId: job.agentId,
      payload: { stage: item.stage, ...(gate === "merge_to_main" && ini.metadata.releasePrNumber ? { prNumber: ini.metadata.releasePrNumber } : {}) },
    });
  }

  /** Gate decisions on approvals whose requesting job is no longer waiting (engine-created gates). */
  async onApprovalDecided(a: Approval, outcome: ApprovalOutcome, comment: string): Promise<void> {
    const stage = a.payload.stage as LifecycleStage | undefined;
    if (!a.initiativeId || !stage || STAGES[stage]?.gate !== a.kind) return;
    if (a.jobId) {
      const job = await this.app.engine.getJob(a.jobId);
      if (job.status === "waiting" || job.status === "queued" || job.status === "running") return; // engine resumes the job
    }
    const ini = await this.get(a.initiativeId);
    if (ini.stage !== stage || ini.status !== "active") return;
    if (outcome === "approved") return this.advance(ini.id);
    if (outcome === "rejected") {
      await this.pause(ini.id, `CEO rejected ${STAGES[stage].title}: ${comment}`);
      return;
    }
    if (a.jobId) await this.app.engine.reopenJob(a.jobId, `The CEO requested changes before approving "${a.title}":\n\n${comment}\n\nRevise your deliverables, then call complete_task (the gate will be requested again).`);
  }

  async advance(initiativeId: string): Promise<void> {
    const ini = await this.get(initiativeId);
    const item = await this.stageWorkItem(ini.id, ini.stage);
    if (item && item.status !== "done") await this.app.work.update(item.id, { status: "done" });
    const next = nextStage(ini.stage, { skip: ini.skipStages, hasRepo: Boolean(ini.productId) });
    if (!next) {
      await this.app.db.update(schema.initiatives).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.initiatives.id, ini.id));
      await this.app.bus.emit({ type: "initiative.updated", subjectType: "initiative", subjectId: ini.id, summary: `${ini.title} completed 🎉`, data: { status: "completed" } });
      await this.app.notifications.notify({ kind: "initiative", title: `${ini.title} completed`, link: `/initiatives/${ini.id}` });
      return;
    }
    await this.startStage(ini, next);
  }

  async setStatus(id: string, status: InitiativeStatus, reason?: string): Promise<Initiative> {
    const ini = await this.get(id);
    const [row] = await this.app.db
      .update(schema.initiatives)
      .set({ status, updatedAt: new Date(), metadata: { ...ini.metadata, pausedReason: status === "paused" ? reason : undefined } })
      .where(eq(schema.initiatives.id, id))
      .returning();
    await this.app.bus.emit({ type: "initiative.updated", subjectType: "initiative", subjectId: id, summary: `${ini.title} ${status}${reason ? `: ${reason}` : ""}`, data: { status } });
    return row!;
  }

  async pause(id: string, reason: string): Promise<Initiative> {
    const row = await this.setStatus(id, "paused", reason);
    await this.app.notifications.notify({ kind: "initiative", title: `${row.title} paused`, body: reason, link: `/initiatives/${id}` });
    return row;
  }

  async resume(id: string): Promise<Initiative> {
    const ini = await this.get(id);
    const row = await this.setStatus(id, "active");
    const open = await this.app.db.select().from(schema.jobs).where(and(eq(schema.jobs.initiativeId, id), inArray(schema.jobs.status, ["queued", "running", "waiting"])));
    if (open.length) await this.app.engine.requeueJobs(open.filter((j) => j.status === "queued").map((j) => j.id));
    else await this.startStage(row, ini.stage, "The initiative was resumed by the CEO; continue this stage.");
    return this.get(id);
  }

  async cancel(id: string): Promise<Initiative> {
    const jobs = await this.app.db.select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.initiativeId, id), inArray(schema.jobs.status, ["queued", "running", "waiting"])));
    for (const j of jobs) await this.app.engine.cancelJob(j.id, "Initiative cancelled by the CEO");
    return this.setStatus(id, "cancelled");
  }

  async update(id: string, patch: { title?: string; summary?: string; targetDate?: string | null; budgetCredits?: number | null }): Promise<Initiative> {
    const values: Partial<Initiative> = { updatedAt: new Date() };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.summary !== undefined) values.summary = patch.summary;
    if (patch.targetDate !== undefined) values.targetDate = patch.targetDate ? new Date(patch.targetDate) : null;
    if (patch.budgetCredits !== undefined) {
      values.budgetCredits = patch.budgetCredits;
      if (patch.budgetCredits) await this.app.budget.upsertBudgets([{ scope: "initiative", scopeId: id, period: "total", limitCredits: patch.budgetCredits }]);
    }
    const [row] = await this.app.db.update(schema.initiatives).set(values).where(eq(schema.initiatives.id, id)).returning();
    await this.app.bus.emit({ type: "initiative.updated", subjectType: "initiative", subjectId: id, summary: `${row!.title} updated` });
    return row!;
  }

  async list(status?: InitiativeStatus): Promise<Initiative[]> {
    return this.app.db.select().from(schema.initiatives).where(status ? eq(schema.initiatives.status, status) : undefined).orderBy(desc(schema.initiatives.createdAt));
  }

  async summaries(rows: Initiative[]): Promise<InitiativeSummaryDTO[]> {
    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];
    const [counts, pending, spend, products] = await Promise.all([
      this.app.db
        .select({ id: schema.workItems.initiativeId, status: schema.workItems.status, n: sql<number>`count(*)::int` })
        .from(schema.workItems)
        .where(and(inArray(schema.workItems.initiativeId, ids), sql`${schema.workItems.kind} <> 'stage'`))
        .groupBy(schema.workItems.initiativeId, schema.workItems.status),
      this.app.db
        .select({ id: schema.approvals.initiativeId, n: sql<number>`count(*)::int` })
        .from(schema.approvals)
        .where(and(inArray(schema.approvals.initiativeId, ids), eq(schema.approvals.status, "pending")))
        .groupBy(schema.approvals.initiativeId),
      this.app.budget.initiativeSpend(ids),
      this.app.company.listProducts(),
    ]);
    const productName = new Map(products.map((p) => [p.id, p.name]));
    return rows.map((r) => {
      const mine = counts.filter((c) => c.id === r.id);
      const n = (s: string) => mine.filter((c) => c.status === s).reduce((a, c) => a + c.n, 0);
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        directive: r.directive,
        stage: r.stage,
        status: r.status,
        statusReason: null,
        productId: r.productId,
        productName: r.productId ? (productName.get(r.productId) ?? null) : null,
        targetDate: r.targetDate?.toISOString() ?? null,
        budgetCredits: r.budgetCredits,
        spentCredits: spend.get(r.id) ?? 0,
        workItems: { total: mine.reduce((a, c) => a + c.n, 0), done: n("done"), inProgress: n("in_progress") + n("in_review"), blocked: n("blocked") },
        pendingApprovals: pending.find((p) => p.id === r.id)?.n ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  async detail(id: string): Promise<InitiativeDetailDTO> {
    const ini = await this.get(id);
    const [summary] = await this.summaries([ini]);
    const product = ini.productId ? await this.app.company.getProduct(ini.productId) : null;
    const current = stageIndex(ini.stage);
    const stages: StageProgress[] = LIFECYCLE_STAGES.map((s, i) => {
      const skipped = ini.skipStages.includes(s) || (STAGES[s].requiresRepo && !product);
      const state = skipped ? "skipped" : ini.status === "completed" || i < current ? "done" : i === current ? "active" : "pending";
      return { stage: s, title: STAGES[s].title, state, gate: STAGES[s].gate };
    });
    const decisions = await this.app.db
      .select({ d: schema.decisions, name: schema.agents.name })
      .from(schema.decisions)
      .leftJoin(schema.agents, eq(schema.decisions.actorAgentId, schema.agents.id))
      .where(eq(schema.decisions.initiativeId, id))
      .orderBy(desc(schema.decisions.createdAt));
    return {
      ...summary!,
      stages,
      milestones: (await this.milestones(id)).map((m) => ({ id: m.id, title: m.title, description: m.description, dueDate: m.dueDate?.toISOString() ?? null, status: m.status, sortOrder: m.sortOrder })),
      documents: await this.app.docs.summaries(await this.app.docs.list({ initiativeId: id })),
      approvals: await this.app.approvals.summaries(await this.app.db.select().from(schema.approvals).where(eq(schema.approvals.initiativeId, id)).orderBy(desc(schema.approvals.createdAt))),
      decisions: decisions.map(({ d, name }) => ({ id: d.id, initiativeId: d.initiativeId, type: d.type, summary: d.summary, details: d.details, actorType: d.actorType, actorName: name ?? (d.actorType === "ceo" ? "CEO" : null), createdAt: d.createdAt.toISOString() })),
    };
  }

  async setRoadmap(initiativeId: string, milestones: Array<{ title: string; description?: string; dueDate?: string }>): Promise<number> {
    await this.app.db.delete(schema.milestones).where(eq(schema.milestones.initiativeId, initiativeId));
    if (milestones.length) {
      await this.app.db.insert(schema.milestones).values(
        milestones.map((m, i) => ({
          initiativeId,
          title: m.title,
          description: m.description ?? "",
          dueDate: m.dueDate && !Number.isNaN(Date.parse(m.dueDate)) ? new Date(m.dueDate) : null,
          sortOrder: i,
        })),
      );
    }
    await this.app.bus.emit({ type: "initiative.updated", subjectType: "initiative", subjectId: initiativeId, summary: `Roadmap updated (${milestones.length} milestones)` });
    return milestones.length;
  }
}
