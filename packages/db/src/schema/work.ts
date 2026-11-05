import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type {
  ActorType,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalStatus,
  DecisionType,
  JobStatus,
  LifecycleStage,
  Priority,
  WaitReason,
  WorkItemKind,
  WorkItemStatus,
} from "@techgens/core";
import { agents, initiatives, products } from "./company";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export type CodingStatus =
  | "unassigned"
  | "assigned"
  | "pr_open"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "merged"
  | "failed";

export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => workItems.id, { onDelete: "cascade" }),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    kind: text("kind").$type<WorkItemKind>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<WorkItemStatus>().notNull().default("ready"),
    priority: text("priority").$type<Priority>().notNull().default("p2"),
    stage: text("stage").$type<LifecycleStage>(),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** True when this item should be implemented by Copilot cloud agent. */
    forCodingAgent: boolean("for_coding_agent").notNull().default(false),
    dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
    dueDate: timestamp("due_date", { withTimezone: true }),
    githubRepo: text("github_repo"),
    githubIssueNumber: integer("github_issue_number"),
    githubIssueNodeId: text("github_issue_node_id"),
    githubUrl: text("github_url"),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    codingStatus: text("coding_status").$type<CodingStatus>().notNull().default("unassigned"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("work_items_parent_idx").on(t.parentId),
    index("work_items_initiative_idx").on(t.initiativeId, t.status),
    index("work_items_assignee_idx").on(t.assigneeAgentId, t.status),
  ],
);

export interface JobResult {
  summary: string;
  outcome?: "done" | "blocked" | "failed";
  documents?: string[];
  data?: Record<string, unknown>;
}

export interface JobWaitState {
  childJobIds?: string[];
  approvalId?: string;
  external?: { kind: string; ref: string };
}

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    parentJobId: uuid("parent_job_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
    kind: text("kind").$type<"work" | "chat" | "routine">().notNull().default("work"),
    /** Directive chat thread this job answers (kind = chat). */
    threadId: uuid("thread_id"),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    waitReason: text("wait_reason").$type<WaitReason>(),
    waitState: jsonb("wait_state").$type<JobWaitState>().notNull().default({}),
    /** Initial instructions for the agent. */
    prompt: text("prompt").notNull(),
    /** Message to deliver on the next resume (children results, approval decision...). */
    resumeMessage: text("resume_message"),
    result: jsonb("result").$type<JobResult>(),
    error: text("error"),
    sessionId: text("session_id"),
    depth: integer("depth").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    resumeCount: integer("resume_count").notNull().default(0),
    usageNanoAiu: bigint("usage_nano_aiu", { mode: "number" }).notNull().default(0),
    premiumRequests: doublePrecision("premium_requests").notNull().default(0),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_parent_idx").on(t.parentJobId),
    index("jobs_agent_idx").on(t.agentId, t.status),
    index("jobs_work_item_idx").on(t.workItemId),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<ApprovalKind>().notNull(),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    round: integer("round").notNull().default(1),
    decisionComment: text("decision_comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("approvals_status_idx").on(t.status, t.createdAt)],
);

/** Audit trail of every CEO decision (multiple rounds per approval). */
export const approvalDecisions = pgTable("approval_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  approvalId: uuid("approval_id")
    .notNull()
    .references(() => approvals.id, { onDelete: "cascade" }),
  outcome: text("outcome").$type<ApprovalOutcome>().notNull(),
  comment: text("comment").notNull().default(""),
  actorType: text("actor_type").$type<ActorType>().notNull().default("ceo"),
  round: integer("round").notNull().default(1),
  createdAt: createdAt(),
});

export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"directive" | "work_item" | "meeting">().notNull().default("directive"),
  title: text("title").notNull(),
  archived: boolean("archived").notNull().default(false),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  sessionId: text("session_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorType: text("author_type").$type<ActorType>().notNull(),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

/** Append-only decision log per initiative (decisions, changes, overrides, assumptions). */
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "cascade" }),
    type: text("type").$type<DecisionType>().notNull().default("decision"),
    summary: text("summary").notNull(),
    details: text("details").notNull().default(""),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorAgentId: uuid("actor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("decisions_initiative_idx").on(t.initiativeId, t.createdAt)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("memories_agent_idx").on(t.agentId, t.createdAt)],
);
