import { and, desc, eq, inArray } from "drizzle-orm";
import {
  DomainError,
  GATE_LABELS,
  isGateEnabled,
  type ApprovalDetailDTO,
  type ApprovalKind,
  type ApprovalOutcome,
  type ApprovalStatus,
  type ApprovalSummaryDTO,
} from "@techgens/core";
import { schema, type Approval } from "@techgens/db";
import type { Techgens } from "../app";

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
    // A revised submission after "changes requested" continues the same approval as a new round.
    let approval: Approval | undefined;
    if (input.initiativeId) {
      const [prev] = await db
        .select()
        .from(schema.approvals)
        .where(and(eq(schema.approvals.initiativeId, input.initiativeId), eq(schema.approvals.kind, input.kind), inArray(schema.approvals.status, ["changes_requested", "pending"])))
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
      const decided = await this.decide(approval!.id, { outcome: "approved", comment: "Auto-approved: gate disabled in the CEO's gate policy." }, "system");
      return { approval: decided, autoApproved: true };
    }
    await this.app.bus.emit({
      type: "approval.requested",
      actorType: input.requestedByAgentId ? "agent" : "system",
      actorId: input.requestedByAgentId ?? null,
      subjectType: "approval",
      subjectId: approval!.id,
      summary: `${GATE_LABELS[input.kind]}: ${input.title}`,
      data: { kind: input.kind, initiativeId: input.initiativeId ?? null, round: approval!.round },
    });
    await this.app.notifications.notify({ kind: "approval", title: `Approval needed — ${GATE_LABELS[input.kind]}`, body: input.title, link: `/approvals?id=${approval!.id}` });
    return { approval: approval!, autoApproved: false };
  }

  async decide(id: string, input: { outcome: ApprovalOutcome; comment?: string; extraCredits?: number }, actor: "ceo" | "system" = "ceo"): Promise<Approval> {
    const approval = await this.get(id);
    if (approval.status !== "pending") throw new DomainError(`approval is already ${approval.status}`, "conflict");
    const comment = input.comment?.trim() ?? "";
    if (actor === "ceo" && input.outcome !== "approved" && !comment) throw new DomainError("please explain what should change (comment required)");
    const status: ApprovalStatus = input.outcome;
    const [updated] = await this.app.db
      .update(schema.approvals)
      .set({ status, decisionComment: comment || null, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.approvals.id, id))
      .returning();
    await this.app.db.insert(schema.approvalDecisions).values({ approvalId: id, outcome: input.outcome, comment, actorType: actor, round: approval.round });
    if (approval.initiativeId) {
      await this.app.db.insert(schema.decisions).values({
        initiativeId: approval.initiativeId,
        type: actor === "system" ? "event" : "decision",
        summary: `${actor === "ceo" ? "CEO" : "Policy"} ${input.outcome.replace("_", " ")}: ${GATE_LABELS[approval.kind]} — ${approval.title}`,
        details: comment,
        actorType: actor,
      });
    }
    await this.app.docs.setStatus(approval.documentIds, input.outcome === "approved" ? "approved" : "draft");

    let note = "";
    try {
      note = await this.applySideEffects(updated!, input);
    } catch (err) {
      note = `Follow-up action failed: ${(err as Error).message}`;
      this.app.log.error({ err, approvalId: id }, "approval side effect failed");
    }
    await this.app.bus.emit({
      type: "approval.decided",
      actorType: actor,
      subjectType: "approval",
      subjectId: id,
      summary: `${GATE_LABELS[approval.kind]} ${input.outcome.replace("_", " ")}: ${approval.title}`,
      data: { kind: approval.kind, outcome: input.outcome, initiativeId: approval.initiativeId },
    });
    await this.app.engine.onApprovalDecided(updated!, input.outcome, comment, note);
    await this.app.lifecycle.onApprovalDecided(updated!, input.outcome, comment);
    return updated!;
  }

  /** Executes CEO-authorised actions. Returns a note for the waiting agent. */
  private async applySideEffects(a: Approval, input: { outcome: ApprovalOutcome; extraCredits?: number }): Promise<string> {
    const approved = input.outcome === "approved";
    switch (a.kind) {
      case "budget_overrun": {
        // Blocked jobs wait on this approval; JobEngine.onApprovalDecided resumes or fails them.
        if (!approved) return "";
        const extra = input.extraCredits ?? Number(a.payload.suggestedExtraCredits ?? 0);
        if (a.payload.budgetId && extra > 0) await this.app.budget.grantExtra(String(a.payload.budgetId), extra);
        return `Budget extended by ${extra} credits.`;
      }
      case "merge_to_main":
        return approved ? this.app.delivery.mergeRelease(a) : "";
      case "prod_deploy":
        return approved ? this.app.delivery.approveProductionDeployment(a) : this.app.delivery.rejectProductionDeployment(a);
      case "hire":
        if (approved && typeof a.payload.roleId === "string") {
          const agent = await this.app.org.hire(a.payload.roleId, typeof a.payload.name === "string" ? a.payload.name : undefined);
          return `Hired ${agent.name}.`;
        }
        return "";
      case "spec":
      case "architecture":
        return approved ? this.app.github.publishDocuments(a).catch((err) => `Documents not published to the repository: ${(err as Error).message}`) : "";
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
    const agentIds = [...new Set(rows.map((r) => r.requestedByAgentId).filter((x): x is string => Boolean(x)))];
    const [inis, agents] = await Promise.all([
      iniIds.length ? this.app.db.select({ id: schema.initiatives.id, title: schema.initiatives.title }).from(schema.initiatives).where(inArray(schema.initiatives.id, iniIds)) : [],
      agentIds.length ? this.app.db.select({ id: schema.agents.id, name: schema.agents.name }).from(schema.agents).where(inArray(schema.agents.id, agentIds)) : [],
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
      requestedBy: a.requestedByAgentId ? (ag.get(a.requestedByAgentId) ?? null) : a.kind === "budget_overrun" ? "Budget guard" : null,
      round: a.round,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
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
      decisions: decisions.map((d) => ({ outcome: d.outcome, comment: d.comment, round: d.round, createdAt: d.createdAt.toISOString() })),
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
}
