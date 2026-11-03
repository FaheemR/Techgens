import { describe, expect, it } from "vitest";
import { InMemoryGitHub, buildAppManifest, parseRepoSlug, summarizeChecks, tokenNeedsRefresh } from "../src/index";

describe("InMemoryGitHub", () => {
  it("simulates the Copilot cloud agent → review → merge → deploy pipeline", async () => {
    const gh = new InMemoryGitHub();
    const repo = parseRepoSlug("acme/invoicelite");
    await gh.createRepository({ owner: "acme", name: "invoicelite", private: true, ownerIsOrg: true });
    await gh.createBranch(repo, "develop", "main");
    await gh.ensureEnvironment(repo, "production", { reviewerUserIds: [1] });

    const issue = await gh.createIssue(repo, { title: "Add invoices API", body: "..." });
    await gh.assignToCopilot(repo, issue.number, { baseBranch: "develop", customAgent: "backend-engineer" });
    const [pr] = await gh.findPullRequestsForIssue(repo, issue.number);
    expect(pr).toMatchObject({ baseRef: "develop", draft: false, author: "Copilot" });
    expect((await gh.getCheckStatus(repo, pr!.headSha)).state).toBe("success");

    await gh.createReview(repo, pr!.number, { event: "APPROVE", body: "LGTM" });
    expect((await gh.getPullRequest(repo, pr!.number)).reviews).toEqual([{ author: "ceo", state: "APPROVED" }]);
    expect((await gh.mergePullRequest(repo, pr!.number, "squash")).merged).toBe(true);
    expect((await gh.listWorkflowRuns(repo, { branch: "develop" }))[0]).toMatchObject({ name: "deploy-staging", conclusion: "success" });

    expect(pr).toMatchObject({ changedFiles: 2, additions: 6, deletions: 0 });
    const release = await gh.createPullRequest(repo, { head: "develop", base: "main", title: "Release", body: "notes" });
    // A release PR carries every change merged into the integration branch (+ the changelog entry).
    expect(await gh.getPullRequest(repo, release.number)).toMatchObject({ changedFiles: 3, additions: 7, deletions: 0 });
    await gh.mergePullRequest(repo, release.number, "merge");
    const [prodRun] = await gh.listWorkflowRuns(repo, { branch: "main" });
    expect(prodRun).toMatchObject({ name: "deploy-production", status: "waiting", url: `https://github.com/acme/invoicelite/actions/runs/${prodRun!.id}` });
    const pending = await gh.getPendingDeployments(repo, prodRun!.id);
    await gh.reviewPendingDeployments(repo, prodRun!.id, { environmentIds: pending.map((p) => p.environmentId), state: "approved", comment: "ship it" });
    expect((await gh.listWorkflowRuns(repo, { branch: "main" }))[0]).toMatchObject({ status: "completed", conclusion: "success" });
  });

  it("refuses to merge drafts and failing PRs", async () => {
    const gh = new InMemoryGitHub();
    gh.autoCopilot = false;
    const repo = parseRepoSlug("acme/app");
    await gh.createRepository({ owner: "acme", name: "app", private: true, ownerIsOrg: true });
    const issue = await gh.createIssue(repo, { title: "x", body: "y" });
    await gh.assignToCopilot(repo, issue.number, { baseBranch: "main" });
    expect(await gh.findPullRequestsForIssue(repo, issue.number)).toEqual([]);
    const draft = gh.simulateCopilotPullRequest(repo, issue.number, { draft: true });
    expect((await gh.mergePullRequest(repo, draft.number, "squash")).merged).toBe(false);
    await gh.markReadyForReview(repo, draft.number);
    gh.setChecks(repo, draft.headSha, "failure");
    expect((await gh.mergePullRequest(repo, draft.number, "squash")).message).toMatch(/checks failed/);
  });
});

describe("helpers", () => {
  it("summarises checks", () => {
    expect(summarizeChecks([])).toBe("none");
    expect(summarizeChecks([{ status: "completed", conclusion: "success" }, { status: "in_progress", conclusion: null }])).toBe("pending");
    expect(summarizeChecks([{ status: "completed", conclusion: "failure" }])).toBe("failure");
  });

  it("builds a webhook-less app manifest and detects expiring tokens", () => {
    const m = buildAppManifest({ name: "Techgens", homepageUrl: "http://localhost:3000", redirectUrl: "r", callbackUrl: "c" });
    expect(m).toMatchObject({ public: false, hook_attributes: { active: false } });
    expect(tokenNeedsRefresh({ accessToken: "x", expiresAt: Date.now() + 60_000 })).toBe(true);
    expect(tokenNeedsRefresh({ accessToken: "x" })).toBe(false);
  });
});
