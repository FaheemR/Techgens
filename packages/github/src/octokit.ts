import { Octokit } from "octokit";
import {
  repoSlug,
  type CheckState,
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

/** Login of GitHub Copilot cloud agent (REST assignee form is `copilot-swe-agent[bot]`). */
export const COPILOT_AGENT_LOGIN = "copilot-swe-agent";

function status(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

type AnyRecord = Record<string, any>;

function mapIssue(i: AnyRecord): IssueInfo {
  return {
    id: i.id,
    nodeId: i.node_id,
    number: i.number,
    url: i.html_url,
    state: i.state,
    title: i.title,
    assignees: (i.assignees ?? []).map((a: AnyRecord) => a.login),
  };
}

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: "techgens/0.1",
    throttle: {
      onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
        retryCount < 2,
      onSecondaryRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
        retryCount < 1,
    },
  });
}

export class OctokitGitHub implements GitHubPort {
  readonly octokit: Octokit;

  constructor(auth: string | Octokit) {
    this.octokit = typeof auth === "string" ? createOctokit(auth) : auth;
  }

  private r(repo: RepoRef) {
    return { owner: repo.owner, repo: repo.name };
  }

  async getViewer() {
    const { data } = await this.octokit.request("GET /user");
    return { login: data.login, id: Number(data.id), name: data.name ?? null };
  }

  async getRepository(repo: RepoRef): Promise<RepoInfo | null> {
    try {
      const { data } = await this.octokit.request("GET /repos/{owner}/{repo}", this.r(repo));
      return {
        owner: data.owner.login,
        name: data.name,
        url: data.html_url,
        defaultBranch: data.default_branch,
        private: data.private,
      };
    } catch (err) {
      if (status(err) === 404) return null;
      throw err;
    }
  }

  async createRepository(input: {
    owner: string;
    name: string;
    description?: string;
    private: boolean;
    ownerIsOrg: boolean;
  }) {
    const body = {
      name: input.name,
      description: input.description,
      private: input.private,
      auto_init: true,
    };
    const { data } = input.ownerIsOrg
      ? await this.octokit.request("POST /orgs/{org}/repos", { org: input.owner, ...body })
      : await this.octokit.request("POST /user/repos", body);
    return {
      owner: data.owner.login,
      name: data.name,
      url: data.html_url,
      defaultBranch: data.default_branch ?? "main",
      private: data.private,
    };
  }

  private async branchSha(repo: RepoRef, branch: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
        ...this.r(repo),
        ref: `heads/${branch}`,
      });
      return data.object.sha;
    } catch (err) {
      if (status(err) === 404) return null;
      throw err;
    }
  }

  async commitFiles(
    repo: RepoRef,
    input: {
      branch: string;
      baseBranch?: string;
      message: string;
      files: Array<{ path: string; content: string }>;
    },
  ) {
    const existing = await this.branchSha(repo, input.branch);
    const parentSha = existing ?? (input.baseBranch ? await this.branchSha(repo, input.baseBranch) : null);
    if (!parentSha)
      throw new Error(`branch ${input.branch} (or base ${input.baseBranch}) not found in ${repoSlug(repo)}`);
    const { data: parent } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
      { ...this.r(repo), commit_sha: parentSha },
    );
    const { data: tree } = await this.octokit.request("POST /repos/{owner}/{repo}/git/trees", {
      ...this.r(repo),
      base_tree: parent.tree.sha,
      tree: input.files.map((f) => ({
        path: f.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: f.content,
      })),
    });
    const { data: commit } = await this.octokit.request("POST /repos/{owner}/{repo}/git/commits", {
      ...this.r(repo),
      message: input.message,
      tree: tree.sha,
      parents: [parentSha],
    });
    if (existing) {
      await this.octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
        ...this.r(repo),
        ref: `heads/${input.branch}`,
        sha: commit.sha,
      });
    } else {
      await this.octokit.request("POST /repos/{owner}/{repo}/git/refs", {
        ...this.r(repo),
        ref: `refs/heads/${input.branch}`,
        sha: commit.sha,
      });
    }
    return { sha: commit.sha };
  }

  async createBranch(repo: RepoRef, branch: string, fromBranch: string) {
    if (await this.branchSha(repo, branch)) return;
    const sha = await this.branchSha(repo, fromBranch);
    if (!sha) throw new Error(`base branch ${fromBranch} not found`);
    await this.octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      ...this.r(repo),
      ref: `refs/heads/${branch}`,
      sha,
    });
  }

  async ensureLabels(repo: RepoRef, labels: Array<{ name: string; color: string; description?: string }>) {
    for (const label of labels) {
      try {
        await this.octokit.request("POST /repos/{owner}/{repo}/labels", { ...this.r(repo), ...label });
      } catch (err) {
        if (status(err) !== 422) throw err;
      }
    }
  }

  async createIssue(repo: RepoRef, input: { title: string; body: string; labels?: string[] }) {
    const { data } = await this.octokit.request("POST /repos/{owner}/{repo}/issues", {
      ...this.r(repo),
      ...input,
    });
    return mapIssue(data);
  }

  async updateIssue(
    repo: RepoRef,
    issueNumber: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ) {
    await this.octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
      ...this.r(repo),
      issue_number: issueNumber,
      ...input,
    });
  }

  async addSubIssue(repo: RepoRef, parentNumber: number, childIssueId: number) {
    await this.octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues", {
      ...this.r(repo),
      issue_number: parentNumber,
      sub_issue_id: childIssueId,
    });
  }

  async assignToCopilot(repo: RepoRef, issueNumber: number, a: CodingAssignment) {
    const agentAssignment: AnyRecord = { target_repo: repoSlug(repo), base_branch: a.baseBranch };
    if (a.customAgent) agentAssignment.custom_agent = a.customAgent;
    if (a.customInstructions) agentAssignment.custom_instructions = a.customInstructions;
    if (a.model) agentAssignment.model = a.model;
    await this.octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/assignees", {
      ...this.r(repo),
      issue_number: issueNumber,
      assignees: [`${COPILOT_AGENT_LOGIN}[bot]`],
      agent_assignment: agentAssignment,
    } as never);
  }

  async isCopilotAssignable(repo: RepoRef) {
    const data = await this.octokit.graphql<AnyRecord>(
      `query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:100){ nodes{ login } } } }`,
      { owner: repo.owner, name: repo.name },
    );
    return (data.repository?.suggestedActors?.nodes ?? []).some(
      (n: AnyRecord) => n.login === COPILOT_AGENT_LOGIN,
    );
  }

  async findPullRequestsForIssue(repo: RepoRef, issueNumber: number) {
    const data = await this.octokit.graphql<AnyRecord>(
      `query($owner:String!,$name:String!,$number:Int!){ repository(owner:$owner,name:$name){ issue(number:$number){
        closedByPullRequestsReferences(first:10, includeClosedPrs:true){ nodes{ number } }
        timelineItems(itemTypes:[CROSS_REFERENCED_EVENT, CONNECTED_EVENT], last:30){ nodes{ __typename
          ... on CrossReferencedEvent { source { __typename ... on PullRequest { number repository { nameWithOwner } } } }
          ... on ConnectedEvent { subject { __typename ... on PullRequest { number repository { nameWithOwner } } } } } } } } }`,
      { owner: repo.owner, name: repo.name, number: issueNumber },
    );
    const issue = data.repository?.issue;
    const numbers = new Set<number>();
    for (const n of issue?.closedByPullRequestsReferences?.nodes ?? []) numbers.add(n.number);
    for (const n of issue?.timelineItems?.nodes ?? []) {
      const pr = n.source ?? n.subject;
      if (
        pr?.__typename === "PullRequest" &&
        pr.repository?.nameWithOwner?.toLowerCase() === repoSlug(repo).toLowerCase()
      )
        numbers.add(pr.number);
    }
    const prs = await Promise.all([...numbers].map((n) => this.getPullRequest(repo, n)));
    return prs.sort((a, b) => b.number - a.number);
  }

  async getPullRequest(repo: RepoRef, prNumber: number): Promise<PullRequestInfo> {
    const [{ data: pr }, { data: reviews }] = await Promise.all([
      this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        ...this.r(repo),
        pull_number: prNumber,
      }),
      this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        ...this.r(repo),
        pull_number: prNumber,
        per_page: 100,
      }),
    ]);
    const latest = new Map<string, string>();
    for (const rv of reviews)
      if (rv.user?.login && rv.state !== "COMMENTED") latest.set(rv.user.login, rv.state);
    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      body: pr.body ?? "",
      state: pr.state as "open" | "closed",
      draft: Boolean(pr.draft),
      merged: Boolean(pr.merged),
      mergeable: pr.mergeable ?? null,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      headSha: pr.head.sha,
      author: pr.user?.login ?? "",
      reviews: [...latest].map(([author, state]) => ({ author, state })),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    };
  }

  async getPullRequestDiff(repo: RepoRef, prNumber: number) {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      ...this.r(repo),
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return String(data);
  }

  async findOpenPullRequest(repo: RepoRef, head: string, base: string) {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
      ...this.r(repo),
      head: `${repo.owner}:${head}`,
      base,
      state: "open",
    });
    return data[0] ? this.getPullRequest(repo, data[0].number) : null;
  }

  async createPullRequest(
    repo: RepoRef,
    input: { head: string; base: string; title: string; body: string; draft?: boolean },
  ) {
    const { data } = await this.octokit.request("POST /repos/{owner}/{repo}/pulls", {
      ...this.r(repo),
      ...input,
    });
    return this.getPullRequest(repo, data.number);
  }

  async updatePullRequest(repo: RepoRef, prNumber: number, input: { title?: string; body?: string }) {
    await this.octokit.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
      ...this.r(repo),
      pull_number: prNumber,
      ...input,
    });
  }

  async markReadyForReview(repo: RepoRef, prNumber: number) {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      ...this.r(repo),
      pull_number: prNumber,
    });
    if (!data.draft) return;
    await this.octokit.graphql(
      `mutation($id:ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ clientMutationId } }`,
      { id: data.node_id },
    );
  }

  async createReview(
    repo: RepoRef,
    prNumber: number,
    input: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
      comments?: Array<{ path: string; line: number; body: string }>;
    },
  ) {
    await this.octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      ...this.r(repo),
      pull_number: prNumber,
      event: input.event,
      body: input.body,
      comments: input.comments?.map((c) => ({ path: c.path, line: c.line, side: "RIGHT", body: c.body })),
    });
  }

  async createIssueComment(repo: RepoRef, issueNumber: number, body: string) {
    await this.octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      ...this.r(repo),
      issue_number: issueNumber,
      body,
    });
  }

  async mergePullRequest(repo: RepoRef, prNumber: number, method: "squash" | "merge" | "rebase") {
    try {
      const { data } = await this.octokit.request("PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge", {
        ...this.r(repo),
        pull_number: prNumber,
        merge_method: method,
      });
      return { merged: data.merged, sha: data.sha ?? null, message: data.message };
    } catch (err) {
      if ([405, 409, 422].includes(status(err) ?? 0))
        return { merged: false, sha: null, message: (err as Error).message };
      throw err;
    }
  }

  async getCheckStatus(repo: RepoRef, ref: string): Promise<CheckStatus> {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/commits/{ref}/check-runs", {
      ...this.r(repo),
      ref,
      per_page: 100,
    });
    const checks = data.check_runs.map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion ?? null,
    }));
    return { state: summarizeChecks(checks), checks };
  }

  async listWorkflowRuns(
    repo: RepoRef,
    input: { branch?: string; status?: string; perPage?: number } = {},
  ): Promise<WorkflowRunInfo[]> {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/actions/runs", {
      ...this.r(repo),
      branch: input.branch,
      status: input.status as never,
      per_page: input.perPage ?? 20,
    });
    return data.workflow_runs.map((w) => ({
      id: Number(w.id),
      name: w.name ?? w.display_title,
      url: w.html_url,
      status: w.status ?? "unknown",
      conclusion: w.conclusion ?? null,
      branch: w.head_branch ?? "",
      sha: w.head_sha,
      event: w.event,
      createdAt: w.created_at,
    }));
  }

  async getPendingDeployments(repo: RepoRef, runId: number): Promise<PendingDeploymentInfo[]> {
    const { data } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments",
      { ...this.r(repo), run_id: runId },
    );
    return data.map((d) => ({
      environment: d.environment.name ?? "",
      environmentId: Number(d.environment.id ?? 0),
      canApprove: d.current_user_can_approve,
    }));
  }

  async reviewPendingDeployments(
    repo: RepoRef,
    runId: number,
    input: { environmentIds: number[]; state: "approved" | "rejected"; comment: string },
  ) {
    await this.octokit.request("POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments", {
      ...this.r(repo),
      run_id: runId,
      environment_ids: input.environmentIds,
      state: input.state,
      comment: input.comment,
    });
  }

  async ensureEnvironment(
    repo: RepoRef,
    name: string,
    input: { reviewerUserIds?: number[]; branches?: string[] },
  ) {
    await this.octokit.request("PUT /repos/{owner}/{repo}/environments/{environment_name}", {
      ...this.r(repo),
      environment_name: name,
      reviewers: input.reviewerUserIds?.map((id) => ({ type: "User" as const, id })),
      deployment_branch_policy: input.branches?.length
        ? { protected_branches: false, custom_branch_policies: true }
        : null,
    });
    for (const branch of input.branches ?? []) {
      try {
        await this.octokit.request(
          "POST /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies",
          {
            ...this.r(repo),
            environment_name: name,
            name: branch,
            type: "branch",
          },
        );
      } catch (err) {
        if (![303, 409, 422].includes(status(err) ?? 0)) throw err;
      }
    }
  }

  async setEnvironmentVariable(repo: RepoRef, environment: string, name: string, value: string) {
    try {
      await this.octokit.request("POST /repos/{owner}/{repo}/environments/{environment_name}/variables", {
        ...this.r(repo),
        environment_name: environment,
        name,
        value,
      });
    } catch (err) {
      if (status(err) !== 409) throw err;
      await this.octokit.request(
        "PATCH /repos/{owner}/{repo}/environments/{environment_name}/variables/{name}",
        { ...this.r(repo), environment_name: environment, name, value },
      );
    }
  }

  async protectBranch(
    repo: RepoRef,
    branch: string,
    input: { requiredChecks: string[]; requireReviews: boolean },
  ) {
    await this.octokit.request("PUT /repos/{owner}/{repo}/branches/{branch}/protection", {
      ...this.r(repo),
      branch,
      required_status_checks: input.requiredChecks.length
        ? { strict: false, contexts: input.requiredChecks }
        : null,
      enforce_admins: false,
      required_pull_request_reviews: input.requireReviews ? { required_approving_review_count: 1 } : null,
      restrictions: null,
    });
  }
}

export function summarizeChecks(checks: Array<{ status: string; conclusion: string | null }>): CheckState {
  if (!checks.length) return "none";
  if (
    checks.some((c) =>
      ["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(
        c.conclusion ?? "",
      ),
    )
  )
    return "failure";
  if (checks.some((c) => c.status !== "completed")) return "pending";
  return "success";
}
