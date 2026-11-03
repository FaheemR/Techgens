/**
 * REST API contract between the orchestrator (`/api/*`) and the Command Center. Dates are ISO strings.
 * Keep in sync with apps/orchestrator/src/api.
 */
import type {
  AgentStatus,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalStatus,
  BudgetPeriod,
  BudgetScope,
  Department,
  DocumentKind,
  GoalStatus,
  GoalType,
  InitiativeStatus,
  JobStatus,
  Priority,
  WorkItemKind,
  WorkItemStatus,
} from "./domain";
import type { LiveEvent } from "./events";
import type { GatePolicy, LifecycleStage } from "./lifecycle";
import type { BudgetState } from "./budget";
import type { RoleFrontmatter } from "./roles";

export interface SystemInfo {
  version: string;
  paused: boolean;
  demoMode: boolean;
  runtime: { kind: "copilot" | "fake"; ready: boolean; authenticated: boolean; login?: string; message?: string };
  github: { connected: boolean; login: string | null; mode: "pat" | "app" | "demo" | null; appSlug: string | null };
  onboarded: boolean;
}

export interface CompanyDTO {
  name: string;
  mission: string;
  vision: string;
  values: string[];
  policies: string;
  githubOwner: string | null;
  onboarded: boolean;
}

export interface ProductDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  vision: string;
  status: string;
  repoOwner: string | null;
  repoName: string | null;
  repoUrl: string | null;
  defaultBranch: string;
  integrationBranch: string;
  azure: Record<string, string | undefined>;
  createdAt: string;
}

export interface GoalDTO {
  id: string;
  parentId: string | null;
  productId: string | null;
  initiativeId: string | null;
  type: GoalType;
  title: string;
  description: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  dueDate: string | null;
  status: GoalStatus;
}

export interface StageProgress {
  stage: LifecycleStage;
  title: string;
  state: "done" | "active" | "pending" | "skipped";
  gate?: ApprovalKind;
}

export interface InitiativeSummaryDTO {
  id: string;
  title: string;
  summary: string;
  directive: string;
  stage: LifecycleStage;
  status: InitiativeStatus;
  /** Why the initiative is in its current status, e.g. "Rejected at Vision & roadmap: …". */
  statusReason: string | null;
  productId: string | null;
  productName: string | null;
  targetDate: string | null;
  budgetCredits: number | null;
  spentCredits: number;
  workItems: { total: number; done: number; inProgress: number; blocked: number };
  pendingApprovals: number;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDTO {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: string;
  sortOrder: number;
}

export interface DecisionDTO {
  id: string;
  initiativeId: string | null;
  type: string;
  summary: string;
  details: string;
  actorType: string;
  actorName: string | null;
  createdAt: string;
}

export interface InitiativeDetailDTO extends InitiativeSummaryDTO {
  stages: StageProgress[];
  milestones: MilestoneDTO[];
  documents: DocumentSummaryDTO[];
  approvals: ApprovalSummaryDTO[];
  decisions: DecisionDTO[];
}

export interface RoleDTO {
  id: string;
  title: string;
  department: Department;
  reportsTo: string | null;
  description: string;
  definition: RoleFrontmatter;
  prompt: string;
  source: string;
}

export interface AgentDTO {
  id: string;
  name: string;
  roleId: string;
  roleTitle: string;
  department: Department;
  managerAgentId: string | null;
  status: AgentStatus;
  executor: "local-session" | "cloud-agent";
  model: string | null;
  /** Per-agent overrides (null = role default). */
  modelOverride: string | null;
  dailyCreditsOverride: number | null;
  dailyBudgetCredits: number;
  spentTodayCredits: number;
  activeJobs: number;
  currentActivity: string | null;
}

export interface OrgDTO {
  roles: RoleDTO[];
  agents: AgentDTO[];
}

export interface JobDTO {
  id: string;
  agentId: string;
  agentName: string;
  roleId: string;
  department: Department;
  workItemId: string | null;
  workItemTitle: string | null;
  initiativeId: string | null;
  parentJobId: string | null;
  kind: string;
  status: JobStatus;
  waitReason: string | null;
  prompt: string;
  resultSummary: string | null;
  error: string | null;
  spentCredits: number;
  depth: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentDetailDTO extends AgentDTO {
  role: RoleDTO;
  recentJobs: JobDTO[];
  memories: Array<{ id: string; content: string; createdAt: string }>;
}

export interface WorkItemDTO {
  id: string;
  parentId: string | null;
  initiativeId: string | null;
  productId: string | null;
  kind: WorkItemKind;
  title: string;
  description: string;
  status: WorkItemStatus;
  priority: Priority;
  stage: LifecycleStage | null;
  assigneeAgentId: string | null;
  assigneeName: string | null;
  forCodingAgent: boolean;
  githubUrl: string | null;
  githubIssueNumber: number | null;
  prNumber: number | null;
  prUrl: string | null;
  codingStatus: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DocumentSummaryDTO {
  id: string;
  kind: DocumentKind;
  title: string;
  status: string;
  version: number;
  initiativeId: string | null;
  initiativeTitle: string | null;
  authorName: string | null;
  updatedAt: string;
}

export interface DocumentDTO extends DocumentSummaryDTO {
  content: string;
  versions: Array<{ version: number; changeSummary: string; authorName: string | null; createdAt: string }>;
}

export interface ApprovalSummaryDTO {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  title: string;
  summary: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  requestedBy: string | null;
  round: number;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApprovalDetailDTO extends ApprovalSummaryDTO {
  payload: Record<string, unknown>;
  documents: DocumentDTO[];
  decisions: Array<{ outcome: ApprovalOutcome; comment: string; round: number; createdAt: string }>;
}

export interface DecideApprovalRequest {
  outcome: ApprovalOutcome;
  comment?: string;
  /** For budget_overrun approvals: extra credits granted for the current window. */
  extraCredits?: number;
}

export interface BudgetDTO {
  id: string;
  scope: BudgetScope;
  scopeId: string | null;
  scopeLabel: string;
  period: BudgetPeriod;
  limitCredits: number;
  warnPct: number;
  enabled: boolean;
  spentCredits: number;
  state: BudgetState;
}

export interface UsageSummaryDTO {
  todayCredits: number;
  weekCredits: number;
  monthCredits: number;
  premiumRequestsMonth: number;
  byAgent: Array<{ agentId: string; agentName: string; credits: number }>;
  byDepartment: Array<{ department: string; credits: number }>;
  byInitiative: Array<{ initiativeId: string; title: string; credits: number }>;
  daily: Array<{ day: string; credits: number }>;
  budgets: BudgetDTO[];
}

export interface ThreadDTO {
  id: string;
  title: string;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  threadId: string;
  authorType: "ceo" | "agent" | "system";
  authorName: string | null;
  content: string;
  createdAt: string;
}

export interface DeploymentDTO {
  id: string;
  productId: string | null;
  environment: string;
  status: string;
  runUrl: string | null;
  sha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentDTO {
  id: string;
  productId: string | null;
  title: string;
  severity: string;
  status: string;
  source: string;
  details: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface RoutineDTO {
  id: string;
  key: string;
  title: string;
  cron: string;
  roleId: string;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface DashboardDTO {
  company: CompanyDTO;
  initiatives: InitiativeSummaryDTO[];
  pendingApprovals: ApprovalSummaryDTO[];
  activeJobs: JobDTO[];
  goals: GoalDTO[];
  usage: { todayCredits: number; monthCredits: number; monthBudgetCredits: number | null };
  recentEvents: LiveEvent[];
  openIncidents: number;
}

export interface SettingsDTO {
  gatePolicy: Required<GatePolicy>;
  roleModels: Record<string, string>;
  maxDelegationDepth: number;
  maxConcurrentJobs: number;
  autoMergeToIntegration: boolean;
  /** CEO-configured MCP servers (roles opt in with `mcp: [key]`); env values are never returned. */
  mcpServers: Record<string, { command: string; args: string[]; tools: string[] }>;
  github: { connected: boolean; login: string | null; mode: "pat" | "app" | "demo" | null; appSlug: string | null; owner: string | null };
}

export interface ModelOptionDTO {
  id: string;
  name: string;
  multiplier?: number;
  enabled: boolean;
}

/** GET /api/products/:id/azure-setup */
export interface AzureSetupDTO {
  script: string;
  /** GitHub environment variables per environment (staging, production…). */
  variables: Record<string, Record<string, string>>;
  steps: string[];
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

export type { InitiativeStatus, WorkItemStatus, JobStatus, ApprovalStatus, LiveEvent };
