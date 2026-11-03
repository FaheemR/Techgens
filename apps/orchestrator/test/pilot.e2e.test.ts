import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ApprovalKind } from "@techgens/core";
import { schema, type DbHandle } from "@techgens/db";
import { createTestDb } from "@techgens/db/testing";
import type { FakeAgentRuntime } from "@techgens/runtime";
import type { Techgens } from "../src/app";
import { createTestApp } from "./helpers";

async function pendingKinds(app: Techgens): Promise<ApprovalKind[]> {
  return (await app.approvals.list("pending")).map((a) => a.kind).sort();
}

async function decide(
  app: Techgens,
  kind: ApprovalKind,
  outcome: "approved" | "changes_requested" = "approved",
  comment = "Looks good",
) {
  const [a] = (await app.approvals.list("pending")).filter((x) => x.kind === kind);
  expect(a, `pending ${kind} approval`).toBeDefined();
  await app.approvals.decide(a!.id, { outcome, comment });
  await app.engine.runUntilIdle();
}

describe("e2e pilot: CEO directive → production (scripted agents, simulated GitHub)", () => {
  let h: DbHandle;
  let app: Techgens;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app } = await createTestApp(h));
  });
  afterAll(async () => {
    await h.close();
  });

  it("runs the full product lifecycle with every CEO gate", async () => {
    const gh = app.github.memory!;
    const thread = await app.chat.createThread();
    await app.chat.postCeoMessage(
      thread.id,
      "Build InvoiceLite: an invoicing SaaS for freelancers. MVP in 6 weeks with a budget of 400 credits.",
    );
    await app.engine.runUntilIdle();

    const messages = await app.chat.messages(thread.id);
    expect(messages.map((m) => m.authorType)).toEqual(["ceo", "agent"]);
    expect(messages[1]!.content).toMatch(/InvoiceLite MVP/);
    const [ini] = await app.lifecycle.list();
    expect(ini).toMatchObject({
      title: "InvoiceLite MVP",
      status: "active",
      stage: "intake",
      budgetCredits: 400,
    });
    expect(await pendingKinds(app)).toEqual(["vision_roadmap"]);

    // CEO requests changes once: the Chief of Staff revises and resubmits (round 2).
    await decide(app, "vision_roadmap", "changes_requested", "Add a pricing experiment milestone");
    const [vision] = await app.approvals.list("pending");
    expect(vision).toMatchObject({ kind: "vision_roadmap", round: 2 });
    await decide(app, "vision_roadmap");

    expect((await app.lifecycle.get(ini!.id)).stage).toBe("definition");
    expect(await pendingKinds(app)).toEqual(["spec"]);
    await decide(app, "spec");

    expect((await app.lifecycle.get(ini!.id)).stage).toBe("architecture");
    expect(await pendingKinds(app)).toEqual(["architecture"]);
    const threatModel = (await app.docs.list({ initiativeId: ini!.id, kind: "threat_model" }))[0];
    expect(threatModel?.title).toMatch(/Threat model/);
    await decide(app, "architecture");

    // Planning bootstrapped the repo and mirrored the backlog; build assigned tasks to Copilot coding agent.
    const repo = gh.repos.get("acme/invoicelite")!;
    expect(repo).toBeDefined();
    expect([...repo.branches.keys()]).toEqual(expect.arrayContaining(["main", "develop"]));
    expect(repo.files.get("main")!.has(".github/agents/backend-engineer.agent.md")).toBe(true);
    expect([...repo.environments.keys()].sort()).toEqual(["production", "staging"]);
    const issues = [...repo.issues.values()];
    expect(issues).toHaveLength(4);
    expect(issues.find((i) => i.labels.includes("epic"))!.subIssues).toHaveLength(3);
    expect(issues.filter((i) => i.assignment?.baseBranch === "develop")).toHaveLength(3);

    const build = (await app.lifecycle.get(ini!.id)).stage;
    expect(build).toBe("build");
    const [waiting] = await app.engine.listJobDTOs({ status: "waiting" });
    expect(waiting).toMatchObject({ roleId: "engineering-manager", waitReason: "external" });

    // Delivery monitor sees the Copilot PRs → EM reviews and merges them → build completes.
    await app.delivery.tick();
    await app.engine.runUntilIdle();
    await app.delivery.tick();
    await app.engine.runUntilIdle();
    const prs = [...repo.prs.values()];
    expect(prs.filter((p) => p.merged && p.baseRef === "develop")).toHaveLength(3);
    expect(
      prs.filter((p) => p.baseRef === "develop").every((p) => p.reviews.some((r) => r.state === "APPROVED")),
    ).toBe(true);
    const [epic] = await app.work.list({ initiativeId: ini!.id, kind: "epic" });
    expect(epic?.status).toBe("done");
    expect(issues.find((i) => i.labels.includes("epic"))!.state).toBe("closed");
    const codingTasks = (await app.work.list({ initiativeId: ini!.id, kind: "task" })).filter(
      (t) => t.forCodingAgent,
    );
    expect(codingTasks).toHaveLength(3);
    expect(codingTasks.every((t) => t.status === "done" && t.codingStatus === "merged" && t.prUrl)).toBe(
      true,
    );

    // Verification → release: CEO approves the merge to main; Techgens merges with the CEO's identity.
    expect(await pendingKinds(app)).toEqual(["merge_to_main"]);
    // The merge gate carries its decision evidence: the release PR, its checks and size, release notes and test plan.
    const mergeGate = await app.approvals.detail((await app.approvals.list("pending"))[0]!.id);
    expect(mergeGate.payload).toMatchObject({
      stage: "release",
      prNumber: expect.any(Number),
      prUrl: expect.stringMatching(/^https:\/\/github\.com\/acme\/invoicelite\/pull\/\d+$/),
      prTitle: "Release: InvoiceLite MVP",
      checks: [
        { name: "ci / build-and-test", conclusion: "success" },
        { name: "codeql / analyze", conclusion: "success" },
      ],
      filesChanged: 7,
      additions: 19,
      deletions: 0,
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      releaseNotes: expect.stringMatching(/^## Highlights/),
      releaseNotesDocumentId: expect.any(String),
    });
    expect(mergeGate.payload.changes).toEqual(codingTasks.map((t) => `#${t.prNumber} ${t.title}`));
    expect(mergeGate.documents.map((d) => d.kind).sort()).toEqual(["release_notes", "test_plan"]);
    await decide(app, "merge_to_main");
    const release = prs.length ? [...repo.prs.values()].find((p) => p.baseRef === "main")! : undefined;
    expect(release).toMatchObject({ merged: true, headRef: "develop" });

    // Deployment: production run waits for the environment approval → CEO approves in Techgens.
    expect(await pendingKinds(app)).toEqual(["prod_deploy"]);
    const prodRun = repo.runs.find((r) => r.branch === "main")!;
    expect(prodRun.status).toBe("waiting");
    const deployGate = await app.approvals.detail((await app.approvals.list("pending"))[0]!.id);
    expect(deployGate.payload).toMatchObject({
      stage: "deployment",
      environment: "production",
      runId: prodRun.id,
      runUrl: `https://github.com/acme/invoicelite/actions/runs/${prodRun.id}`,
      commitSha: prodRun.sha,
      stagingVerified: true,
      stagingEvidence: expect.stringMatching(
        /^deploy-staging run \d+ succeeded on [0-9a-f]{7}; QA verification: "InvoiceLite MVP — Test plan/,
      ),
      rollback: expect.stringMatching(/previous Container Apps revision/),
      changes: mergeGate.payload.changes,
      releasePrNumber: release!.number,
      releasePrUrl: release!.url,
    });
    await decide(app, "prod_deploy");
    expect(repo.runs.find((r) => r.id === prodRun.id)).toMatchObject({
      status: "completed",
      conclusion: "success",
    });

    const done = await app.lifecycle.detail(ini!.id);
    expect(done.status).toBe("completed");
    expect(done.stages.every((s) => s.state === "done")).toBe(true);
    expect(
      done.approvals
        .filter((a) => a.status === "approved")
        .map((a) => a.kind)
        .sort(),
    ).toEqual(["architecture", "merge_to_main", "prod_deploy", "spec", "vision_roadmap"]);
    const kinds = new Set(done.documents.map((d) => d.kind));
    for (const k of [
      "charter",
      "roadmap",
      "research",
      "prd",
      "ux_spec",
      "architecture",
      "adr",
      "threat_model",
      "plan",
      "test_plan",
      "release_notes",
      "runbook",
    ])
      expect(kinds, k).toContain(k);
    const developDocs = [...repo.files.get("develop")!.entries()].filter(([path]) =>
      path.startsWith("docs/"),
    );
    expect(
      developDocs.some(([path, content]) => path.startsWith("docs/product/") && content.includes("PRD")),
    ).toBe(true);
    expect(
      developDocs.some(
        ([path, content]) => path.startsWith("docs/architecture/") && content.includes("Container Apps"),
      ),
    ).toBe(true);

    const failed = await app.engine.listJobDTOs({ status: "failed" });
    expect(failed).toEqual([]);
    const usage = await app.budget.summary(1);
    expect(usage.todayCredits).toBeGreaterThan(0);
    expect(usage.byInitiative[0]?.initiativeId).toBe(ini!.id);
    const stageEvents = await app.bus.list({ subjectType: "initiative", subjectId: ini!.id, limit: 200 });
    expect(stageEvents.filter((e) => e.type === "initiative.stage_changed")).toHaveLength(11);
  });
});

describe("guardrails", () => {
  let h: DbHandle;
  let app: Techgens;
  let runtime: FakeAgentRuntime;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app, runtime } = await createTestApp(h));
  });
  afterAll(async () => {
    await h.close();
  });

  it("pauses work on a budget overrun until the CEO grants extra credits", async () => {
    await app.budget.upsertBudgets([
      { scope: "company", scopeId: null, period: "month", limitCredits: 0.000001 },
    ]);
    await app.db.insert(schema.usageLedger).values({ nanoAiu: 5_000, source: "estimate" });
    const thread = await app.chat.createThread();
    await app.chat.postCeoMessage(thread.id, "What's our status?");
    await app.engine.runUntilIdle();
    const [blocked] = await app.engine.listJobDTOs({ status: "waiting" });
    expect(blocked).toMatchObject({ waitReason: "approval", roleId: "chief-of-staff" });
    expect(await pendingKinds(app)).toEqual(["budget_overrun"]);
    await decide(app, "budget_overrun");
    // Default suggestion (≥10 credits) was granted for this window.
    expect((await app.chat.messages(thread.id)).at(-1)?.content).toMatch(/where we stand/);
  });

  it("blocks upward delegation, loops and excessive depth", async () => {
    runtime.on("cpo", async (ctx) => {
      const up = await ctx.callTool("delegate_task", {
        assignee: "chief-of-staff",
        title: "Do my job",
        instructions: "Please take this over entirely.",
        expectedOutput: "everything",
      });
      ctx.say(up);
    });
    runtime.on("chief-of-staff", async (ctx) => {
      if (ctx.turn > 0) return void (await ctx.callTool("complete_task", { summary: "ok" }));
      await ctx.callTool("delegate_task", {
        assignee: "cpo",
        title: "Prioritise backlog",
        instructions: "Rank the backlog by impact.",
        expectedOutput: "ranked list",
      });
    });
    const cos = (await app.org.agentForRole("chief-of-staff"))!;
    await app.engine.createJob({ agentId: cos.id, prompt: "Kick off" });
    await app.engine.runUntilIdle();
    const toolEvents = await app.bus.list({ limit: 200 });
    const cpoJob = (await app.engine.listJobDTOs({ limit: 50 })).find((j) => j.roleId === "cpo")!;
    expect(cpoJob.resultSummary).toMatch(/Don't delegate upward/);
    expect(toolEvents.some((e) => e.type === "agent.tool_call")).toBe(true);
    const [cosRow] = await app.db.select().from(schema.jobs).where(eq(schema.jobs.agentId, cos.id));
    expect(cosRow).toBeDefined();
  });
});
