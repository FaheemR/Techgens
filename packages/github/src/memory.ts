import { randomBytes } from "node:crypto";
import { summarizeChecks, COPILOT_AGENT_LOGIN } from "./octokit";
import {
  repoSlug,
  type CheckStatus,
  type CodingAssignment,
  type GitHubPort,
  type IssueInfo,
  type PendingDeploymentInfo,
  type PullRequestInfo,
  type RepoInfo,
  type RepoRef,
  type WorkflowRunInfo,
} from "./types";

const sha = () => randomBytes(20).toString("hex");

/** Unified-diff statistics, as GitHub reports them on pull requests. */
function diffStats(diff: string): { additions: number; deletions: number; changedFiles: number } {
  const lines = diff.split("\n");
  return {
    additions: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
    deletions: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
    changedFiles: lines.filter((l) => l.startsWith("diff --git")).length,
  };
}

interface FakeIssue extends IssueInfo {
  body: string;
  labels: string[];
  subIssues: number[];
  assignment?: CodingAssignment;
  comments: string[];
}
interface FakePr extends PullRequestInfo {
  linkedIssues: number[];
  diff: string;
}
interface FakeRepo {
  info: RepoInfo;
  branches: Map<string, string>;
  files: Map<string, Map<string, string>>;
  labels: Set<string>;
  next: number;
  issues: Map<number, FakeIssue>;
  prs: Map<number, FakePr>;
  checks: Map<string, CheckStatus>;
  /** Pull requests whose changes each branch contains (release PRs carry the integration branch's merged PRs). */
  merged: Map<string, number[]>;
  runs: WorkflowRunInfo[];
  pending: Map<number, PendingDeploymentInfo[]>;
  environments: Map<string, { reviewerUserIds: number[]; branches: string[]; vars: Record<string, string> }>;
  protections: Map<string, { requiredChecks: string[]; requireReviews: boolean }>;
}

/**
 * In-memory GitHub used by tests and demo mode. With `autoCopilot`, assigning an issue to Copilot immediately yields a
 * ready pull request with green checks; with `simulatePipelines`, merges trigger staging deploys and a production deploy
 * run waiting for environment approval.
 */
export class InMemoryGitHub implements GitHubPort {
  readonly repos = new Map<string, FakeRepo>();
  readonly viewer = { login: "ceo", id: 1, name: "The CEO" as string | null };
  autoCopilot = true;
  simulatePipelines = true;
  copilotEnabled = true;
  private runSeq = 1000;

  private repo(r: RepoRef): FakeRepo {
    const repo = this.repos.get(repoSlug(r).toLowerCase());
    if (!repo) throw Object.assign(new Error(`repository ${repoSlug(r)} not found`), { status: 404 });
    return repo;
  }

  async getViewer() {
    return { ...this.viewer };
  }

  async getRepository(r: RepoRef) {
    return this.repos.get(repoSlug(r).toLowerCase())?.info ?? null;
  }

  async createRepository(input: {
    owner: string;
    name: string;
    description?: string;
    private: boolean;
    ownerIsOrg: boolean;
  }) {
    const info: RepoInfo = {
      owner: input.owner,
      name: input.name,
      url: `https://github.com/${input.owner}/${input.name}`,
      defaultBranch: "main",
      private: input.private,
    };
    const head = sha();
    this.repos.set(repoSlug(info).toLowerCase(), {
      info,
      branches: new Map([["main", head]]),
      files: new Map([["main", new Map([["README.md", `# ${input.name}\n`]])]]),
      labels: new Set(),
      next: 1,
      issues: new Map(),
      prs: new Map(),
      checks: new Map(),
      merged: new Map(),
      runs: [],
      pending: new Map(),
      environments: new Map(),
      protections: new Map(),
    });
    return info;
  }

  async commitFiles(
    r: RepoRef,
    input: {
      branch: string;
      baseBranch?: string;
      message: string;
      files: Array<{ path: string; content: string }>;
    },
  ) {
    const repo = this.repo(r);
    if (!repo.branches.has(input.branch)) {
      const base = input.baseBranch && repo.branches.get(input.baseBranch);
      if (!base) throw new Error(`branch ${input.branch} not found`);
      repo.files.set(input.branch, new Map(repo.files.get(input.baseBranch!)));
    }
    const files = repo.files.get(input.branch) ?? new Map<string, string>();
    for (const f of input.files) files.set(f.path, f.content);
    repo.files.set(input.branch, files);
    const commit = sha();
    repo.branches.set(input.branch, commit);
    return { sha: commit };
  }

  async createBranch(r: RepoRef, branch: string, fromBranch: string) {
    const repo = this.repo(r);
    if (repo.branches.has(branch)) return;
    const base = repo.branches.get(fromBranch);
    if (!base) throw new Error(`base branch ${fromBranch} not found`);
    repo.branches.set(branch, base);
    repo.files.set(branch, new Map(repo.files.get(fromBranch)));
  }

  async ensureLabels(r: RepoRef, labels: Array<{ name: string }>) {
    for (const l of labels) this.repo(r).labels.add(l.name);
  }

  async createIssue(r: RepoRef, input: { title: string; body: string; labels?: string[] }) {
    const repo = this.repo(r);
    const number = repo.next++;
    const issue: FakeIssue = {
      id: 10_000 + number,
      nodeId: `I_${number}`,
      number,
      url: `${repo.info.url}/issues/${number}`,
      state: "open",
      title: input.title,
      assignees: [],
      body: input.body,
      labels: input.labels ?? [],
      subIssues: [],
      comments: [],
    };
    repo.issues.set(number, issue);
    return { ...issue };
  }

  async updateIssue(
    r: RepoRef,
    n: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ) {
    const issue = this.repo(r).issues.get(n);
    if (!issue) throw Object.assign(new Error("issue not found"), { status: 404 });
    Object.assign(issue, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  }

  async addSubIssue(r: RepoRef, parentNumber: number, childIssueId: number) {
    const repo = this.repo(r);
    const child = [...repo.issues.values()].find((i) => i.id === childIssueId);
    if (!child) throw new Error("sub-issue not found");
    repo.issues.get(parentNumber)?.subIssues.push(child.number);
  }

  async isCopilotAssignable() {
    return this.copilotEnabled;
  }

  async assignToCopilot(r: RepoRef, n: number, assignment: CodingAssignment) {
    if (!this.copilotEnabled)
      throw Object.assign(new Error("copilot-swe-agent is not assignable"), { status: 422 });
    const issue = this.repo(r).issues.get(n);
    if (!issue) throw Object.assign(new Error("issue not found"), { status: 404 });
    issue.assignees.push(COPILOT_AGENT_LOGIN);
    issue.assignment = assignment;
    if (this.autoCopilot) this.simulateCopilotPullRequest(r, n);
  }

  /** Simulates Copilot cloud agent finishing an issue: ready PR with passing checks. */
  simulateCopilotPullRequest(
    r: RepoRef,
    issueNumber: number,
    opts: { checks?: "success" | "failure" | "pending"; draft?: boolean } = {},
  ): PullRequestInfo {
    const repo = this.repo(r);
    const issue = repo.issues.get(issueNumber);
    if (!issue) throw new Error("issue not found");
    const base = issue.assignment?.baseBranch ?? repo.info.defaultBranch;
    const head = `copilot/issue-${issueNumber}`;
    repo.branches.set(head, sha());
    const pr = this.addPr(repo, {
      head,
      base,
      title: issue.title,
      body: `Implements ${issue.title}.\n\nFixes #${issueNumber}`,
      draft: opts.draft ?? false,
      author: "Copilot",
      linkedIssues: [issueNumber],
      diff: [
        `diff --git a/src/issue-${issueNumber}.ts b/src/issue-${issueNumber}.ts`,
        `+// ${issue.title}`,
        `+export function issue${issueNumber}(): { ok: boolean } {`,
        "+  return { ok: true };",
        "+}",
        `diff --git a/test/issue-${issueNumber}.test.ts b/test/issue-${issueNumber}.test.ts`,
        `+import { issue${issueNumber} } from "../src/issue-${issueNumber}";`,
        `+test("${issue.title.replace(/"/g, "'")}", () => expect(issue${issueNumber}().ok).toBe(true));`,
        "",
      ].join("\n"),
    });
    this.setChecks(r, pr.headSha, opts.checks ?? "success");
    return { ...pr };
  }

  private addPr(
    repo: FakeRepo,
    p: {
      head: string;
      base: string;
      title: string;
      body: string;
      draft: boolean;
      author: string;
      linkedIssues: number[];
      diff: string;
    },
  ): FakePr {
    const number = repo.next++;
    const pr: FakePr = {
      number,
      url: `${repo.info.url}/pull/${number}`,
      title: p.title,
      body: p.body,
      state: "open",
      draft: p.draft,
      merged: false,
      mergeable: true,
      headRef: p.head,
      baseRef: p.base,
      headSha: repo.branches.get(p.head) ?? sha(),
      author: p.author,
      reviews: [],
      linkedIssues: p.linkedIssues,
      diff: p.diff,
      ...diffStats(p.diff),
    };
    repo.prs.set(number, pr);
    return pr;
  }

  setChecks(r: RepoRef, ref: string, state: "success" | "failure" | "pending") {
    const checks = [
      {
        name: "ci / build-and-test",
        status: state === "pending" ? "in_progress" : "completed",
        conclusion: state === "pending" ? null : state,
      },
      { name: "codeql / analyze", status: "completed", conclusion: "success" },
    ];
    this.repo(r).checks.set(ref, { state: summarizeChecks(checks), checks });
  }

  async findPullRequestsForIssue(r: RepoRef, n: number) {
    return [...this.repo(r).prs.values()]
      .filter((p) => p.linkedIssues.includes(n))
      .map((p) => ({ ...p }))
      .sort((a, b) => b.number - a.number);
  }

  async getPullRequest(r: RepoRef, n: number) {
    const pr = this.repo(r).prs.get(n);
    if (!pr) throw Object.assign(new Error(`pull request #${n} not found`), { status: 404 });
    return { ...pr, reviews: [...pr.reviews] };
  }

  async getPullRequestDiff(r: RepoRef, n: number) {
    return (await this.getPullRequest(r, n)) && this.repo(r).prs.get(n)!.diff;
  }

  async findOpenPullRequest(r: RepoRef, head: string, base: string) {
    const pr = [...this.repo(r).prs.values()].find(
      (p) => p.state === "open" && p.headRef === head && p.baseRef === base,
    );
    return pr ? { ...pr } : null;
  }

  async createPullRequest(
    r: RepoRef,
    input: { head: string; base: string; title: string; body: string; draft?: boolean },
  ) {
    const repo = this.repo(r);
    if (!repo.branches.has(input.head))
      throw Object.assign(new Error(`head ${input.head} not found`), { status: 422 });
    // A branch-to-branch PR (e.g. develop → main) contains every PR merged into head but not yet into base.
    const inBase = new Set(repo.merged.get(input.base) ?? []);
    const included = (repo.merged.get(input.head) ?? [])
      .filter((n) => !inBase.has(n))
      .map((n) => repo.prs.get(n)!.diff);
    const diff = [
      ...included,
      `diff --git a/CHANGELOG.md b/CHANGELOG.md\n+release ${input.head} -> ${input.base}\n`,
    ].join("");
    const pr = this.addPr(repo, {
      ...input,
      draft: input.draft ?? false,
      author: this.viewer.login,
      linkedIssues: [],
      diff,
    });
    this.setChecks(r, pr.headSha, "success");
    return { ...pr };
  }

  async updatePullRequest(r: RepoRef, n: number, input: { title?: string; body?: string }) {
    const pr = this.repo(r).prs.get(n);
    if (pr) Object.assign(pr, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  }

  async markReadyForReview(r: RepoRef, n: number) {
    const pr = this.repo(r).prs.get(n);
    if (pr) pr.draft = false;
  }

  async createReview(
    r: RepoRef,
    n: number,
    input: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
      comments?: Array<{ path: string; line: number; body: string }>;
    },
  ) {
    const pr = this.repo(r).prs.get(n);
    if (!pr) throw Object.assign(new Error("pull request not found"), { status: 404 });
    if (input.event === "COMMENT") return;
    const state = input.event === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";
    pr.reviews = [
      ...pr.reviews.filter((x) => x.author !== this.viewer.login),
      { author: this.viewer.login, state },
    ];
  }

  async createIssueComment(r: RepoRef, n: number, body: string) {
    this.repo(r).issues.get(n)?.comments.push(body);
  }

  async mergePullRequest(r: RepoRef, n: number, _method: "squash" | "merge" | "rebase") {
    const repo = this.repo(r);
    const pr = repo.prs.get(n);
    if (!pr || pr.state !== "open") return { merged: false, sha: null, message: "Pull request is not open" };
    if (pr.draft) return { merged: false, sha: null, message: "Pull request is still a draft" };
    const checks = repo.checks.get(pr.headSha);
    if (checks && checks.state === "failure")
      return { merged: false, sha: null, message: "Required checks failed" };
    const mergeSha = sha();
    pr.merged = true;
    pr.state = "closed";
    repo.branches.set(pr.baseRef, mergeSha);
    repo.merged.set(pr.baseRef, [
      ...new Set([...(repo.merged.get(pr.baseRef) ?? []), ...(repo.merged.get(pr.headRef) ?? []), pr.number]),
    ]);
    for (const i of pr.linkedIssues) {
      const issue = repo.issues.get(i);
      if (issue) issue.state = "closed";
    }
    this.setChecks(r, mergeSha, "success");
    if (this.simulatePipelines) this.simulatePipeline(r, pr.baseRef, mergeSha);
    return { merged: true, sha: mergeSha, message: "Pull Request successfully merged" };
  }

  /** Mimics the generated CD workflow: integration branch → staging deploy; default branch → production deploy awaiting approval. */
  simulatePipeline(r: RepoRef, branch: string, commit: string) {
    const repo = this.repo(r);
    const isProd = branch === repo.info.defaultBranch;
    const env = isProd ? "production" : "staging";
    const needsApproval = isProd && (repo.environments.get("production")?.reviewerUserIds.length ?? 0) > 0;
    const id = this.runSeq++;
    const run: WorkflowRunInfo = {
      id,
      name: `deploy-${env}`,
      url: `${repo.info.url}/actions/runs/${id}`,
      status: needsApproval ? "waiting" : "completed",
      conclusion: needsApproval ? null : "success",
      branch,
      sha: commit,
      event: "push",
      createdAt: new Date().toISOString(),
    };
    repo.runs.unshift(run);
    if (needsApproval) repo.pending.set(run.id, [{ environment: env, environmentId: 2, canApprove: true }]);
    return run;
  }

  async getCheckStatus(r: RepoRef, ref: string) {
    const repo = this.repo(r);
    const key = repo.branches.get(ref) ?? ref;
    return repo.checks.get(key) ?? { state: "none" as const, checks: [] };
  }

  async listWorkflowRuns(r: RepoRef, input: { branch?: string; status?: string } = {}) {
    return this.repo(r)
      .runs.filter(
        (w) => (!input.branch || w.branch === input.branch) && (!input.status || w.status === input.status),
      )
      .map((w) => ({ ...w }));
  }

  async getPendingDeployments(r: RepoRef, runId: number) {
    return [...(this.repo(r).pending.get(runId) ?? [])];
  }

  async reviewPendingDeployments(
    r: RepoRef,
    runId: number,
    input: { environmentIds: number[]; state: "approved" | "rejected"; comment: string },
  ) {
    const repo = this.repo(r);
    const run = repo.runs.find((w) => w.id === runId);
    if (!run || !repo.pending.has(runId))
      throw Object.assign(new Error("no pending deployments"), { status: 422 });
    repo.pending.delete(runId);
    run.status = "completed";
    run.conclusion = input.state === "approved" ? "success" : "cancelled";
  }

  async ensureEnvironment(
    r: RepoRef,
    name: string,
    input: { reviewerUserIds?: number[]; branches?: string[] },
  ) {
    const repo = this.repo(r);
    const prev = repo.environments.get(name);
    repo.environments.set(name, {
      reviewerUserIds: input.reviewerUserIds ?? [],
      branches: input.branches ?? [],
      vars: prev?.vars ?? {},
    });
  }

  async setEnvironmentVariable(r: RepoRef, environment: string, name: string, value: string) {
    const env = this.repo(r).environments.get(environment);
    if (!env) throw Object.assign(new Error("environment not found"), { status: 404 });
    env.vars[name] = value;
  }

  async protectBranch(
    r: RepoRef,
    branch: string,
    input: { requiredChecks: string[]; requireReviews: boolean },
  ) {
    this.repo(r).protections.set(branch, input);
  }
}
