import { desc, eq } from "drizzle-orm";
import { TERMINAL_JOB_STATUSES, truncate } from "@techgens/core";
import { buildSystemPrompt } from "@techgens/agents";
import { buildAgentTools, type ToolCaller } from "@techgens/tools";
import { SessionNotFoundError, type AgentEventHandler, type AgentSession, type AgentSessionConfig } from "@techgens/runtime";
import { schema, type Agent, type Job, type Role } from "@techgens/db";
import { roleDefinition } from "../services/org";
import { createToolServices } from "./toolServices";
import { NUDGE_MESSAGE } from "./prompts";
import type { JobEngine, TurnState } from "./jobs";

async function buildSessionConfig(engine: JobEngine, job: Job, agent: Agent, role: Role): Promise<AgentSessionConfig> {
  const app = engine.app;
  const caller: ToolCaller = {
    jobId: job.id,
    agentId: agent.id,
    agentName: agent.name,
    roleId: role.id,
    initiativeId: job.initiativeId,
    workItemId: job.workItemId,
    depth: job.depth,
  };
  const company = await app.company.get();
  const team = await app.org.teamContext(agent);
  const memories = await app.db.select().from(schema.memories).where(eq(schema.memories.agentId, agent.id)).orderBy(desc(schema.memories.createdAt)).limit(12);
  const systemPrompt = buildSystemPrompt({
    company: { name: company.name, mission: company.mission, vision: company.vision, values: company.values, policies: company.policies },
    role: roleDefinition(role),
    agentName: agent.name,
    ...team,
    memories: memories.reverse().map((m) => m.content),
  });
  return {
    systemPrompt,
    model: await app.org.effectiveModel(agent, role),
    reasoningEffort: role.definition.reasoningEffort,
    tools: buildAgentTools(role.definition.tools, caller, createToolServices(app, engine)),
    builtinTools: role.definition.builtinTools,
    maxAiCredits: role.definition.budget.perJobCredits || undefined,
    labels: { agentId: agent.id, roleId: role.id, jobId: job.id, kind: job.kind },
  };
}

function eventHandler(engine: JobEngine, job: Job, agent: Agent, role: Role, state: TurnState, pending: Promise<unknown>[]): AgentEventHandler {
  const app = engine.app;
  const base = { actorType: "agent" as const, actorId: agent.id, subjectType: "job", subjectId: job.id };
  return (e) => {
    switch (e.type) {
      case "message_delta":
        app.bus.emitSoon({ ...base, type: "agent.message_delta", data: { jobId: job.id, threadId: job.threadId, content: e.content } });
        break;
      case "message":
        app.bus.emitSoon({ ...base, type: "agent.message", summary: `${agent.name}: ${truncate(e.content, 160)}`, data: { jobId: job.id, threadId: job.threadId, content: truncate(e.content, 6000) } });
        break;
      case "tool_start":
        app.bus.emitSoon({ ...base, type: "agent.tool_call", summary: `${agent.name} → ${e.toolName}`, data: { jobId: job.id, toolName: e.toolName, args: truncate(JSON.stringify(e.args ?? {}), 1500) } });
        break;
      case "usage":
        pending.push(
          app.budget
            .recordUsage({
              jobId: job.id,
              agentId: agent.id,
              roleId: role.id,
              department: role.department,
              initiativeId: job.initiativeId,
              productId: null,
              model: e.model,
              nanoAiu: e.nanoAiu,
              premiumRequests: e.premiumRequests,
              inputTokens: e.inputTokens,
              outputTokens: e.outputTokens,
            })
            .catch((err) => app.log.error({ err }, "usage recording failed")),
        );
        break;
      case "error":
        app.log.warn({ jobId: job.id, message: e.message }, "agent session error");
        break;
      case "budget_exhausted":
        state.budgetExhausted = true;
        break;
    }
  };
}

/** Runs the agent turn(s) for a claimed job and moves it to its next state. */
export async function runJobTurns(engine: JobEngine, job: Job, agent: Agent, role: Role, signal: AbortSignal): Promise<void> {
  const app = engine.app;
  const state = engine.turnState(job.id);
  const pending: Promise<unknown>[] = [];
  const config = await buildSessionConfig(engine, job, agent, role);
  const onEvent = eventHandler(engine, job, agent, role, state, pending);
  const thread = job.threadId ? await app.chat.getThread(job.threadId) : null;
  const existing = thread?.sessionId ?? job.sessionId;

  let session: AgentSession;
  let fresh = false;
  if (existing) {
    try {
      session = await app.runtime.resumeSession(existing, config, onEvent);
    } catch (err) {
      if (!(err instanceof SessionNotFoundError)) throw err;
      session = await app.runtime.createSession(config, onEvent);
      fresh = true;
    }
  } else {
    session = await app.runtime.createSession(config, onEvent);
    fresh = true;
  }
  if (session.sessionId !== job.sessionId) await app.db.update(schema.jobs).set({ sessionId: session.sessionId }).where(eq(schema.jobs.id, job.id));
  if (thread && thread.sessionId !== session.sessionId) await app.chat.setThreadSession(thread.id, session.sessionId);

  const message = job.resumeMessage
    ? fresh && job.sessionId
      ? `${job.prompt}\n\n## Update since you last worked on this\n${job.resumeMessage}`
      : job.resumeMessage
    : job.prompt;
  if (job.resumeMessage) await app.db.update(schema.jobs).set({ resumeMessage: null }).where(eq(schema.jobs.id, job.id));

  let lastMessage = "";
  try {
    for (let turn = 0; turn < 2; turn++) {
      const res = await session.run(turn === 0 ? message : NUDGE_MESSAGE, { timeoutMs: app.config.turnTimeoutMs, signal });
      await Promise.allSettled(pending.splice(0));
      if (res.finalMessage) lastMessage = res.finalMessage;
      if (signal.aborted) return;
      if (await settleTurn(engine, job, state, lastMessage)) return;
      if (state.budgetExhausted) break;
    }
    const current = await engine.getJob(job.id);
    if (TERMINAL_JOB_STATUSES.includes(current.status)) return;
    if (state.budgetExhausted) {
      await engine.finish(current, "failed", undefined, `${agent.name} reached the per-assignment AI-credit limit (${role.definition.budget.perJobCredits} credits). Retry or raise the role budget.`);
      return;
    }
    await engine.finish(current, "succeeded", { summary: lastMessage || "Completed (no summary provided).", outcome: "done" });
  } finally {
    await Promise.allSettled(pending.splice(0));
    await session.close().catch(() => undefined);
  }
}

/** Decides what happens after a turn. Returns true when the job reached a new state. */
async function settleTurn(engine: JobEngine, job: Job, state: TurnState, lastMessage: string): Promise<boolean> {
  const app = engine.app;
  const current = await engine.getJob(job.id);
  if (TERMINAL_JOB_STATUSES.includes(current.status)) return true;
  if (state.completed) {
    const { summary, outcome, followUps } = state.completed;
    await engine.finish(current, "succeeded", { summary, outcome, data: followUps.length ? { followUps } : undefined });
    return true;
  }
  if (state.awaitingApprovalId) {
    const approval = await app.approvals.get(state.awaitingApprovalId);
    if (approval.status === "pending") {
      await engine.setWaiting(current, "approval", { approvalId: approval.id });
    } else {
      const decided = approval.status === "approved" ? `"${approval.title}" was approved (${approval.decisionComment ?? "policy"}). Continue and call complete_task when done.` : `"${approval.title}" was ${approval.status}: ${approval.decisionComment ?? ""}`;
      await engine.resume(job.id, decided, ["running"]);
    }
    return true;
  }
  const open = await engine.openChildren(job.id);
  if (open.length || state.delegatedJobIds.length) {
    const childJobIds = [...new Set([...(current.waitState.childJobIds ?? []), ...state.delegatedJobIds, ...open.map((o) => o.id)])];
    await engine.setWaiting(current, "children", { childJobIds });
    return true;
  }
  if (job.kind === "chat") {
    await engine.finish(current, "succeeded", { summary: lastMessage || "Done.", outcome: "done" });
    return true;
  }
  if (state.codingAssigned || (await app.delivery.awaitingCodingAgents(current))) {
    await engine.setWaiting(current, "external", { external: { kind: "coding", ref: current.initiativeId ?? "" } });
    return true;
  }
  return false;
}
