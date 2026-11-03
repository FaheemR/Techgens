import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type {
  AgentStatus,
  Department,
  GoalStatus,
  GoalType,
  InitiativeStatus,
  LifecycleStage,
  RoleFrontmatter,
} from "@techgens/core";

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export interface AzureProductConfig {
  subscriptionId?: string;
  tenantId?: string;
  location?: string;
  resourceGroupPrefix?: string;
  stagingClientId?: string;
  productionClientId?: string;
}

export interface InitiativeMetadata {
  releasePrNumber?: number;
  releasePrUrl?: string;
  productionRunId?: number;
  /** Stage gate the CEO rejected while the initiative is paused; resuming restarts that stage with the feedback. */
  rejectedApprovalId?: string;
}

/** Single-row table holding company-level strategy. */
export const company = pgTable("company", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("Techgens"),
  mission: text("mission").notNull().default(""),
  vision: text("vision").notNull().default(""),
  values: jsonb("values").$type<string[]>().notNull().default([]),
  /** Company constitution: policies & engineering standards injected into every agent prompt. */
  policies: text("policies").notNull().default(""),
  githubOwner: text("github_owner"),
  onboarded: boolean("onboarded").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  vision: text("vision").notNull().default(""),
  status: text("status").notNull().default("active"),
  repoOwner: text("repo_owner"),
  repoName: text("repo_name"),
  defaultBranch: text("default_branch").notNull().default("main"),
  integrationBranch: text("integration_branch").notNull().default("develop"),
  projectNumber: integer("project_number"),
  azure: jsonb("azure").$type<AzureProductConfig>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const initiatives = pgTable(
  "initiatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    directive: text("directive").notNull(),
    summary: text("summary").notNull().default(""),
    stage: text("stage").$type<LifecycleStage>().notNull().default("intake"),
    status: text("status").$type<InitiativeStatus>().notNull().default("proposed"),
    /** Why the initiative is in its current status (e.g. "Rejected at Vision & roadmap: …"); null when active. */
    statusReason: text("status_reason"),
    skipStages: jsonb("skip_stages").$type<LifecycleStage[]>().notNull().default([]),
    targetDate: timestamp("target_date", { withTimezone: true }),
    budgetCredits: doublePrecision("budget_credits"),
    /** Delivery bookkeeping (release PR number, production run id, …). */
    metadata: jsonb("metadata").$type<InitiativeMetadata>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("initiatives_status_idx").on(t.status)],
);

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  initiativeId: uuid("initiative_id")
    .notNull()
    .references(() => initiatives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").notNull().default("planned"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): AnyPgColumn => goals.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
  type: text("type").$type<GoalType>().notNull().default("objective"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  targetValue: doublePrecision("target_value"),
  currentValue: doublePrecision("current_value"),
  unit: text("unit"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").$type<GoalStatus>().notNull().default("on_track"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department").$type<Department>().notNull(),
  reportsTo: text("reports_to"),
  description: text("description").notNull().default(""),
  definition: jsonb("definition").$type<RoleFrontmatter>().notNull(),
  prompt: text("prompt").notNull(),
  source: text("source").notNull().default("builtin"),
  updatedAt: updatedAt(),
});

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    name: text("name").notNull(),
    managerAgentId: uuid("manager_agent_id").references((): AnyPgColumn => agents.id, { onDelete: "set null" }),
    status: text("status").$type<AgentStatus>().notNull().default("active"),
    modelOverride: text("model_override"),
    dailyCreditsOverride: doublePrecision("daily_credits_override"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agents_role_idx").on(t.roleId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    initiativeId: uuid("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
    workItemId: uuid("work_item_id"),
    status: text("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(1),
    /** Latest content (denormalised for search). */
    content: text("content").notNull().default(""),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_search_idx").using("gin", t.search),
    index("documents_initiative_idx").on(t.initiativeId, t.kind),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    changeSummary: text("change_summary").notNull().default(""),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_versions_doc_version_idx").on(t.documentId, t.version)],
);
