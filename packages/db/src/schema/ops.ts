import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ActorType, BudgetPeriod, BudgetScope, BudgetState, EventType } from "@techgens/core";
import { agents, initiatives, products } from "./company";
import { approvals, jobs, workItems } from "./work";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Activity log + live event source. `seq` gives a total order for SSE resume. */
export const events = pgTable(
  "events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    type: text("type").$type<EventType>().notNull(),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorId: text("actor_id"),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    summary: text("summary").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_subject_idx").on(t.subjectType, t.subjectId), index("events_created_idx").on(t.createdAt)],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    roleId: text("role_id"),
    department: text("department"),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    model: text("model"),
    nanoAiu: bigint("nano_aiu", { mode: "number" }).notNull().default(0),
    premiumRequests: doublePrecision("premium_requests").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    source: text("source").$type<"copilot-sdk" | "cloud-agent" | "estimate">().notNull().default("copilot-sdk"),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_agent_idx").on(t.agentId, t.createdAt),
    index("usage_created_idx").on(t.createdAt),
    index("usage_initiative_idx").on(t.initiativeId, t.createdAt),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<BudgetScope>().notNull(),
    /** department key / agent id / product id / initiative id; null for company. */
    scopeId: text("scope_id"),
    period: text("period").$type<BudgetPeriod>().notNull(),
    limitCredits: doublePrecision("limit_credits").notNull(),
    warnPct: integer("warn_pct").notNull().default(80),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("budgets_scope_idx").on(t.scope, t.scopeId, t.period)],
);

/** Dedupes budget alerts per accounting window. `approvalId` links an overrun to its CEO decision. */
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    state: text("state").$type<BudgetState>().notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    /** Extra credits granted by the CEO for this window. */
    extraCredits: doublePrecision("extra_credits").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_alerts_window_idx").on(t.budgetId, t.periodStart, t.state)],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/** AES-256-GCM encrypted secrets (tokens, keys). */
export const secrets = pgTable("secrets", {
  key: text("key").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: updatedAt(),
});

/** Recurring ceremonies (standups, sprint reviews, exec reports). Each run creates a tracked work item. */
export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  cron: text("cron").notNull(),
  roleId: text("role_id").notNull(),
  prompt: text("prompt").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
    environment: text("environment").notNull(),
    status: text("status").notNull().default("queued"),
    runId: bigint("run_id", { mode: "number" }),
    runUrl: text("run_url"),
    sha: text("sha"),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("deployments_product_idx").on(t.productId, t.environment)],
);

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("sev3"),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("manual"),
  details: text("details").notNull().default(""),
  workItemId: uuid("work_item_id").references(() => workItems.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Conditional-request cache for GitHub polling (ETags, cursors). */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  etag: text("etag"),
  cursor: text("cursor"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});
