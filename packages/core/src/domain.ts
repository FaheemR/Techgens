/** Shared domain vocabulary for Techgens. Keep this file dependency-free (types + const arrays). */

export const DEPARTMENTS = [
  "executive",
  "product",
  "design",
  "engineering",
  "qa",
  "devops",
  "security",
  "docs",
  "marketing",
  "sales",
  "support",
  "finance",
  "legal",
  "hr",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const AGENT_STATUSES = ["active", "paused", "retired"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** Where an agent's work executes. */
export const EXECUTORS = ["local-session", "cloud-agent"] as const;
export type Executor = (typeof EXECUTORS)[number];

export const WORK_ITEM_KINDS = [
  "stage",
  "epic",
  "story",
  "task",
  "bug",
  "research",
  "document",
  "review",
  "meeting",
  "chat",
] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];

export const WORK_ITEM_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const JOB_STATUSES = ["queued", "running", "waiting", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["succeeded", "failed", "cancelled"];

export const WAIT_REASONS = ["children", "approval", "external"] as const;
export type WaitReason = (typeof WAIT_REASONS)[number];

export const APPROVAL_KINDS = [
  "vision_roadmap",
  "spec",
  "architecture",
  "merge_to_main",
  "prod_deploy",
  "budget_overrun",
  "hire",
  "decision",
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "changes_requested", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_OUTCOMES = ["approved", "rejected", "changes_requested"] as const;
export type ApprovalOutcome = (typeof APPROVAL_OUTCOMES)[number];

export const DOCUMENT_KINDS = [
  "charter",
  "roadmap",
  "research",
  "prd",
  "ux_spec",
  "architecture",
  "adr",
  "threat_model",
  "test_plan",
  "plan",
  "release_notes",
  "runbook",
  "report",
  "policy",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ["draft", "in_review", "approved", "superseded"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const INITIATIVE_STATUSES = ["proposed", "active", "paused", "completed", "cancelled"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export const GOAL_TYPES = ["objective", "key_result"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_STATUSES = ["on_track", "at_risk", "off_track", "achieved", "missed"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const BUDGET_SCOPES = ["company", "department", "agent", "product", "initiative"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];
export const BUDGET_PERIODS = ["day", "week", "month", "total"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const ACTOR_TYPES = ["ceo", "agent", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const DECISION_TYPES = ["decision", "change", "override", "assumption", "event"] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/** Tools Techgens exposes to agents (custom SDK tools). Built-in CLI tools are never exposed to local sessions. */
export const AGENT_TOOL_NAMES = [
  "delegate_task",
  "ask_agent",
  "report_progress",
  "escalate",
  "request_approval",
  "complete_task",
  "write_document",
  "read_document",
  "list_documents",
  "search_knowledge",
  "get_status",
  "create_initiative",
  "propose_roadmap",
  "create_work_item",
  "update_work_item",
  "list_work_items",
  "record_decision",
  "remember",
  "assign_to_coding_agent",
  "get_pr_status",
  "get_pr_diff",
  "review_pull_request",
  "merge_pull_request",
  "create_release_pr",
  "get_deployments",
  "get_ci_status",
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
