import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  DomainError,
  GATE_LABELS,
  LIFECYCLE_STAGES,
  STAGES,
  gatedStage,
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
  /** Existing product to attach (matched by name) or new product to create. */
  productName?: string;
  /**
   * Without `productId`/`productName`, create a product named after the title (default, e.g. the CEO's form). Agents pass
   * false: they only attach a product when the directive implies one (otherwise the repository stages are skipped).
   */
  createProduct?: boolean;
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
    if (!productId && (input.productName?.trim() || input.createProduct !== false)) {
      const name = input.productName?.trim() || input.title;
      const product =
        (await this.app.company.findProductByName(name)) ??
        (await this.app.company.createProduct({ name, description: input.summary ?? input.directive }));
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
      await this.app.budget.upsertBudgets([
        { scope: "initiative", scopeId: ini!.id, period: "total", limitCredits: input.budgetCredits },
      ]);
    }
    await this.app.db.insert(schema.decisions).values({
      initiativeId: ini!.id,
      type: "event",
      summary: "Initiative created from CEO directive",
      details: input.directive,
      actorType: input.createdByAgentId ? "agent" : "ceo",
      actorAgentId: input.createdByAgentId ?? null,
    });
    await this.app.bus.emit({
      type: "initiative.created",
      subjectType: "initiative",
      subjectId: ini!.id,
      summary: ini!.title,
      data: { productId },
    });
    await this.startStage(ini!, "intake");
    return this.get(ini!.id);
  }

  async stageWorkItem(initiativeId: string, stage: LifecycleStage): Promise<WorkItem | null> {
    const [row] = await this.app.db
      .select()
      .from(schema.workItems)
      .where(
        and(
          eq(schema.workItems.initiativeId, initiativeId),
          eq(schema.workItems.kind, "stage"),
          eq(schema.workItems.stage, stage),
        ),
      )
      .orderBy(desc(schema.workItems.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Starts (or, with `restart`, re-runs) a stage: one stage work item per stage and a job for its owner. */
  async startStage(
    ini: Initiative,
    stage: LifecycleStage,
    feedback?: string,
    options: { restart?: boolean } = {},
  ): Promise<Job | null> {
    const def = STAGES[stage];
    const product = ini.productId ? await this.app.company.getProduct(ini.productId) : null;
    await this.app.db
      .update(schema.initiatives)
      .set({ stage, updatedAt: new Date() })
      .where(eq(schema.initiatives.id, ini.id));
    if (options.restart) {
      await this.app.bus.emit({
        type: "initiative.updated",
        subjectType: "initiative",
        subjectId: ini.id,
        summary: `${ini.title}: ${def.title} restarted`,
        data: { stage },
      });
    } else {
      await this.app.bus.emit({
        type: "initiative.stage_changed",
        subjectType: "initiative",
        subjectId: ini.id,
        summary: `${ini.title} → ${def.title}`,
        data: { stage },
      });
    }

    if (def.requiresRepo && product && !product.repoOwner) {
      try {
        await this.app.github.bootstrapProductRepo(product.id);
      } catch (err) {
        await this.pause(ini.id, `Repository setup needed: ${(err as Error).message}`);
        return null;
      }
    }
    const owner =
      (await this.app.org.agentForRole(def.ownerRole)) ?? (await this.app.org.agentForRole("chief-of-staff"));
    if (!owner) throw new DomainError(`no agent available for ${def.ownerRole}`, "unavailable");
    // A re-run (resume, rejected gate) continues the stage's existing work item instead of listing the stage twice.
    const existing = await this.stageWorkItem(ini.id, stage);
    const item =
      existing && existing.status !== "done"
        ? await this.app.work.update(existing.id, {
            status: "in_progress",
            assigneeAgentId: owner.id,
            completedAt: null,
          })
        : await this.app.work.create({
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
    return this.app.engine.createJob({
      agentId: owner.id,
      workItemId: item.id,
      initiativeId: ini.id,
      prompt,
      kind: "work",
    });
  }

  async milestones(initiativeId: string) {
    return this.app.db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.initiativeId, initiativeId))
      .orderBy(asc(schema.milestones.sortOrder));
  }

  /** Called when a stage owner's job finishes. Enforces gates even if the agent did not request approval. */
  async onStageJobFinished(job: Job, item: WorkItem): Promise<void> {
    if (!item.initiativeId || !item.stage) return;
    const ini = await this.get(item.initiativeId);
    if (ini.status !== "active" || ini.stage !== item.stage) return;
    if (job.status !== "succeeded" || job.result?.outcome === "blocked") {
      await this.app.notifications.notify({
        kind: "escalation",
        title: `${ini.title}: ${STAGES[item.stage].title} is blocked`,
        body: job.error ?? job.result?.summary ?? "",
        link: `/initiatives/${ini.id}`,
      });
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
    const docs = (await this.app.docs.list({ initiativeId: ini.id })).filter((d) =>
      kinds.includes(d.kind as never),
    );
    const evidence = await this.app.delivery.gateEvidence(gate, ini, {});
    await this.app.approvals.request({
      kind: gate,
      title: `${STAGES[item.stage].title} — ${ini.title}`,
      summary: job.result?.summary ?? "Stage completed.",
      initiativeId: ini.id,
      workItemId: item.id,
      jobId: job.id,
      documentIds: [...new Set([...docs.map((d) => d.id), ...evidence.documentIds])],
      requestedByAgentId: job.agentId,
      payload: { stage: item.stage, ...evidence.payload },
    });
  }

  /** Stage-gate decisions: rejections pause the initiative; other outcomes of engine-created gates move the stage on. */
  async onApprovalDecided(a: Approval, outcome: ApprovalOutcome, comment: string): Promise<void> {
    const stage = gatedStage(a.kind, a.payload);
    if (!a.initiativeId || !stage) return;
    if (outcome === "rejected") return this.onGateRejected(a, stage, comment);
    if (a.jobId) {
      const job = await this.app.engine.getJob(a.jobId);
      if (job.status === "waiting" || job.status === "queued" || job.status === "running") return; // engine resumes the job
    }
    const ini = await this.get(a.initiativeId);
    if (ini.stage !== stage) return;
    if (outcome === "approved") {
      // While paused, resume() moves the stage on (the finished stage job sees the approved gate).
      if (ini.status === "active") return this.advance(ini.id);
      return;
    }
    if (ini.status !== "active" && ini.status !== "paused") return;
    // While paused the reopened job stays queued until resume() dispatches it, so the feedback isn't lost.
    if (a.jobId)
      await this.app.engine.reopenJob(
        a.jobId,
        `The CEO requested changes before approving "${a.title}":\n\n${comment}\n\nRevise your deliverables, then call complete_task (the gate will be requested again).`,
      );
  }

  /**
   * The CEO rejected a stage gate: the initiative is paused with the reason (no zombie "active" initiative) and the work
   * that produced the proposal stops. Resuming restarts the stage with the CEO's feedback (see `resume`).
   */
  private async onGateRejected(a: Approval, stage: LifecycleStage, comment: string): Promise<void> {
    const ini = await this.get(a.initiativeId!);
    const live = ini.stage === stage && (ini.status === "active" || ini.status === "paused");
    if (live)
      await this.pause(ini.id, `Rejected at ${GATE_LABELS[a.kind]}: ${comment}`, {
        rejectedApprovalId: a.id,
        force: true,
      });
    const item = await this.stageWorkItem(ini.id, stage);
    const owners = [
      item ? eq(schema.jobs.workItemId, item.id) : undefined,
      a.jobId ? eq(schema.jobs.id, a.jobId) : undefined,
    ].filter((c) => c !== undefined);
    if (owners.length) {
      const open = await this.app.db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(inArray(schema.jobs.status, ["queued", "running", "waiting"]), or(...owners)));
      const reason = `${GATE_LABELS[a.kind]} rejected by the CEO${live ? " — the stage restarts with the feedback when the initiative is resumed" : ""}`;
      for (const j of open) await this.app.engine.cancelJob(j.id, reason);
    }
    if (live && item && item.status !== "done") await this.app.work.update(item.id, { status: "blocked" });
  }

  async advance(initiativeId: string): Promise<void> {
    const ini = await this.get(initiativeId);
    const item = await this.stageWorkItem(ini.id, ini.stage);
    if (item && item.status !== "done") await this.app.work.update(item.id, { status: "done" });
    const next = nextStage(ini.stage, { skip: ini.skipStages, hasRepo: Boolean(ini.productId) });
    if (!next) {
      await this.app.db
        .update(schema.initiatives)
        .set({ status: "completed", statusReason: null, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.initiatives.id, ini.id));
      // Milestones carry no stage mapping; a completed initiative delivered all of them.
      await this.app.db
        .update(schema.milestones)
        .set({ status: "done" })
        .where(and(eq(schema.milestones.initiativeId, ini.id), ne(schema.milestones.status, "done")));
      // Earlier paused/blocked notices are stale now; only the completion notice below is news.
      await this.app.notifications.markInitiativeRead(ini.id);
      await this.app.bus.emit({
        type: "initiative.updated",
        subjectType: "initiative",
        subjectId: ini.id,
        summary: `${ini.title} completed 🎉`,
        data: { status: "completed" },
      });
      await this.app.notifications.notify({
        kind: "initiative",
        title: `${ini.title} completed`,
        link: `/initiatives/${ini.id}`,
      });
      return;
    }
    await this.startStage(ini, next);
  }

  /** Sets the status and its human-readable reason (null clears it); a rejected gate is remembered for `resume`. */
  async setStatus(
    id: string,
    status: InitiativeStatus,
    reason: string | null = null,
    options: { rejectedApprovalId?: string } = {},
  ): Promise<Initiative> {
    const ini = await this.get(id);
    // `pausedReason` is the pre-`status_reason` location of the reason (see migration 0001).
    const {
      rejectedApprovalId: _previous,
      pausedReason: _legacy,
      ...metadata
    } = ini.metadata as Initiative["metadata"] & { pausedReason?: string };
    const [row] = await this.app.db
      .update(schema.initiatives)
      .set({
        status,
        statusReason: reason,
        updatedAt: new Date(),
        metadata: options.rejectedApprovalId
          ? { ...metadata, rejectedApprovalId: options.rejectedApprovalId }
          : metadata,
      })
      .where(eq(schema.initiatives.id, id))
      .returning();
    await this.app.bus.emit({
      type: "initiative.updated",
      subjectType: "initiative",
      subjectId: id,
      summary: `${ini.title} ${status}${reason ? `: ${reason}` : ""}`,
      data: { status, statusReason: reason },
    });
    return row!;
  }

  /** Pauses an active initiative. `force` also replaces the reason of an already paused one (e.g. a rejected gate). */
  async pause(
    id: string,
    reason: string,
    options: { rejectedApprovalId?: string; force?: boolean } = {},
  ): Promise<Initiative> {
    const ini = await this.get(id);
    if (ini.status === "cancelled" || ini.status === "completed")
      throw new DomainError(`the initiative is ${ini.status}`, "conflict");
    if (ini.status === "paused" && !options.force) return ini;
    const row = await this.setStatus(id, "paused", reason, options);
    await this.app.notifications.notify({
      kind: "initiative",
      title: `${row.title} paused`,
      body: reason,
      link: `/initiatives/${id}`,
    });
    return row;
  }

  /**
   * Resumes a paused initiative without duplicating work: queued jobs are re-dispatched; if the stage owner has no open
   * job, a stage that finished while paused moves on, a rejected stage restarts with the CEO's feedback and any other
   * stage restarts where it stopped.
   */
  async resume(id: string): Promise<Initiative> {
    const ini = await this.get(id);
    if (ini.status === "active") return ini;
    if (ini.status === "cancelled" || ini.status === "completed")
      throw new DomainError(`a ${ini.status} initiative can't be resumed`, "conflict");
    const remembered = ini.metadata.rejectedApprovalId
      ? await this.app.approvals.get(ini.metadata.rejectedApprovalId).catch(() => null)
      : null;
    // Initiatives paused by a rejection before `rejectedApprovalId` existed: the stage's latest gate is still rejected.
    const gate = STAGES[ini.stage].gate;
    const latestGate = !remembered && gate ? await this.app.approvals.latest(id, gate) : null;
    const rejected = remembered ?? (latestGate?.status === "rejected" ? latestGate : null);
    const row = await this.setStatus(id, "active");
    // Its "paused"/"blocked" notices are no longer actionable once the CEO resumed it.
    await this.app.notifications.markInitiativeRead(id);
    const open = await this.app.db
      .select()
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.initiativeId, id), inArray(schema.jobs.status, ["queued", "running", "waiting"])),
      );
    await this.app.engine.requeueJobs(open.filter((j) => j.status === "queued").map((j) => j.id));
    const item = await this.stageWorkItem(id, ini.stage);
    if (item && open.some((j) => j.workItemId === item.id)) return this.get(id);
    if (rejected?.status === "rejected") {
      await this.startStage(row, ini.stage, rejectionFeedback(rejected), { restart: true });
      return this.get(id);
    }
    const [last] = item
      ? await this.app.db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.workItemId, item.id))
          .orderBy(desc(schema.jobs.createdAt))
          .limit(1)
      : [];
    if (item && last?.status === "succeeded" && last.result?.outcome !== "blocked")
      await this.onStageJobFinished(last, item);
    else
      await this.startStage(row, ini.stage, "The initiative was resumed by the CEO; continue this stage.", {
        restart: true,
      });
    return this.get(id);
  }

  /** Cancels the initiative: stops its jobs, withdraws its open gates from the CEO inbox and closes unfinished work. */
  async cancel(id: string): Promise<Initiative> {
    const ini = await this.get(id);
    if (ini.status === "cancelled") return ini;
    if (ini.status === "completed")
      throw new DomainError("a completed initiative can't be cancelled", "conflict");
    // Status first, so jobs finishing below don't trigger stage follow-ups (escalations, new gates).
    await this.setStatus(id, "cancelled", "Cancelled by the CEO");
    const jobs = await this.app.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.initiativeId, id), inArray(schema.jobs.status, ["queued", "running", "waiting"])),
      );
    for (const j of jobs) await this.app.engine.cancelJob(j.id, "Initiative cancelled by the CEO");
    await this.app.approvals.withdraw(id, "Withdrawn — the initiative was cancelled.");
    const unfinished = (await this.app.work.list({ initiativeId: id })).filter(
      (w) => w.status !== "done" && w.status !== "cancelled",
    );
    for (const w of unfinished) await this.app.work.update(w.id, { status: "cancelled" });
    await this.app.notifications.markInitiativeRead(id);
    return this.get(id);
  }

  async update(
    id: string,
    patch: { title?: string; summary?: string; targetDate?: string | null; budgetCredits?: number | null },
  ): Promise<Initiative> {
    await this.get(id);
    const values: Partial<Initiative> = { updatedAt: new Date() };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.summary !== undefined) values.summary = patch.summary;
    if (patch.targetDate !== undefined)
      values.targetDate = patch.targetDate ? new Date(patch.targetDate) : null;
    if (patch.budgetCredits !== undefined) {
      // One budget record per initiative: the cap is its total budget (also edited on the Budget page), and
      // `budget_credits` follows it (BudgetService syncs the column).
      const cap = await this.app.budget.initiativeCap(id);
      const enforced = cap?.enabled ? cap.limitCredits : null;
      if (patch.budgetCredits === null) {
        if (cap) await this.app.budget.deleteBudget(cap.id);
      } else if (patch.budgetCredits !== enforced) {
        await this.app.budget.upsertBudgets([
          {
            scope: "initiative",
            scopeId: id,
            period: "total",
            limitCredits: patch.budgetCredits,
            warnPct: cap?.warnPct,
          },
        ]);
      }
    }
    const [row] = await this.app.db
      .update(schema.initiatives)
      .set(values)
      .where(eq(schema.initiatives.id, id))
      .returning();
    await this.app.bus.emit({
      type: "initiative.updated",
      subjectType: "initiative",
      subjectId: id,
      summary: `${row!.title} updated`,
    });
    return row!;
  }

  async list(status?: InitiativeStatus): Promise<Initiative[]> {
    return this.app.db
      .select()
      .from(schema.initiatives)
      .where(status ? eq(schema.initiatives.status, status) : undefined)
      .orderBy(desc(schema.initiatives.createdAt));
  }

  async summaries(rows: Initiative[]): Promise<InitiativeSummaryDTO[]> {
    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];
    const [counts, pending, spend, products, caps] = await Promise.all([
      this.app.db
        .select({
          id: schema.workItems.initiativeId,
          status: schema.workItems.status,
          n: sql<number>`count(*)::int`,
        })
        .from(schema.workItems)
        .where(inArray(schema.workItems.initiativeId, ids))
        .groupBy(schema.workItems.initiativeId, schema.workItems.status),
      this.app.db
        .select({ id: schema.approvals.initiativeId, n: sql<number>`count(*)::int` })
        .from(schema.approvals)
        .where(and(inArray(schema.approvals.initiativeId, ids), eq(schema.approvals.status, "pending")))
        .groupBy(schema.approvals.initiativeId),
      this.app.budget.initiativeSpend(ids),
      this.app.company.listProducts(),
      this.app.budget.initiativeCaps(ids),
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
        statusReason: r.statusReason,
        productId: r.productId,
        productName: r.productId ? (productName.get(r.productId) ?? null) : null,
        targetDate: r.targetDate?.toISOString() ?? null,
        // The enforced cap (the initiative's total budget record) and the CEO's grants on it.
        budgetCredits: caps.get(r.id)?.limitCredits ?? null,
        grantedCredits: caps.get(r.id)?.grantedCredits ?? 0,
        spentCredits: spend.get(r.id) ?? 0,
        // Same items as the Work items tab (GET /api/work-items?initiativeId=…), stage items included.
        workItems: {
          total: mine.reduce((a, c) => a + c.n, 0),
          done: n("done"),
          inProgress: n("in_progress") + n("in_review"),
          blocked: n("blocked"),
          cancelled: n("cancelled"),
        },
        pendingApprovals:
          r.status === "cancelled" || r.status === "completed"
            ? 0
            : (pending.find((p) => p.id === r.id)?.n ?? 0),
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
      const state = skipped
        ? "skipped"
        : ini.status === "completed" || i < current
          ? "done"
          : i === current
            ? "active"
            : "pending";
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
      milestones: (await this.milestones(id)).map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        dueDate: m.dueDate?.toISOString() ?? null,
        status: m.status,
        sortOrder: m.sortOrder,
      })),
      documents: await this.app.docs.summaries(await this.app.docs.list({ initiativeId: id })),
      approvals: await this.app.approvals.summaries(
        await this.app.db
          .select()
          .from(schema.approvals)
          .where(eq(schema.approvals.initiativeId, id))
          .orderBy(desc(schema.approvals.createdAt)),
      ),
      decisions: decisions.map(({ d, name }) => ({
        id: d.id,
        initiativeId: d.initiativeId,
        type: d.type,
        summary: d.summary,
        details: d.details,
        actorType: d.actorType,
        actorName: name ?? (d.actorType === "ceo" ? "CEO" : null),
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  async setRoadmap(
    initiativeId: string,
    milestones: Array<{ title: string; description?: string; dueDate?: string }>,
  ): Promise<number> {
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
    await this.app.bus.emit({
      type: "initiative.updated",
      subjectType: "initiative",
      subjectId: initiativeId,
      summary: `Roadmap updated (${milestones.length} milestones)`,
    });
    return milestones.length;
  }
}

/** Guidance for the stage owner when the stage restarts after the CEO rejected its gate. */
function rejectionFeedback(a: Approval): string {
  return [
    `The CEO rejected the previous proposal at the ${GATE_LABELS[a.kind]} gate ("${a.title}") with this feedback:`,
    "",
    `> ${(a.decisionComment ?? "").trim().replace(/\n/g, "\n> ")}`,
    "",
    "Do not resubmit the same proposal. Propose a different approach that addresses this feedback: revise your deliverables (new document versions), then request the gate approval again.",
  ].join("\n");
}
