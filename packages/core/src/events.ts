/** Live event stream (SSE) contract between the orchestrator and the Command Center. */
export const EVENT_TYPES = [
  "company.updated",
  "directive.received",
  "initiative.created",
  "initiative.updated",
  "initiative.stage_changed",
  "work_item.created",
  "work_item.updated",
  "job.queued",
  "job.started",
  "job.waiting",
  "job.completed",
  "job.failed",
  "job.cancelled",
  "agent.message",
  "agent.message_delta",
  "agent.tool_call",
  "agent.updated",
  "approval.requested",
  "approval.decided",
  "document.written",
  "decision.recorded",
  "budget.warning",
  "budget.exceeded",
  "usage.recorded",
  "github.synced",
  "github.pr_updated",
  "deployment.updated",
  "incident.opened",
  "notification.created",
  "system.paused",
  "system.resumed",
  "chat.message",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface LiveEvent<T = Record<string, unknown>> {
  id: string;
  type: EventType;
  actorType: "ceo" | "agent" | "system";
  actorId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  summary: string;
  data: T;
  createdAt: string;
}

/** Ephemeral events are streamed but not persisted (e.g. token deltas). */
export const EPHEMERAL_EVENT_TYPES: readonly EventType[] = ["agent.message_delta"];
