import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  DomainError,
  TERMINAL_JOB_STATUSES,
  formatCredits,
  gatedStage,
  nanoToCredits,
  truncate,
  type ApprovalOutcome,
  type BudgetDTO,
  type BudgetOverrunPayload,
  type JobDTO,
  type JobStatus,
} from "@techgens/core";
import { schema, type Agent, type Approval, type Job, type JobResult, type Role } from "@techgens/db";
import { RuntimeUnavailableError } from "@techgens/runtime";
import type { Techgens } from "../app";
import { fmtCredits, windowEndText } from "../services/budget";
import { runJobTurns } from "./runner";

export interface JobDispatcher {
  enqueue(jobId: string, delaySeconds?: number): Promise<void>;
}

/** Test/demo dispatcher: jobs are processed by `engine.runUntilIdle()`. */
export class ManualDispatcher implements JobDispatcher {
  readonly enqueued: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.enqueued.push(jobId);
  }
}

export interface CreateJobInput {
  agentId: string;
  prompt: string;
  workItemId?: string | null;
  initiativeId?: string | null;
  parentJobId?: string | null;
  kind?: "work" | "chat" | "routine";
  depth?: number;
  threadId?: string | null;
}

/** Mutable state of the turn currently executing for a job (set by tool handlers). */
export interface TurnState {
  completed?: { summary: string; outcome: "done" | "blocked"; followUps: string[] };
  awaitingApprovalId?: string;
  delegatedJobIds: string[];
  codingAssigned: boolean;
  budgetExhausted: boolean;
}

const isTerminal = (s: JobStatus) => TERMINAL_JOB_STATUSES.includes(s);

export class JobEngine {
  readonly turnStates = new Map<string, TurnState>();
  readonly aborts = new Map<string, AbortController>();
  private runtimeWarned = false;

  constructor(
    readonly app: Techgens,
    readonly dispatcher: JobDispatcher,
  ) {}

  async createJob(input: CreateJobInput): Promise<Job> {
    const job = await this.app.db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.id, input.agentId))
        .for("update");
      if (!agent || agent.status === "retired")
        throw new DomainError("Cannot assign a job to a retired or missing agent.", "conflict");
      const [created] = await tx
        .insert(schema.jobs)
        .values({
          agentId: input.agentId,
          prompt: input.prompt,
          workItemId: input.workItemId ?? null,
          initiativeId: input.initiativeId ?? null,
          parentJobId: input.parentJobId ?? null,
          kind: input.kind ?? "work",
          depth: input.depth ?? 0,
          threadId: input.threadId ?? null,
        })
        .returning();
      return created!;
    });
    await this.emit(job!, "job.queued", `Assignment queued`);
    await this.dispatcher.enqueue(job!.id);
    return job!;
  }

  async getJob(id: string): Promise<Job> {
    const [row] = await this.app.db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!row) throw new DomainError("job not found", "not_found");
    return row;
  }

  turnState(jobId: string): TurnState {
    let s = this.turnStates.get(jobId);
    if (!s) {
      s = { delegatedJobIds: [], codingAssigned: false, budgetExhausted: false };
      this.turnStates.set(jobId, s);
    }
    return s;
  }

  private async emit(
    job: Job,
    type: "job.queued" | "job.started" | "job.waiting" | "job.completed" | "job.failed" | "job.cancelled",
    summary: string,
    data: Record<string, unknown> = {},
  ) {
    await this.app.bus.emit({
      type,
      actorType: "agent",
      actorId: job.agentId,
      subjectType: "job",
      subjectId: job.id,
      summary,
      data: {
        initiativeId: job.initiativeId,
        workItemId: job.workItemId,
        kind: job.kind,
        threadId: job.threadId,
        ...data,
      },
    });
  }

  /** Executes a queued job (called by the dispatcher worker). Safe to call concurrently/redundantly. */
  async processJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId).catch(() => null);
    if (!job || job.status !== "queued") return;
    if (await this.app.settings.get("systemPaused")) return void (await this.dispatcher.enqueue(jobId, 30));
    const { agent, role } = await this.app.org.agentWithRole(job.agentId);
    if (agent.status !== "active") return; // re-queued when the agent is resumed
    if (job.initiativeId) {
      const ini = await this.app.lifecycle.get(job.initiativeId);
      if (ini.status === "cancelled")
        return void (await this.finish(job, "cancelled", undefined, "Initiative cancelled"));
      if (ini.status === "paused" && job.kind !== "chat") return;
    }
    if (job.kind !== "chat") {
      const [busy] = await this.app.db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.agentId, agent.id),
            eq(schema.jobs.status, "running"),
            sql`${schema.jobs.kind} <> 'chat'`,
          ),
        )
        .limit(1);
      if (busy) return void (await this.dispatcher.enqueue(jobId, 10));
    }
    const over = await this.app.budget.check(agent, role, job);
    if (over) return this.blockOnBudget(job, over);

    const [claimed] = await this.app.db
      .update(schema.jobs)
      .set({
        status: "running",
        attempts: sql`${schema.jobs.attempts} + 1`,
        startedAt: job.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "queued")))
      .returning();
    if (!claimed) return;
    await this.emit(claimed, "job.started", `${agent.name} started working`);
    const abort = new AbortController();
    this.aborts.set(jobId, abort);
    this.turnStates.delete(jobId);
    try {
      await runJobTurns(this, claimed, agent, role, abort.signal);
    } catch (err) {
      await this.handleError(claimed, agent, err as Error);
    } finally {
      this.aborts.delete(jobId);
      this.turnStates.delete(jobId);
    }
  }

  private async handleError(job: Job, agent: Agent, err: Error): Promise<void> {
    const current = await this.getJob(job.id);
    if (isTerminal(current.status)) return;
    if (err instanceof RuntimeUnavailableError) {
      await this.app.db
        .update(schema.jobs)
        .set({ status: "queued", attempts: sql`greatest(${schema.jobs.attempts} - 1, 0)` })
        .where(eq(schema.jobs.id, job.id));
      if (!this.runtimeWarned) {
        this.runtimeWarned = true;
        await this.app.notifications.notify({
          kind: "system",
          title: "Agents are waiting for GitHub",
          body: err.message,
          link: "/settings",
        });
      }
      return void (await this.dispatcher.enqueue(job.id, 60));
    }
    this.app.log.warn({ jobId: job.id, err: err.message }, "agent turn failed");
    if (current.attempts < 2) {
      await this.app.db
        .update(schema.jobs)
        .set({ status: "queued", error: err.message, updatedAt: new Date() })
        .where(eq(schema.jobs.id, job.id));
      return void (await this.dispatcher.enqueue(job.id, 30));
    }
    await this.finish(
      current,
      "failed",
      undefined,
      `${agent.name} could not complete the assignment: ${err.message}`,
    );
  }

  private async blockOnBudget(job: Job, budget: BudgetDTO): Promise<void> {
    const [pending] = await this.app.db
      .select()
      .from(schema.approvals)
      .where(
        and(
          eq(schema.approvals.kind, "budget_overrun"),
          eq(schema.approvals.status, "pending"),
          sql`${schema.approvals.payload}->>'budgetId' = ${budget.id}`,
        ),
      )
      .limit(1);
    let approval: Approval | undefined = pending;
    if (pending) {
      const jobIds = [...new Set([...((pending.payload.jobIds as string[]) ?? []), job.id])];
      await this.app.db
        .update(schema.approvals)
        .set({ payload: { ...pending.payload, jobIds, spentCredits: budget.spentCredits } })
        .where(eq(schema.approvals.id, pending.id));
    } else {
      const scopeName = await this.app.budget.scopeName(budget.scope, budget.scopeId);
      await this.app.bus.emit({
        type: "budget.exceeded",
        subjectType: "budget",
        subjectId: budget.id,
        summary: `${scopeName} ${budget.period} budget exceeded`,
        data: { ...budget, scopeLabel: scopeName },
      });
      const limit = budget.limitCredits + budget.grantedCredits;
      const suggested = Math.max(10, Math.round(limit * 0.5));
      const windowEnd = windowEndText(budget.period, budget.windowEndsAt);
      const payload: BudgetOverrunPayload = {
        risk: `Granting credits raises the enforced ${budget.scope} ${budget.period} cap and allows blocked jobs to resume. ${windowEnd ? `The extra grant expires at ${windowEnd}.` : "A total-budget grant does not expire."} Other budget caps still apply; a grant does not guarantee completion.`,
        recommendation:
          "Review spend by agent and the remaining work before granting the smallest useful amount. The suggested amount is a heuristic, not a forecast of the credits needed to finish.",
        spendByAgent: await this.app.budget.spendByAgent(budget),
        budgetId: budget.id,
        jobIds: [job.id],
        scope: budget.scope,
        scopeName,
        period: budget.period,
        limitCredits: budget.limitCredits,
        grantedCredits: budget.grantedCredits,
        spentCredits: budget.spentCredits,
        windowEndsAt: budget.windowEndsAt,
        suggestedExtraCredits: suggested,
      };
      approval = (
        await this.app.approvals.request({
          kind: "budget_overrun",
          title: `${scopeName}: ${budget.period} budget exceeded`,
          summary: `Spent ${fmtCredits(budget.spentCredits)} of ${fmtCredits(limit)} AI credits (${budget.scope} · ${budget.period}${budget.grantedCredits ? `, incl. ${fmtCredits(budget.grantedCredits)} already granted` : ""}). Work is paused until you grant extra credits${windowEnd ? `; a grant lasts until ${windowEnd}` : " (a grant adds to the total budget)"}. Suggested: ${suggested}.`,
          // Only an initiative's own budget belongs to that initiative; company/agent/department overruns block any job.
          initiativeId: budget.scope === "initiative" ? budget.scopeId : null,
          payload: { ...payload },
        })
      ).approval;
    }
    if (approval!.status === "approved") return void (await this.dispatcher.enqueue(job.id, 1));
    await this.app.db
      .update(schema.jobs)
      .set({
        status: "waiting",
        waitReason: "approval",
        waitState: { approvalId: approval!.id },
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
    await this.emit(job, "job.waiting", "Waiting for a budget decision", {
      waitReason: "approval",
      approvalId: approval!.id,
    });
  }

  // ---- State transitions ---------------------------------------------------------------------------------------

  async setWaiting(
    job: Job,
    reason: "children" | "approval" | "external",
    waitState: Job["waitState"],
  ): Promise<void> {
    await this.app.db
      .update(schema.jobs)
      .set({ status: "waiting", waitReason: reason, waitState, updatedAt: new Date() })
      .where(eq(schema.jobs.id, job.id));
    await this.emit(
      job,
      "job.waiting",
      reason === "children"
        ? "Waiting for delegated work"
        : reason === "approval"
          ? "Waiting for CEO approval"
          : "Waiting for coding agents",
      { waitReason: reason },
    );
    if (reason === "children") await this.maybeResumeParent(job.id);
  }

  /** Atomically moves a waiting job back to the queue with a message for its next turn. */
  /**
   * Atomically moves a job back to the queue with a message for its next turn. A message that was not delivered yet
   * (e.g. "the CEO approved…" while the job then waited on a budget decision) is kept: new messages are appended.
   */
  async resume(jobId: string, message: string | null, from: JobStatus[] = ["waiting"]): Promise<boolean> {
    const [row] = await this.app.db
      .update(schema.jobs)
      .set({
        status: "queued",
        ...(message === null
          ? {}
          : {
              resumeMessage: sql`case when coalesce(${schema.jobs.resumeMessage}, '') = '' then ${message} else ${schema.jobs.resumeMessage} || ${"\n\n"} || ${message} end`,
            }),
        waitReason: null,
        waitState: {},
        resumeCount: sql`${schema.jobs.resumeCount} + 1`,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.jobs.id, jobId), inArray(schema.jobs.status, from)))
      .returning();
    if (!row) return false;
    await this.emit(row, "job.queued", "Resumed");
    await this.dispatcher.enqueue(jobId);
    return true;
  }

  async finish(
    job: Job,
    status: "succeeded" | "failed" | "cancelled",
    result?: JobResult,
    error?: string,
  ): Promise<void> {
    const [row] = await this.app.db
      .update(schema.jobs)
      .set({
        status,
        result: result ?? null,
        error: error ?? null,
        waitReason: null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id))
      .returning();
    const done = row!;
    await this.emit(
      done,
      status === "succeeded" ? "job.completed" : status === "failed" ? "job.failed" : "job.cancelled",
      truncate(result?.summary ?? error ?? status, 300),
      { status },
    );
    const item = done.workItemId ? await this.app.work.get(done.workItemId).catch(() => null) : null;
    if (item && item.kind !== "stage" && done.kind !== "chat") {
      const blocked = status !== "succeeded" || result?.outcome === "blocked";
      await this.app.work.update(item.id, {
        status: status === "cancelled" ? "cancelled" : blocked ? "blocked" : "done",
        result: { summary: result?.summary ?? error ?? "" },
      });
    }
    if (done.kind === "chat" && done.threadId) {
      await this.app.chat.postAgentReply(
        done.threadId,
        done.agentId,
        result?.summary || error || "(no reply)",
        done.id,
      );
    }
    if (done.parentJobId) await this.maybeResumeParent(done.parentJobId);
    if (item?.kind === "stage") await this.app.lifecycle.onStageJobFinished(done, item);
  }

  /** Resumes a parent waiting on children once all of them are terminal, with their results. */
  async maybeResumeParent(parentId: string): Promise<void> {
    const parent = await this.getJob(parentId);
    if (parent.status !== "waiting" || parent.waitReason !== "children") return;
    const children = await this.app.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.parentJobId, parentId))
      .orderBy(asc(schema.jobs.createdAt));
    if (children.some((c) => !isTerminal(c.status))) return;
    const reportIds = new Set(parent.waitState.childJobIds ?? children.map((c) => c.id));
    const report = children.filter((c) => reportIds.has(c.id));
    const agents = new Map((await this.app.org.listAgentRows()).map((a) => [a.id, a.name]));
    const lines = await Promise.all(
      report.map(async (c) => {
        const item = c.workItemId ? await this.app.work.get(c.workItemId).catch(() => null) : null;
        const text =
          c.status === "succeeded"
            ? (c.result?.summary ?? "done")
            : `${c.status}: ${c.error ?? c.result?.summary ?? ""}`;
        return `- **${agents.get(c.agentId) ?? "agent"}** — ${item?.title ?? "task"} (${c.result?.outcome === "blocked" ? "blocked" : c.status}): ${truncate(text, 1500)}`;
      }),
    );
    await this.resume(
      parentId,
      `Your delegated work has finished:\n${lines.join("\n")}\n\nReview the results (read_document for details) and continue your assignment.`,
    );
  }

  async onApprovalDecided(
    approval: Approval,
    outcome: ApprovalOutcome,
    comment: string,
    note: string,
  ): Promise<void> {
    // A rejected stage gate pauses its initiative and stops the stage's jobs (LifecycleService.onApprovalDecided).
    if (outcome === "rejected" && approval.initiativeId && gatedStage(approval.kind, approval.payload))
      return;
    const waiting = await this.app.db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, "waiting"),
          eq(schema.jobs.waitReason, "approval"),
          sql`${schema.jobs.waitState}->>'approvalId' = ${approval.id}`,
        ),
      );
    for (const job of waiting) {
      if (approval.kind === "budget_overrun") {
        // Jobs that never started have no context to continue; they start with their assignment.
        const granted = formatCredits(Number(approval.payload.grantedExtraCredits ?? 0));
        if (outcome === "approved")
          await this.resume(
            job.id,
            job.sessionId ? `The CEO granted ${granted} extra credits; continue where you left off.` : null,
          );
        else await this.finish(job, "failed", undefined, "Budget overrun was not approved by the CEO.");
        continue;
      }
      const c = comment ? `\n\nCEO comment: ${comment}` : "";
      const n = note ? `\n\n${note}` : "";
      const message =
        outcome === "approved"
          ? `The CEO APPROVED "${approval.title}".${c}${n}\n\nContinue: finish your assignment and call complete_task.`
          : outcome === "changes_requested"
            ? `The CEO REQUESTED CHANGES on "${approval.title}".${c}\n\nRevise your deliverables accordingly (new document versions), then call request_approval again.`
            : `The CEO REJECTED "${approval.title}".${c}\n\nStop work on this and call complete_task with outcome "blocked" summarising the situation.`;
      await this.resume(job.id, message);
    }
  }

  async reopenJob(jobId: string, message: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job.workItemId) await this.app.work.update(job.workItemId, { status: "in_progress" });
    await this.resume(jobId, message, ["succeeded", "failed", "waiting"]);
  }

  async cancelJob(jobId: string, reason = "Cancelled by the CEO"): Promise<Job> {
    const job = await this.getJob(jobId);
    if (isTerminal(job.status)) return job;
    this.aborts.get(jobId)?.abort();
    await this.finish(job, "cancelled", undefined, reason);
    const children = await this.app.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.parentJobId, jobId),
          inArray(schema.jobs.status, ["queued", "running", "waiting"]),
        ),
      );
    for (const c of children) await this.cancelJob(c.id, reason);
    return this.getJob(jobId);
  }

  async retryJob(jobId: string): Promise<Job> {
    const job = await this.getJob(jobId);
    if (job.status !== "failed" && job.status !== "cancelled")
      throw new DomainError("only failed or cancelled jobs can be retried", "conflict");
    await this.app.db.update(schema.jobs).set({ attempts: 0, error: null }).where(eq(schema.jobs.id, jobId));
    await this.resume(jobId, job.sessionId ? "Please retry your assignment from where you left off." : null, [
      "failed",
      "cancelled",
    ]);
    return this.getJob(jobId);
  }

  async requeueJobs(ids: string[]): Promise<void> {
    for (const id of ids) {
      const job = await this.getJob(id).catch(() => null);
      if (job?.status === "queued") await this.dispatcher.enqueue(id);
    }
  }

  async requeueAgentJobs(agentId: string): Promise<void> {
    const queued = await this.app.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.agentId, agentId), eq(schema.jobs.status, "queued")));
    await this.requeueJobs(queued.map((j) => j.id));
  }

  /** Re-dispatches every queued job (after restart or resume of the system). */
  async requeueAll(): Promise<void> {
    const queued = await this.app.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "queued"));
    await this.requeueJobs(queued.map((j) => j.id));
  }

  /** Jobs left "running" by a crash are re-queued on startup. */
  async recoverInterrupted(): Promise<number> {
    const rows = await this.app.db
      .update(schema.jobs)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(schema.jobs.status, "running"))
      .returning({ id: schema.jobs.id });
    return rows.length;
  }

  /** Processes queued jobs in-process until none are runnable (tests and demo mode). */
  async runUntilIdle(maxJobs = 500): Promise<number> {
    let processed = 0;
    while (processed < maxJobs) {
      const queued = await this.app.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.status, "queued"))
        .orderBy(asc(schema.jobs.updatedAt))
        .limit(20);
      let progressed = false;
      for (const job of queued) {
        await this.processJob(job.id);
        const after = await this.getJob(job.id);
        if (after.status !== "queued" || after.updatedAt.getTime() !== job.updatedAt.getTime())
          progressed = true;
        processed++;
      }
      if (!progressed) break;
    }
    return processed;
  }

  // ---- Queries -------------------------------------------------------------------------------------------------

  async listJobDTOs(
    filter: {
      status?: JobStatus;
      agentId?: string;
      initiativeId?: string;
      workItemId?: string;
      limit?: number;
    } = {},
  ): Promise<JobDTO[]> {
    const where: SQL[] = [];
    if (filter.status) where.push(eq(schema.jobs.status, filter.status));
    if (filter.agentId) where.push(eq(schema.jobs.agentId, filter.agentId));
    if (filter.initiativeId) where.push(eq(schema.jobs.initiativeId, filter.initiativeId));
    if (filter.workItemId) where.push(eq(schema.jobs.workItemId, filter.workItemId));
    const rows = await this.app.db
      .select({
        job: schema.jobs,
        agentName: schema.agents.name,
        roleId: schema.agents.roleId,
        department: schema.roles.department,
        title: schema.workItems.title,
      })
      .from(schema.jobs)
      .innerJoin(schema.agents, eq(schema.jobs.agentId, schema.agents.id))
      .innerJoin(schema.roles, eq(schema.agents.roleId, schema.roles.id))
      .leftJoin(schema.workItems, eq(schema.jobs.workItemId, schema.workItems.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(Math.min(filter.limit ?? 100, 500));
    return rows.map(({ job: j, agentName, roleId, department, title }) => ({
      id: j.id,
      agentId: j.agentId,
      agentName,
      roleId,
      department,
      workItemId: j.workItemId,
      workItemTitle: title ?? (j.kind === "chat" ? "Directive chat" : null),
      initiativeId: j.initiativeId,
      parentJobId: j.parentJobId,
      kind: j.kind,
      status: j.status,
      waitReason: j.waitReason ?? null,
      prompt: j.prompt,
      resultSummary: j.result?.summary ?? null,
      error: j.error,
      spentCredits: nanoToCredits(j.usageNanoAiu),
      depth: j.depth,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
    }));
  }

  /** Ancestor chain (nearest first) used for loop detection. */
  async ancestors(job: Pick<Job, "parentJobId">): Promise<Job[]> {
    const out: Job[] = [];
    let id = job.parentJobId;
    while (id && out.length < 20) {
      const parent = await this.getJob(id);
      out.push(parent);
      id = parent.parentJobId;
    }
    return out;
  }

  async openChildren(jobId: string): Promise<Job[]> {
    return this.app.db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.parentJobId, jobId),
          inArray(schema.jobs.status, ["queued", "running", "waiting"]),
        ),
      );
  }

  agentRole(agent: Agent, role: Role) {
    return { agent, role };
  }
}
