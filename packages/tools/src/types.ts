import type {
  ApprovalKind,
  DocumentKind,
  Priority,
  WorkItemKind,
  WorkItemStatus,
  DecisionType,
  LifecycleStage,
} from "@techgens/core";

/** Identity of the agent run a tool call belongs to. */
export interface ToolCaller {
  jobId: string;
  agentId: string;
  agentName: string;
  roleId: string;
  initiativeId: string | null;
  workItemId: string | null;
  depth: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  kind: string;
  status: string;
  version: number;
  updatedAt: string;
}

export interface WorkItemSummary {
  id: string;
  kind: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
  githubUrl: string | null;
  prUrl: string | null;
  codingStatus: string;
}

/** Operations the orchestrator provides to agent tools. All methods enforce authorisation and guardrails. */
export interface ToolServices {
  delegateTask(
    c: ToolCaller,
    i: {
      assignee: string;
      title: string;
      instructions: string;
      expectedOutput: string;
      priority?: Priority;
      kind?: WorkItemKind;
    },
  ): Promise<{ workItemId: string; jobId: string; assigneeName: string }>;
  askAgent(
    c: ToolCaller,
    i: { agent: string; question: string },
  ): Promise<{ answer: string; agentName: string }>;
  reportProgress(c: ToolCaller, i: { message: string; percentComplete?: number }): Promise<void>;
  escalate(
    c: ToolCaller,
    i: { issue: string; options: string[]; recommendation: string; severity: "low" | "medium" | "high" },
  ): Promise<{ approvalId: string }>;
  requestApproval(
    c: ToolCaller,
    i: {
      kind: ApprovalKind;
      title: string;
      summary: string;
      documentIds: string[];
      payload?: Record<string, unknown>;
    },
  ): Promise<{ approvalId: string; autoApproved: boolean }>;
  completeTask(
    c: ToolCaller,
    i: { summary: string; outcome: "done" | "blocked"; followUps: string[] },
  ): Promise<void>;
  writeDocument(
    c: ToolCaller,
    i: { title: string; kind: DocumentKind; content: string; documentId?: string; changeSummary?: string },
  ): Promise<{ id: string; version: number }>;
  readDocument(
    c: ToolCaller,
    i: { documentId?: string; title?: string; kind?: DocumentKind },
  ): Promise<{
    id: string;
    title: string;
    kind: string;
    version: number;
    status: string;
    content: string;
  } | null>;
  listDocuments(c: ToolCaller, i: { initiativeId?: string; kind?: DocumentKind }): Promise<DocumentSummary[]>;
  searchKnowledge(
    c: ToolCaller,
    i: { query: string; limit: number },
  ): Promise<Array<{ id: string; title: string; kind: string; snippet: string }>>;
  getStatus(c: ToolCaller, i: { initiativeId?: string }): Promise<string>;
  /** Applies the default budget cap when none is given; attaches a product only when `productName` is given. */
  createInitiative(
    c: ToolCaller,
    i: {
      title: string;
      summary: string;
      productName?: string;
      targetDate?: string;
      budgetCredits?: number;
      skipStages?: LifecycleStage[];
    },
  ): Promise<{
    initiativeId: string;
    budgetCredits: number;
    defaultBudget: boolean;
    productName: string | null;
  }>;
  proposeRoadmap(
    c: ToolCaller,
    i: {
      initiativeId?: string;
      milestones: Array<{ title: string; description?: string; dueDate?: string }>;
    },
  ): Promise<{ count: number }>;
  createWorkItem(
    c: ToolCaller,
    i: {
      kind: WorkItemKind;
      title: string;
      description: string;
      parentId?: string;
      priority?: Priority;
      forCodingAgent?: boolean;
      dependsOn?: string[];
      assignee?: string;
    },
  ): Promise<{ id: string; githubUrl: string | null }>;
  updateWorkItem(
    c: ToolCaller,
    i: { id: string; status?: WorkItemStatus; description?: string; priority?: Priority; assignee?: string },
  ): Promise<void>;
  listWorkItems(
    c: ToolCaller,
    i: { initiativeId?: string; status?: WorkItemStatus; kind?: WorkItemKind; parentId?: string },
  ): Promise<WorkItemSummary[]>;
  recordDecision(c: ToolCaller, i: { type: DecisionType; summary: string; details?: string }): Promise<void>;
  remember(c: ToolCaller, i: { note: string }): Promise<void>;
  assignToCodingAgent(
    c: ToolCaller,
    i: { workItemId: string; roleId?: string; additionalInstructions?: string; model?: string },
  ): Promise<string>;
  getPrStatus(c: ToolCaller, i: { workItemId?: string; prNumber?: number }): Promise<string>;
  getPrDiff(c: ToolCaller, i: { prNumber: number; maxChars: number }): Promise<string>;
  reviewPullRequest(
    c: ToolCaller,
    i: {
      prNumber: number;
      verdict: "approve" | "request_changes" | "comment";
      body: string;
      comments?: Array<{ path: string; line: number; body: string }>;
    },
  ): Promise<string>;
  mergePullRequest(
    c: ToolCaller,
    i: { prNumber: number; method: "squash" | "merge" | "rebase" },
  ): Promise<string>;
  createReleasePr(c: ToolCaller, i: { title?: string; body: string }): Promise<string>;
  getDeployments(c: ToolCaller, i: { environment?: string }): Promise<string>;
  getCiStatus(c: ToolCaller, i: { ref?: string }): Promise<string>;
}
