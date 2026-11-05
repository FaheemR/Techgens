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
  runtime: {
    kind: "copilot" | "fake";
    ready: boolean;
    authenticated: boolean;
    login?: string;
    message?: string;
  };
  github: {
    connected: boolean;
    login: string | null;
    mode: "pat" | "app" | "demo" | null;
    appSlug: string | null;
  };
  /** Legacy checklist-dismissed flag; setup completion is derived independently by the dashboard. */
  onboarded: boolean;
}

export interface CompanyDTO {
  name: string;
  mission: string;
  vision: string;
  values: string[];
  policies: string;
  githubOwner: string | null;
  /** Dismisses the dashboard checklist, not proof that setup steps are complete. */
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
  startValue: number | null;
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
  /** Enforced base limit of the initiative's total budget (the Budget page edits the same record); null = no cap. */
  budgetCredits: number | null;
  /** Extra credits the CEO granted on that budget (overrun approvals): show "400 + 10 granted". */
  grantedCredits: number;
  spentCredits: number;
  /** Counts every work item listed for the initiative (stage items included), by status. */
  workItems: { total: number; done: number; inProgress: number; blocked: number; cancelled: number };
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
  /** Latest decision note: the CEO's comment, an auto-approval note or "Withdrawn — the initiative was cancelled.". */
  decisionComment: string | null;
}

export interface ApprovalDetailDTO extends ApprovalSummaryDTO {
  payload: Record<string, unknown>;
  documents: DocumentDTO[];
  decisions: Array<{ outcome: ApprovalOutcome; comment: string; round: number; createdAt: string }>;
}

/** Check run shown as decision evidence on merge gates. */
export interface CheckEvidence {
  name: string;
  /** "success", "failure", … or null while the check is still running. */
  conclusion: string | null;
}

/**
 * `ApprovalDetailDTO.payload` of a `merge_to_main` approval (stable keys; raw ids end in `Id`/`Ids`). Evidence fields are
 * null when GitHub could not provide them.
 */
export interface MergeToMainPayload {
  risk?: string;
  recommendation?: string;
  stage?: LifecycleStage;
  prNumber: number;
  prUrl: string | null;
  prTitle: string | null;
  checks: CheckEvidence[];
  filesChanged: number | null;
  additions: number | null;
  deletions: number | null;
  /** Head commit of the release pull request. */
  commitSha: string | null;
  /** Short markdown excerpt of the release notes; the full document is attached (see `releaseNotesDocumentId`). */
  releaseNotes: string | null;
  releaseNotesDocumentId?: string;
  /** Pull requests merged into the integration branch for this initiative ("#12 Item API"). */
  changes: string[];
}

/** `ApprovalDetailDTO.payload` of a `prod_deploy` approval. */
export interface ProdDeployPayload {
  risk?: string;
  recommendation?: string;
  stage?: LifecycleStage;
  environment: string;
  runId: number;
  runUrl: string | null;
  /** Commit being deployed. */
  commitSha: string | null;
  version?: string;
  /** True when the same code passed the staging deployment. */
  stagingVerified: boolean;
  /** One-line staging evidence, e.g. "deploy-staging run 1004 succeeded on 3f2a1bc". */
  stagingEvidence: string;
  rollback: string;
  /** Pull requests in this release ("#12 Item API"). */
  changes: string[];
  releasePrNumber?: number;
  releasePrUrl?: string;
}

/** `ApprovalDetailDTO.payload` of a `budget_overrun` approval. */
export interface BudgetOverrunPayload {
  risk?: string;
  recommendation?: string;
  spendByAgent?: Array<{ agentName: string; credits: number }>;
  budgetId: string;
  /** Jobs paused by this overrun (resumed on approval). */
  jobIds: string[];
  scope: BudgetScope;
  /** "Company", an initiative title, an agent or product name… */
  scopeName: string;
  period: BudgetPeriod;
  /** Base limit of the budget (grants excluded). */
  limitCredits: number;
  /** Extra credits already granted for the current window. */
  grantedCredits: number;
  spentCredits: number;
  /** End of the current accounting window (ISO); null for total budgets. */
  windowEndsAt: string | null;
  /** Granted when the CEO approves without an amount. */
  suggestedExtraCredits: number;
  /** Set on approval: the extra credits granted for the current window. */
  grantedExtraCredits?: number;
}

export interface DecideApprovalRequest {
  outcome: ApprovalOutcome;
  comment?: string;
  /**
   * For budget_overrun approvals: extra credits granted for the current window. A number or numeric string (decimals
   * allowed) always wins; only when omitted is `suggestedExtraCredits` granted.
   */
  extraCredits?: number | string;
}

export interface BudgetDTO {
  id: string;
  scope: BudgetScope;
  scopeId: string | null;
  scopeLabel: string;
  period: BudgetPeriod;
  /** Base limit per window (temporary grants excluded). */
  limitCredits: number;
  /** Extra credits the CEO granted for the current window only; enforcement uses `limitCredits + grantedCredits`. */
  grantedCredits: number;
  /** End of the current window (ISO), when grants expire; null for total budgets. */
  windowEndsAt: string | null;
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
  archived: boolean;
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
  setup: { strategy: boolean; github: boolean; directive: boolean };
  budgets: BudgetDTO[];
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
  github: {
    connected: boolean;
    login: string | null;
    mode: "pat" | "app" | "demo" | null;
    appSlug: string | null;
    owner: string | null;
  };
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
