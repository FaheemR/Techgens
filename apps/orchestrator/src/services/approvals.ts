import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  APPROVAL_KINDS,
  DomainError,
  GATE_LABELS,
  approvalDisplayTitle,
  approvalHeadline,
  isGateEnabled,
  isOneOf,
  type ApprovalDetailDTO,
  type ApprovalKind,
  type ApprovalOutcome,
  type ApprovalStatus,
  type ApprovalSummaryDTO,
} from "@techgens/core";
import { schema, type Approval } from "@techgens/db";
import type { Techgens } from "../app";
import { approvalLink } from "./notifications";

export interface ApprovalRequest {
  kind: ApprovalKind;
  title: string;
  summary: string;
  initiativeId?: string | null;
  workItemId?: string | null;
  jobId?: string | null;
  documentIds?: string[];
  payload?: Record<string, unknown>;
  requestedByAgentId?: string | null;
}

/** Extra credits the CEO typed (number or numeric string, decimals allowed); undefined when none was sent. */
function extraCreditsOf(value: number | string | null | undefined): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === ""))
    return undefined;
  const credits = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(credits) || credits <= 0)
    throw new DomainError(`extraCredits must be a positive number of credits (got "${value}")`);
  return credits;
}

export class ApprovalService {
  constructor(private readonly app: Techgens) {}

  async get(id: string): Promise<Approval> {
    const [row] = await this.app.db.select().from(schema.approvals).where(eq(schema.approvals.id, id));
    if (!row) throw new DomainError("approval not found", "not_found");
    return row;
  }

  async request(input: ApprovalRequest): Promise<{ approval: Approval; autoApproved: boolean }> {
    const db = this.app.db;
    const documentIds = input.documentIds ?? [];
    // A revised submission after "changes requested" continues the same approval as a new round. Budget overruns are
    // per budget (deduplicated by the job engine), never revisions of each other.
    let approval: Approval | undefined;
    if (input.initiativeId && input.kind !== "budget_overrun") {
      const [prev] = await db
        .select()
        .from(schema.approvals)
        .where(
          and(
            eq(schema.approvals.initiativeId, input.initiativeId),
            eq(schema.approvals.kind, input.kind),
            inArray(schema.approvals.status, ["changes_requested", "pending"]),
          ),
        )
        .orderBy(desc(schema.approvals.createdAt))
        .limit(1);
      if (prev) {
        [approval] = await db
          .update(schema.approvals)
          .set({
            status: "pending",
            round: prev.status === "pending" ? prev.round : prev.round + 1,
            title: input.title,
            summary: input.summary,
            documentIds,
            payload: { ...prev.payload, ...(input.payload ?? {}) },
            jobId: input.jobId ?? prev.jobId,
            workItemId: input.workItemId ?? prev.workItemId,
            requestedByAgentId: input.requestedByAgentId ?? prev.requestedByAgentId,
            decisionComment: null,
            decidedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.approvals.id, prev.id))
          .returning();
      }
    }
    if (!approval) {
      [approval] = await db
        .insert(schema.approvals)
        .values({
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          initiativeId: input.initiativeId ?? null,
          workItemId: input.workItemId ?? null,
          jobId: input.jobId ?? null,
          documentIds,
          payload: input.payload ?? {},
          requestedByAgentId: input.requestedByAgentId ?? null,
        })
        .returning();
    }
    await this.app.docs.setStatus(documentIds, "in_review");
    const policy = await this.app.settings.get("gatePolicy");
    if (!isGateEnabled(policy, input.kind)) {
      const decided = await this.decide(
        approval!.id,
        { outcome: "approved", comment: "Auto-approved: gate disabled in the CEO's gate policy." },
        "system",
      );
      return { approval: decided, autoApproved: true };
    }
    await this.app.bus.emit({
      type: "approval.requested",
      actorType: input.requestedByAgentId ? "agent" : "system",
      actorId: input.requestedByAgentId ?? null,
      subjectType: "approval",
      subjectId: approval!.id,
      summary: approvalHeadline(input.kind, input.title),
      data: { kind: input.kind, initiativeId: input.initiativeId ?? null, round: approval!.round },
    });
    await this.app.notifications.notify({
      kind: "approval",
      title: `Approval needed — ${GATE_LABELS[input.kind]}`,
      body: input.title,
      link: approvalLink(approval!.id),
    });
    return { approval: approval!, autoApproved: false };
  }

  async decide(
    id: string,
    input: { outcome: ApprovalOutcome; comment?: string; extraCredits?: number | string | null },
    actor: "ceo" | "system" = "ceo",
  ): Promise<Approval> {
    const approval = await this.get(id);
    if (approval.status !== "pending")
      throw new DomainError(`approval is already ${approval.status}`, "conflict");
    let comment = input.comment?.trim() ?? "";
    if (actor === "ceo" && input.outcome !== "approved" && !comment)
      throw new DomainError("please explain what should change (comment required)");
    const status: ApprovalStatus = input.outcome;
    let payload = approval.payload;
    let grantNote = "";
    if (approval.kind === "budget_overrun" && input.outcome === "approved") {
      // An amount the CEO sends always wins; only without one is the suggestion granted. The decision states the grant.
      const granted =
        extraCreditsOf(input.extraCredits) ?? Number(approval.payload.suggestedExtraCredits ?? 0);
      payload = { ...payload, grantedExtraCredits: granted };
      grantNote = await this.app.budget.describeGrant(
        typeof approval.payload.budgetId === "string" ? approval.payload.budgetId : null,
        granted,
      );
      comment = comment ? `${comment} — ${grantNote}` : grantNote;
    }
    const [updated] = await this.app.db
      .update(schema.approvals)
      .set({
        status,
        payload,
        decisionComment: comment || null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.approvals.id, id), eq(schema.approvals.status, "pending")))
      .returning();
    if (!updated) throw new DomainError("approval was decided concurrently", "conflict");
    await this.app.db
      .insert(schema.approvalDecisions)
      .values({ approvalId: id, outcome: input.outcome, comment, actorType: actor, round: approval.round });
    if (approval.initiativeId) {
      await this.app.db.insert(schema.decisions).values({
        initiativeId: approval.initiativeId,
        type: actor === "system" ? "event" : "decision",
        summary: `${actor === "ceo" ? "CEO" : "Policy"} ${input.outcome.replace("_", " ")}: ${approvalHeadline(approval.kind, approval.title)}`,
        details: comment,
        actorType: actor,
      });
    }
    await this.app.docs.setStatus(approval.documentIds, input.outcome === "approved" ? "approved" : "draft");
    // The decision is made: its "approval needed" notifications are no longer actionable (the event below refreshes the bell).
    await this.app.notifications.markApprovalsRead([id]);

    let note = "";
    try {
      note = await this.applySideEffects(updated, input);
    } catch (err) {
      note = `Follow-up action failed: ${(err as Error).message}`;
      this.app.log.error({ err, approvalId: id }, "approval side effect failed");
    }
    await this.app.bus.emit({
      type: "approval.decided",
      actorType: actor,
      subjectType: "approval",
      subjectId: id,
      summary: `${GATE_LABELS[approval.kind]} ${input.outcome.replace("_", " ")}: ${approvalDisplayTitle(approval.kind, approval.title)}${grantNote ? ` — ${grantNote}` : ""}`,
      data: {
        kind: approval.kind,
        outcome: input.outcome,
        initiativeId: approval.initiativeId,
        ...(grantNote ? { grantedExtraCredits: payload.grantedExtraCredits } : {}),
      },
    });
    await this.app.engine.onApprovalDecided(updated, input.outcome, comment, note);
    await this.app.lifecycle.onApprovalDecided(updated, input.outcome, comment);
    return updated;
  }

  /**
   * Withdraws open approvals (pending or awaiting a revision) without a CEO decision, e.g. when their initiative is
   * cancelled: they leave the inbox (status `cancelled`) and their notifications are marked read.
   */
  async withdraw(initiativeId: string, reason: string): Promise<Approval[]> {
    const now = new Date();
    const withdrawn = await this.app.db
      .update(schema.approvals)
      .set({ status: "cancelled", decisionComment: reason, decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.approvals.initiativeId, initiativeId),
          inArray(schema.approvals.status, ["pending", "changes_requested"]),
        ),
      )
      .returning();
    if (!withdrawn.length) return [];
    const ids = withdrawn.map((a) => a.id);
    await this.app.docs.setStatus([...new Set(withdrawn.flatMap((a) => a.documentIds))], "draft");
    await this.app.notifications.markApprovalsRead(ids);
    for (const a of withdrawn) {
      await this.app.bus.emit({
        type: "approval.decided",
        actorType: "system",
        subjectType: "approval",
        subjectId: a.id,
        summary: `${GATE_LABELS[a.kind]} withdrawn: ${approvalDisplayTitle(a.kind, a.title)}`,
        data: {
          kind: a.kind,
          outcome: "withdrawn",
          status: "cancelled",
          initiativeId: a.initiativeId,
          reason,
        },
      });
    }
    // Jobs outside the initiative (e.g. blocked by a shared budget) must not keep waiting on a withdrawn approval.
    const waiting = await this.app.db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, "waiting"),
          eq(schema.jobs.waitReason, "approval"),
          inArray(sql<string>`${schema.jobs.waitState}->>'approvalId'`, ids),
        ),
      );
    for (const job of waiting)
      await this.app.engine.resume(
        job.id,
        job.sessionId ? "The approval you were waiting for was withdrawn. Continue your assignment." : null,
      );
    return withdrawn;
  }

  /** Updates the gate policy and records one CEO decision (decision log + activity feed) per gate switched on or off. */
  async updateGatePolicy(patch: Record<string, boolean>): Promise<void> {
    const before = await this.app.settings.get("gatePolicy");
    const known = Object.entries(patch).filter((e): e is [ApprovalKind, boolean] =>
      isOneOf(APPROVAL_KINDS, e[0]),
    );
    await this.app.settings.set("gatePolicy", { ...before, ...Object.fromEntries(known) });
    for (const [kind, enabled] of known) {
      if (isGateEnabled(before, kind) === enabled) continue;
      const label = GATE_LABELS[kind];
      const summary = `CEO turned ${enabled ? "on" : "off"} the ${label} gate`;
      const details = enabled
        ? `${label} requests need the CEO's approval again.`
        : `${label} requests are now approved automatically; each auto-approval is logged.`;
      const [row] = await this.app.db
        .insert(schema.decisions)
        .values({ initiativeId: null, type: "change", summary, details, actorType: "ceo" })
        .returning();
      await this.app.bus.emit({
        type: "decision.recorded",
        actorType: "ceo",
        subjectType: "settings",
        subjectId: "gatePolicy",
        summary,
        data: { decisionId: row!.id, type: "change", gate: kind, enabled },
      });
    }
  }

  /** Executes CEO-authorised actions. Returns a note for the waiting agent. */
  private async applySideEffects(a: Approval, input: { outcome: ApprovalOutcome }): Promise<string> {
    const approved = input.outcome === "approved";
    switch (a.kind) {
      case "budget_overrun": {
        // Blocked jobs wait on this approval; JobEngine.onApprovalDecided resumes or fails them.
        if (!approved) return "";
        // decide() recorded the granted amount (explicit or suggested) on the payload.
        const extra = Number(a.payload.grantedExtraCredits ?? 0);
        if (a.payload.budgetId && extra > 0)
          await this.app.budget.grantExtra(String(a.payload.budgetId), extra);
        return a.decisionComment ?? `Budget extended by ${extra} credits.`;
      }
      case "merge_to_main":
        return approved ? this.app.delivery.mergeRelease(a) : "";
      case "prod_deploy":
        return approved
          ? this.app.delivery.approveProductionDeployment(a)
          : this.app.delivery.rejectProductionDeployment(a);
      case "hire":
        if (approved && typeof a.payload.roleId === "string") {
          const agent = await this.app.org.hire(
            a.payload.roleId,
            typeof a.payload.name === "string" ? a.payload.name : undefined,
          );
          return `Hired ${agent.name}.`;
        }
        return "";
      case "spec":
      case "architecture":
        return approved
          ? this.app.github
              .publishDocuments(a)
              .catch((err) => `Documents not published to the repository: ${(err as Error).message}`)
          : "";
      default:
        return "";
    }
  }

  async list(status?: ApprovalStatus, limit = 100): Promise<Approval[]> {
    return this.app.db
      .select()
      .from(schema.approvals)
      .where(status ? eq(schema.approvals.status, status) : undefined)
      .orderBy(desc(schema.approvals.updatedAt))
      .limit(limit);
  }

  async summaries(rows: Approval[]): Promise<ApprovalSummaryDTO[]> {
    const iniIds = [...new Set(rows.map((r) => r.initiativeId).filter((x): x is string => Boolean(x)))];
    const agentIds = [
      ...new Set(rows.map((r) => r.requestedByAgentId).filter((x): x is string => Boolean(x))),
    ];
    const [inis, agents] = await Promise.all([
      iniIds.length
        ? this.app.db
            .select({ id: schema.initiatives.id, title: schema.initiatives.title })
            .from(schema.initiatives)
            .where(inArray(schema.initiatives.id, iniIds))
        : [],
      agentIds.length
        ? this.app.db
            .select({ id: schema.agents.id, name: schema.agents.name })
            .from(schema.agents)
            .where(inArray(schema.agents.id, agentIds))
        : [],
    ]);
    const ini = new Map(inis.map((i) => [i.id, i.title]));
    const ag = new Map(agents.map((a) => [a.id, a.name]));
    return rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      status: a.status,
      title: a.title,
      summary: a.summary,
      initiativeId: a.initiativeId,
      initiativeTitle: a.initiativeId ? (ini.get(a.initiativeId) ?? null) : null,
      requestedBy: a.requestedByAgentId
        ? (ag.get(a.requestedByAgentId) ?? null)
        : a.kind === "budget_overrun"
          ? "Budget guard"
          : null,
      round: a.round,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
      decisionComment: a.decisionComment,
    }));
  }

  async detail(id: string): Promise<ApprovalDetailDTO> {
    const a = await this.get(id);
    const [summary] = await this.summaries([a]);
    const documents = await Promise.all(a.documentIds.map((d) => this.app.docs.detail(d).catch(() => null)));
    const decisions = await this.app.db
      .select()
      .from(schema.approvalDecisions)
      .where(eq(schema.approvalDecisions.approvalId, id))
      .orderBy(schema.approvalDecisions.createdAt);
    return {
      ...summary!,
      payload: a.payload,
      documents: documents.filter((d): d is NonNullable<typeof d> => d !== null),
      decisions: decisions.map((d) => ({
        outcome: d.outcome,
        comment: d.comment,
        round: d.round,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  /** Latest approval of a kind for an initiative. */
  async latest(initiativeId: string, kind: ApprovalKind): Promise<Approval | null> {
    const [row] = await this.app.db
      .select()
      .from(schema.approvals)
      .where(and(eq(schema.approvals.initiativeId, initiativeId), eq(schema.approvals.kind, kind)))
      .orderBy(desc(schema.approvals.updatedAt))
      .limit(1);
    return row ?? null;
  }

  /** The approved gate of `kind` for the initiative's `stage`, if the CEO already approved it. */
  async approvedGate(initiativeId: string, kind: ApprovalKind, stage: string): Promise<Approval | null> {
    const [row] = await this.app.db
      .select()
      .from(schema.approvals)
      .where(
        and(
          eq(schema.approvals.initiativeId, initiativeId),
          eq(schema.approvals.kind, kind),
          eq(schema.approvals.status, "approved"),
          sql`${schema.approvals.payload}->>'stage' = ${stage}`,
        ),
      )
      .orderBy(desc(schema.approvals.decidedAt))
      .limit(1);
    return row ?? null;
  }
}
