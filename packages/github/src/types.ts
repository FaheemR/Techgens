export interface RepoRef {
  owner: string;
  name: string;
}

export const repoSlug = (r: RepoRef): string => `${r.owner}/${r.name}`;

export function parseRepoSlug(slug: string): RepoRef {
  const [owner, name] = slug.split("/");
  if (!owner || !name) throw new Error(`invalid repository "${slug}" (expected owner/name)`);
  return { owner, name };
}

export interface RepoInfo extends RepoRef {
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface IssueInfo {
  id: number;
  nodeId: string;
  number: number;
  url: string;
  state: "open" | "closed";
  title: string;
  assignees: string[];
}

export interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  body: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  author: string;
  /** Latest review state per reviewer. */
  reviews: Array<{ author: string; state: string }>;
  /** Diff size (decision evidence); absent when the source doesn't report it. */
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export type CheckState = "success" | "failure" | "pending" | "none";

export interface CheckStatus {
  state: CheckState;
  checks: Array<{ name: string; status: string; conclusion: string | null }>;
}

export interface WorkflowRunInfo {
  id: number;
  name: string;
  url: string;
  status: string;
  conclusion: string | null;
  branch: string;
  sha: string;
  event: string;
  createdAt: string;
}

export interface PendingDeploymentInfo {
  environment: string;
  environmentId: number;
  canApprove: boolean;
}

export interface CodingAssignment {
  baseBranch: string;
  customAgent?: string;
  customInstructions?: string;
  model?: string;
}

export interface GitHubPort {
  getViewer(): Promise<{ login: string; id: number; name: string | null }>;
  getRepository(repo: RepoRef): Promise<RepoInfo | null>;
  createRepository(input: { owner: string; name: string; description?: string; private: boolean; ownerIsOrg: boolean }): Promise<RepoInfo>;
  /** Commits files to a branch in a single commit (creates the branch from `baseBranch` if needed). */
  commitFiles(repo: RepoRef, input: { branch: string; baseBranch?: string; message: string; files: Array<{ path: string; content: string }> }): Promise<{ sha: string }>;
  createBranch(repo: RepoRef, branch: string, fromBranch: string): Promise<void>;
  ensureLabels(repo: RepoRef, labels: Array<{ name: string; color: string; description?: string }>): Promise<void>;
  createIssue(repo: RepoRef, input: { title: string; body: string; labels?: string[] }): Promise<IssueInfo>;
  updateIssue(repo: RepoRef, issueNumber: number, input: { title?: string; body?: string; state?: "open" | "closed" }): Promise<void>;
  addSubIssue(repo: RepoRef, parentNumber: number, childIssueId: number): Promise<void>;
  /** Assigns the issue to Copilot cloud agent (copilot-swe-agent) with an agent assignment. */
  assignToCopilot(repo: RepoRef, issueNumber: number, assignment: CodingAssignment): Promise<void>;
  isCopilotAssignable(repo: RepoRef): Promise<boolean>;
  /** Pull requests that reference (close) the issue. */
  findPullRequestsForIssue(repo: RepoRef, issueNumber: number): Promise<PullRequestInfo[]>;
  getPullRequest(repo: RepoRef, prNumber: number): Promise<PullRequestInfo>;
  getPullRequestDiff(repo: RepoRef, prNumber: number): Promise<string>;
  findOpenPullRequest(repo: RepoRef, head: string, base: string): Promise<PullRequestInfo | null>;
  createPullRequest(repo: RepoRef, input: { head: string; base: string; title: string; body: string; draft?: boolean }): Promise<PullRequestInfo>;
  updatePullRequest(repo: RepoRef, prNumber: number, input: { title?: string; body?: string }): Promise<void>;
  markReadyForReview(repo: RepoRef, prNumber: number): Promise<void>;
  createReview(repo: RepoRef, prNumber: number, input: { event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body: string; comments?: Array<{ path: string; line: number; body: string }> }): Promise<void>;
  createIssueComment(repo: RepoRef, issueNumber: number, body: string): Promise<void>;
  mergePullRequest(repo: RepoRef, prNumber: number, method: "squash" | "merge" | "rebase"): Promise<{ merged: boolean; sha: string | null; message: string }>;
  getCheckStatus(repo: RepoRef, ref: string): Promise<CheckStatus>;
  listWorkflowRuns(repo: RepoRef, input?: { branch?: string; status?: string; perPage?: number }): Promise<WorkflowRunInfo[]>;
  getPendingDeployments(repo: RepoRef, runId: number): Promise<PendingDeploymentInfo[]>;
  reviewPendingDeployments(repo: RepoRef, runId: number, input: { environmentIds: number[]; state: "approved" | "rejected"; comment: string }): Promise<void>;
  ensureEnvironment(repo: RepoRef, name: string, input: { reviewerUserIds?: number[]; branches?: string[] }): Promise<void>;
  setEnvironmentVariable(repo: RepoRef, environment: string, name: string, value: string): Promise<void>;
  protectBranch(repo: RepoRef, branch: string, input: { requiredChecks: string[]; requireReviews: boolean }): Promise<void>;
}
