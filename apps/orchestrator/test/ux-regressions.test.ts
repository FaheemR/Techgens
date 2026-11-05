import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  creditsToNano,
  periodStart,
  type BudgetDTO,
  type DashboardDTO,
  type GoalDTO,
  type OrgDTO,
  type ThreadDTO,
} from "@techgens/core";
import { schema, type DbHandle } from "@techgens/db";
import { createTestDb } from "@techgens/db/testing";
import { buildServer } from "../src/api/server";
import type { Techgens } from "../src/app";
import { createTestApp } from "./helpers";

let h: DbHandle;
let app: Techgens;
let server: FastifyInstance;
beforeAll(async () => {
  h = await createTestDb();
  ({ app } = await createTestApp(h));
  server = await buildServer(app);
});
afterAll(async () => {
  await server?.close();
  await h?.close();
});
const get = async <T>(url: string): Promise<T> => {
  const res = await server.inject({ method: "GET", url });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as T;
};
const patch = (url: string, payload: Record<string, unknown>) =>
  server.inject({ method: "PATCH", url, payload });
const retire = (agentId: string) => patch(`/api/agents/${agentId}`, { status: "retired" });
const effects = async () => ({
  messages: await app.db.select().from(schema.messages).orderBy(schema.messages.id),
  jobs: await app.db.select().from(schema.jobs).orderBy(schema.jobs.id),
  events: await app.db.select().from(schema.events).orderBy(schema.events.seq),
});

describe("UX dashboard setup facts", () => {
  it("uses strategy connection and CEO-message facts independently of onboarding dismissal", async () => {
    await app.company.update({ name: "Techgens", mission: "", policies: "", onboarded: true });
    expect((await get<DashboardDTO>("/api/dashboard")).setup).toEqual({
      strategy: false,
      github: true,
      directive: false,
    });
    await app.company.update({ mission: "Ship useful products", policies: " " });
    expect((await get<DashboardDTO>("/api/dashboard")).setup.strategy).toBe(false);
    await app.company.update({ policies: "Review before release", name: " " });
    expect((await get<DashboardDTO>("/api/dashboard")).setup.strategy).toBe(false);
    await app.company.update({ name: "Techgens", mission: " " });
    expect((await get<DashboardDTO>("/api/dashboard")).setup.strategy).toBe(false);
    await app.company.update({ mission: "Ship useful products", onboarded: false });
    expect((await get<DashboardDTO>("/api/dashboard")).setup).toEqual({
      strategy: true,
      github: true,
      directive: false,
    });
    const disconnected = vi.spyOn(app.github, "connected", "get").mockReturnValue(false);
    try {
      expect((await get<DashboardDTO>("/api/dashboard")).setup.github).toBe(false);
    } finally {
      disconnected.mockRestore();
    }
    const thread = await app.chat.createThread("Setup");
    const cos = (await app.org.agentForRole("chief-of-staff"))!;
    await app.db
      .insert(schema.messages)
      .values({ threadId: thread.id, authorType: "agent", authorAgentId: cos.id, content: "Ready to help" });
    expect((await get<DashboardDTO>("/api/dashboard")).setup.directive).toBe(false);
    const sent = await server.inject({
      method: "POST",
      url: `/api/chat/threads/${thread.id}/messages`,
      payload: { content: "Give a status update" },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    expect((await get<DashboardDTO>("/api/dashboard")).setup.directive).toBe(true);
  });
});

describe("UX thread lifecycle HTTP", () => {
  it("trims renamed titles and accepts the exact 160-character boundary", async () => {
    const thread = await app.chat.createThread();
    const renamed = await patch(`/api/chat/threads/${thread.id}`, { title: "  Release planning  " });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json()).toMatchObject({ id: thread.id, title: "Release planning", archived: false });
    const boundary = await patch(`/api/chat/threads/${thread.id}`, { title: "x".repeat(160) });
    expect(boundary.statusCode, boundary.body).toBe(200);
    expect((await get<ThreadDTO[]>("/api/chat/threads")).find((t) => t.id === thread.id)?.title).toBe(
      "x".repeat(160),
    );
  });

  it.each([
    { name: "empty", title: "" },
    { name: "whitespace", title: " \n\t " },
    { name: "too long", title: "x".repeat(161) },
    { name: "wrong type", title: 42 },
  ])("rejects $name thread rename without changing the saved title", async ({ title }) => {
    const thread = await app.chat.createThread("Keep this title");
    const before = await app.chat.getThread(thread.id);
    const res = await patch(`/api/chat/threads/${thread.id}`, { title });
    expect(res.statusCode).toBe(400);
    expect(await app.chat.getThread(thread.id)).toEqual(before);
  });

  it("rejects archived directives without messages jobs events or timestamp side effects and restores history", async () => {
    const thread = await app.chat.createThread("Historical conversation");
    const cos = (await app.org.agentForRole("chief-of-staff"))!;
    const first = await server.inject({
      method: "POST",
      url: `/api/chat/threads/${thread.id}/messages`,
      payload: { content: "Original CEO directive" },
    });
    expect(first.statusCode, first.body).toBe(200);
    await app.chat.postAgentReply(thread.id, cos.id, "Original agent response", first.json().jobId);
    const history = await app.chat.messages(thread.id);
    expect(history.map((m) => [m.authorName, m.content])).toEqual([
      ["CEO", "Original CEO directive"],
      ["Morgan", "Original agent response"],
    ]);
    const archived = await patch(`/api/chat/threads/${thread.id}`, { archived: true });
    expect(archived.statusCode, archived.body).toBe(200);
    expect(archived.json()).toMatchObject({
      id: thread.id,
      archived: true,
      title: "Historical conversation",
    });
    const before = await effects();
    const savedThread = await app.chat.getThread(thread.id);
    const denied = await server.inject({
      method: "POST",
      url: `/api/chat/threads/${thread.id}/messages`,
      payload: { content: "Must not run" },
    });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toMatchObject({
      error: "Restore this conversation before sending another directive.",
    });
    expect(await effects()).toEqual(before);
    expect(await app.chat.getThread(thread.id)).toEqual(savedThread);
    expect(await get(`/api/chat/threads/${thread.id}/messages`)).toEqual(history);
    const restored = await patch(`/api/chat/threads/${thread.id}`, { archived: false });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({ archived: false, title: "Historical conversation" });
    expect(await app.chat.messages(thread.id)).toEqual(history);
    const next = await server.inject({
      method: "POST",
      url: `/api/chat/threads/${thread.id}/messages`,
      payload: { content: "Continue after restore" },
    });
    expect(next.statusCode, next.body).toBe(200);
    const after = await app.chat.messages(thread.id);
    expect(after.slice(0, 2)).toEqual(history);
    expect(after[2]).toMatchObject({ authorType: "ceo", content: "Continue after restore" });
    expect(await app.engine.getJob(next.json().jobId)).toMatchObject({
      threadId: thread.id,
      prompt: "Continue after restore",
      status: "queued",
    });
  });

  it("returns not found when renaming a missing conversation", async () => {
    expect((await patch(`/api/chat/threads/${randomUUID()}`, { title: "Missing" })).statusCode).toBe(404);
  });
});

describe("UX goal baseline HTTP persistence", () => {
  it("persists created baseline and patches current values without losing the baseline", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/goals",
      payload: {
        title: "Retention",
        type: "key_result",
        startValue: 35,
        targetValue: 60,
        currentValue: 35,
        unit: "%",
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const goal = created.json() as GoalDTO;
    expect(goal).toMatchObject({ startValue: 35, targetValue: 60, currentValue: 35 });
    const updated = await patch(`/api/goals/${goal.id}`, { currentValue: 47.5 });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ startValue: 35, targetValue: 60, currentValue: 47.5 });
    expect((await get<GoalDTO[]>("/api/goals")).find((g) => g.id === goal.id)).toMatchObject({
      startValue: 35,
      currentValue: 47.5,
    });
    const changed = await patch(`/api/goals/${goal.id}`, { startValue: 0 });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ startValue: 0, currentValue: 47.5 });
    expect((await patch(`/api/goals/${goal.id}`, { startValue: null })).statusCode).toBe(200);
    expect((await get<GoalDTO[]>("/api/goals")).find((g) => g.id === goal.id)?.startValue).toBeNull();
  });

  it("keeps omitted legacy baselines null and accepts descending or zero targets", async () => {
    for (const [title, fields] of [
      ["Legacy", { targetValue: 60, currentValue: 30 }],
      ["Reduce latency", { startValue: 60, targetValue: 35, currentValue: 47.5 }],
      ["Eliminate defects", { startValue: 10, targetValue: 0, currentValue: 5 }],
    ] as const) {
      const res = await server.inject({ method: "POST", url: "/api/goals", payload: { title, ...fields } });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({
        ...fields,
        startValue: "startValue" in fields ? fields.startValue : null,
      });
    }
  });

  it("rejects nonnumeric baseline on create and patch without modifying goals", async () => {
    const existing = await app.company.createGoal({ title: "Stable baseline", startValue: 35 });
    const before = await get<GoalDTO[]>("/api/goals");
    const created = await server.inject({
      method: "POST",
      url: "/api/goals",
      payload: { title: "Invalid", startValue: "35" },
    });
    expect(created.statusCode).toBe(400);
    expect((await patch(`/api/goals/${existing.id}`, { startValue: "35" })).statusCode).toBe(400);
    expect(await get<GoalDTO[]>("/api/goals")).toEqual(before);
  });
});

describe("UX agent retirement guards", () => {
  it.each(["queued", "running", "waiting"] as const)("blocks retirement with a %s job", async (status) => {
    const agent = await app.org.hire("backend-engineer", `Job guard ${status}`);
    const [job] = await app.db
      .insert(schema.jobs)
      .values({ agentId: agent.id, prompt: "Open assignment", status })
      .returning();
    const before = await app.bus.list({ subjectType: "agent", subjectId: agent.id });
    const res = await retire(agent.id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({
      code: "conflict",
      error: "Finish or cancel this agent's jobs before retiring them.",
    });
    expect((await app.org.getAgent(agent.id)).status).toBe("active");
    expect((await app.engine.getJob(job!.id)).status).toBe(status);
    expect(await app.bus.list({ subjectType: "agent", subjectId: agent.id })).toEqual(before);
  });

  it.each(["backlog", "ready", "in_progress", "blocked", "in_review"] as const)(
    "blocks retirement with %s assigned work",
    async (status) => {
      const agent = await app.org.hire("backend-engineer", `Work guard ${status}`);
      const item = await app.work.create({
        kind: "task",
        title: "Unfinished assignment",
        assigneeAgentId: agent.id,
        status,
      });
      const res = await retire(agent.id);
      expect(res.statusCode, res.body).toBe(409);
      expect((await app.org.getAgent(agent.id)).status).toBe("active");
      expect(await app.work.get(item.id)).toMatchObject({ assigneeAgentId: agent.id, status });
    },
  );

  it("retires agents with terminal work and retains jobs messages memories and attribution", async () => {
    const agent = await app.org.hire("backend-engineer", "Historical engineer");
    const jobs = await app.db
      .insert(schema.jobs)
      .values(
        (["succeeded", "failed", "cancelled"] as const).map((status) => ({
          agentId: agent.id,
          prompt: `Historical ${status}`,
          status,
        })),
      )
      .returning();
    const items = await Promise.all(
      (["done", "cancelled"] as const).map((status) =>
        app.work.create({ kind: "task", title: `Historical ${status}`, assigneeAgentId: agent.id, status }),
      ),
    );
    await app.db
      .insert(schema.memories)
      .values({ agentId: agent.id, content: "Migration requires a backup." });
    const thread = await app.chat.createThread("History");
    await app.chat.postAgentReply(thread.id, agent.id, "Completed the migration review.", jobs[0]!.id);
    const res = await retire(agent.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: agent.id, status: "retired", name: "Historical engineer" });
    const detail = await app.org.agentDetail(agent.id);
    expect(detail.recentJobs.map((j) => j.status).sort()).toEqual(["cancelled", "failed", "succeeded"]);
    expect(detail.memories.map((m) => m.content)).toEqual(["Migration requires a backup."]);
    expect((await app.chat.messages(thread.id))[0]).toMatchObject({
      authorName: "Historical engineer",
      content: "Completed the migration review.",
    });
    expect(await app.work.dtos(await Promise.all(items.map((item) => app.work.get(item.id))))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "done", assigneeName: "Historical engineer" }),
        expect.objectContaining({ status: "cancelled", assigneeName: "Historical engineer" }),
      ]),
    );
    expect((await get<OrgDTO>("/api/org")).agents.find((a) => a.id === agent.id)?.status).toBe("retired");
    expect((await app.bus.list({ subjectType: "agent", subjectId: agent.id }))[0]?.summary).toBe(
      "Historical engineer retired; history retained",
    );
  });

  it.each([
    { from: "done", to: "ready" },
    { from: "done", to: "in_progress" },
    { from: "cancelled", to: "ready" },
    { from: "cancelled", to: "in_progress" },
  ] as const)("rejects reopening $from work to $to when its assignee is retired", async ({ from, to }) => {
    const agent = await app.org.hire("backend-engineer", `Reopening guard ${from} ${to}`);
    const item = await app.work.create({
      kind: "task",
      title: "Keep terminal work intact",
      description: "Historical assignment",
      status: from,
      assigneeAgentId: agent.id,
    });

    // Reopening is allowed while the assignee is active; retirement is the distinguishing guard.
    const allowed = await patch(`/api/work-items/${item.id}`, { status: to });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.json()).toMatchObject({ id: item.id, status: to, assigneeAgentId: agent.id });
    await app.work.update(item.id, { status: from });
    expect((await retire(agent.id)).statusCode).toBe(200);
    const before = await app.work.get(item.id);
    const eventsBefore = await app.bus.list({ subjectType: "work_item", subjectId: item.id });

    const denied = await patch(`/api/work-items/${item.id}`, {
      status: to,
      title: "Must not change on rejected reopening",
      description: "Must not replace historical description",
    });

    expect(denied.statusCode, denied.body).toBe(409);
    expect(denied.json()).toMatchObject({
      code: "conflict",
      error: "Choose a non-retired agent for this work item.",
    });
    expect(await app.work.get(item.id)).toEqual(before);
    expect(before).toMatchObject({
      status: from,
      assigneeAgentId: agent.id,
      title: "Keep terminal work intact",
      description: "Historical assignment",
    });
    expect(await app.bus.list({ subjectType: "work_item", subjectId: item.id })).toEqual(eventsBefore);
  });

  it("rejects invalid replacement choices atomically and allows replacement only for retirement", async () => {
    const agent = await app.org.hire("backend-engineer", "Replacement source");
    const paused = await app.org.hire("backend-engineer", "Paused replacement");
    await app.org.updateAgent(paused.id, { status: "paused" });
    const retired = await app.org.hire("backend-engineer", "Retired replacement");
    expect((await retire(retired.id)).statusCode).toBe(200);
    const wrongRole = (await app.org.agentForRole("chief-of-staff"))!;
    const item = await app.work.create({
      kind: "task",
      title: "Keep original owner",
      assigneeAgentId: agent.id,
    });
    for (const replacementAgentId of [agent.id, paused.id, retired.id, wrongRole.id, randomUUID()]) {
      const before = await app.work.get(item.id);
      const res = await patch(`/api/agents/${agent.id}`, { status: "retired", replacementAgentId });
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json()).toMatchObject({
        error: "Choose a different active agent with the same role as the replacement.",
      });
      expect((await app.org.getAgent(agent.id)).status).toBe("active");
      expect(await app.work.get(item.id)).toEqual(before);
    }
    const replacement = await app.org.hire("backend-engineer", "Valid replacement");
    const res = await patch(`/api/agents/${agent.id}`, {
      status: "paused",
      replacementAgentId: replacement.id,
    });
    expect(res.statusCode).toBe(400);
    expect((await app.org.getAgent(agent.id)).status).toBe("active");
    expect((await app.work.get(item.id)).assigneeAgentId).toBe(agent.id);
  });

  it("atomically transfers only unfinished work to the selected same-role replacement without moving jobs", async () => {
    const agent = await app.org.hire("backend-engineer", "Transfer source");
    const replacement = await app.org.hire("backend-engineer", "Transfer destination");
    const work = await Promise.all(
      (["ready", "blocked", "in_review", "done", "cancelled"] as const).map((status) =>
        app.work.create({
          kind: "task",
          title: `Transfer fixture ${status}`,
          status,
          assigneeAgentId: agent.id,
        }),
      ),
    );
    const [job] = await app.db
      .insert(schema.jobs)
      .values({
        agentId: agent.id,
        prompt: "Do not move this session",
        status: "succeeded",
        sessionId: "historical-session",
      })
      .returning();
    const jobsBefore = await app.db.select().from(schema.jobs);
    const res = await patch(`/api/agents/${agent.id}`, {
      status: "retired",
      replacementAgentId: replacement.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: agent.id, status: "retired" });
    for (const item of work) {
      expect(await app.work.get(item.id)).toMatchObject({
        title: item.title,
        status: item.status,
        assigneeAgentId: ["done", "cancelled"].includes(item.status) ? agent.id : replacement.id,
      });
    }
    expect(await app.db.select().from(schema.jobs)).toEqual(jobsBefore);
    expect(await app.engine.getJob(job!.id)).toMatchObject({
      agentId: agent.id,
      sessionId: "historical-session",
    });
    expect((await app.bus.list({ subjectType: "agent", subjectId: agent.id }))[0]).toMatchObject({
      summary:
        "Transfer source retired; history retained; unfinished work reassigned to the selected replacement",
      data: { replacementAgentId: replacement.id },
    });
  });

  it("does not bypass open-job retirement guard even with a valid selected replacement", async () => {
    const agent = await app.org.hire("backend-engineer", "Open transfer source");
    const replacement = await app.org.hire("backend-engineer", "Open transfer destination");
    const item = await app.work.create({
      kind: "task",
      title: "Do not transfer yet",
      assigneeAgentId: agent.id,
    });
    const job = await app.engine.createJob({
      agentId: agent.id,
      prompt: "Still queued",
      workItemId: item.id,
    });
    const res = await patch(`/api/agents/${agent.id}`, {
      status: "retired",
      replacementAgentId: replacement.id,
    });
    expect(res.statusCode).toBe(409);
    expect((await app.org.getAgent(agent.id)).status).toBe("active");
    expect((await app.work.get(item.id)).assigneeAgentId).toBe(agent.id);
    expect(await app.engine.getJob(job.id)).toMatchObject({ agentId: agent.id, status: "queued" });
  });

  it("rejects retired-agent job work creation and reassignment without side effects", async () => {
    const agent = await app.org.hire("backend-engineer", "Unavailable engineer");
    expect((await retire(agent.id)).statusCode).toBe(200);
    const unassigned = await app.work.create({ kind: "task", title: "Keep unassigned" });
    const before = await effects();
    const beforeWork = await app.work.list();
    await expect(
      app.engine.createJob({ agentId: agent.id, prompt: "Must not enqueue" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      app.work.create({ kind: "task", title: "Must not create", assigneeAgentId: agent.id }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      app.work.update(unassigned.id, { assigneeAgentId: agent.id, title: "Must not update" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(app.org.resolveAgent(agent.name)).rejects.toMatchObject({ code: "invalid" });
    const active = await app.org.resolveAgent("backend-engineer");
    expect(active.status).toBe("active");
    expect(active.id).not.toBe(agent.id);
    expect(await effects()).toEqual(before);
    expect(await app.work.list()).toEqual(beforeWork);
  });

  it("rejects missing-agent assignment without creating jobs or mutating work", async () => {
    const missingAgentId = randomUUID();
    const item = await app.work.create({ kind: "task", title: "Keep missing-agent assignment out" });
    const before = await effects();
    await expect(
      app.engine.createJob({ agentId: missingAgentId, prompt: "Missing agent" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      app.work.create({ kind: "task", title: "Missing agent", assigneeAgentId: missingAgentId }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(app.work.update(item.id, { assigneeAgentId: missingAgentId })).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await app.work.get(item.id)).assigneeAgentId).toBeNull();
    expect(await effects()).toEqual(before);
  });

  it("requires an active replacement before retiring the last Chief of Staff and relinks reports", async () => {
    const current = (await app.org.agentForRole("chief-of-staff"))!;
    // Earlier chat cases intentionally left jobs queued; finish fixture jobs before testing the distinct COS guard.
    await app.db.update(schema.jobs).set({ status: "cancelled" }).where(eq(schema.jobs.agentId, current.id));
    const denied = await retire(current.id);
    expect(denied.statusCode).toBe(409);
    expect(denied.json()).toMatchObject({
      error: "Hire an active Chief of Staff before retiring the last one.",
    });
    const replacement = await app.org.hire("chief-of-staff", "Replacement COS");
    await app.org.updateAgent(replacement.id, { status: "paused" });
    expect((await retire(current.id)).statusCode).toBe(409);
    await app.org.updateAgent(replacement.id, { status: "active" });
    expect((await retire(current.id)).statusCode).toBe(200);
    expect((await app.org.agentForRole("chief-of-staff"))?.id).toBe(replacement.id);
    const roles = await app.org.listRoles();
    const reports = (await app.org.listAgentRows()).filter((a) =>
      roles.some((r) => r.id === a.roleId && r.reportsTo === "chief-of-staff"),
    );
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((a) => a.managerAgentId === replacement.id)).toBe(true);
  });

  describe("UX conservative release gate evidence", () => {
    it("holds merge guidance when no linked PR or completed checks can be verified", async () => {
      const [ini] = await app.db
        .insert(schema.initiatives)
        .values({ title: "Unlinked release", directive: "Release only with evidence" })
        .returning();
      const result = await app.delivery.gateEvidence("merge_to_main", ini!, {
        risk: "No risk",
        recommendation: "Approve now",
        checks: [{ name: "test", conclusion: "success" }],
      });
      expect(result.payload).toMatchObject({
        risk: "Changes the product's default branch and may trigger its release workflows. Change size is unavailable. Passing checks do not establish user impact or migration safety; review the change set and release notes.",
        recommendation:
          "Hold the merge decision until the release PR and completed passing checks can be verified.",
        changes: [],
        releaseNotes: null,
      });
      expect(result.documentIds).toEqual([]);
    });

    it("holds deployment guidance rather than trusting supplied staging-success claims", async () => {
      const [ini] = await app.db
        .insert(schema.initiatives)
        .values({ title: "Unlinked deployment", directive: "Deploy only with evidence" })
        .returning();
      const result = await app.delivery.gateEvidence("prod_deploy", ini!, {
        stagingVerified: true,
        recommendation: "Ship now",
      });
      expect(result.payload).toMatchObject({
        environment: "production",
        stagingVerified: false,
        stagingEvidence: "No staging deployment found.",
        risk: "Changes the production environment used by customers. Downtime, data migrations and configuration effects require review; a staging success alone does not establish production safety.",
        recommendation:
          "Hold deployment until the intended workflow and successful staging evidence for the released code are verified.",
      });
      expect(result.documentIds).toEqual([]);
      expect(await app.delivery.gateEvidence("spec", ini!, {})).toEqual({ payload: {}, documentIds: [] });
    });
  });
});

describe("UX persisted dashboard attention inputs", () => {
  it("exposes blocked counts paused reasons pending approvals enabled budgets and unresolved incidents", async () => {
    const [ini] = await app.db
      .insert(schema.initiatives)
      .values({
        title: "Blocked launch",
        directive: "Launch safely",
        status: "paused",
        statusReason: "Needs CEO decision",
      })
      .returning();
    await app.work.create({
      kind: "task",
      title: "Waiting for review",
      status: "blocked",
      initiativeId: ini!.id,
    });
    const { approval } = await app.approvals.request({
      kind: "decision",
      title: "Choose launch scope",
      summary: "Scope required",
      initiativeId: ini!.id,
    });
    await app.db.insert(schema.incidents).values([
      { title: "Open incident", severity: "sev2", status: "open", source: "manual" },
      { title: "Resolved incident", severity: "sev2", status: "resolved", source: "manual" },
    ]);
    await app.budget.upsertBudgets([
      { scope: "company", period: "month", scopeId: null, limitCredits: 100, enabled: false },
    ]);
    const data = await get<DashboardDTO>("/api/dashboard");
    expect(data.initiatives.find((i) => i.id === ini!.id)).toMatchObject({
      title: "Blocked launch",
      status: "paused",
      statusReason: "Needs CEO decision",
      workItems: { blocked: 1, total: 1 },
    });
    expect(data.pendingApprovals.find((a) => a.id === approval.id)).toMatchObject({
      title: "Choose launch scope",
      status: "pending",
    });
    expect(data.budgets.find((b) => b.scope === "company" && b.period === "month")).toMatchObject({
      enabled: false,
      limitCredits: 100,
    });
    expect(data.openIncidents).toBe(1);
  });
});

describe("UX scoped budget spend evidence", () => {
  beforeEach(() => {
    // Freeze only Date; database I/O and runner timeouts keep their real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("groups current-window usage by agent for each scope and includes unattributed usage", async () => {
    const a = await app.org.hire("backend-engineer", "Budget Alpha");
    const b = await app.org.hire("backend-engineer", "Budget Beta");
    const [product] = await app.db
      .insert(schema.products)
      .values({ name: "Budget product", slug: "budget-product" })
      .returning();
    const [initiative] = await app.db
      .insert(schema.initiatives)
      .values({ title: "Budget initiative", directive: "Track scope" })
      .returning();
    const start = periodStart("day");
    await app.db.insert(schema.usageLedger).values([
      {
        agentId: a.id,
        department: "engineering",
        productId: product!.id,
        initiativeId: initiative!.id,
        nanoAiu: creditsToNano(2),
        createdAt: start,
      },
      {
        agentId: a.id,
        department: "engineering",
        productId: product!.id,
        initiativeId: initiative!.id,
        nanoAiu: creditsToNano(0.5),
        createdAt: new Date(start.getTime() + 1),
      },
      { agentId: b.id, department: "engineering", nanoAiu: creditsToNano(3), createdAt: start },
      {
        agentId: b.id,
        department: "operations",
        productId: product!.id,
        nanoAiu: creditsToNano(7),
        createdAt: start,
      },
      { agentId: null, department: "operations", nanoAiu: creditsToNano(0.25), createdAt: start },
      {
        agentId: a.id,
        department: "engineering",
        productId: product!.id,
        initiativeId: initiative!.id,
        nanoAiu: creditsToNano(100),
        createdAt: new Date(start.getTime() - 1),
      },
    ]);
    const budget = (
      scope: BudgetDTO["scope"],
      scopeId: string | null,
      period: BudgetDTO["period"] = "day",
    ): BudgetDTO => ({
      id: randomUUID(),
      scope,
      scopeId,
      scopeLabel: scope,
      period,
      limitCredits: 100,
      grantedCredits: 0,
      windowEndsAt: null,
      warnPct: 80,
      enabled: true,
      spentCredits: 0,
      state: "ok",
    });
    expect(await app.budget.spendByAgent(budget("company", null))).toEqual([
      { agentName: "Budget Beta", credits: 10 },
      { agentName: "Budget Alpha", credits: 2.5 },
      { agentName: "Unattributed usage", credits: 0.25 },
    ]);
    expect(await app.budget.spendByAgent(budget("agent", a.id))).toEqual([
      { agentName: "Budget Alpha", credits: 2.5 },
    ]);
    expect(await app.budget.spendByAgent(budget("department", "engineering"))).toEqual([
      { agentName: "Budget Beta", credits: 3 },
      { agentName: "Budget Alpha", credits: 2.5 },
    ]);
    expect(await app.budget.spendByAgent(budget("initiative", initiative!.id))).toEqual([
      { agentName: "Budget Alpha", credits: 2.5 },
    ]);
    expect(await app.budget.spendByAgent(budget("product", product!.id))).toEqual([
      { agentName: "Budget Beta", credits: 7 },
      { agentName: "Budget Alpha", credits: 2.5 },
    ]);
    expect(await app.budget.spendByAgent(budget("initiative", randomUUID()))).toEqual([]);
    expect(await app.budget.spendByAgent(budget("initiative", initiative!.id, "total"))).toEqual([
      { agentName: "Budget Alpha", credits: 102.5 },
    ]);
  });

  it.each(["week", "month"] as const)(
    "includes exact %s window start and excludes its preceding millisecond",
    async (period) => {
      const agent = await app.org.hire("backend-engineer", `Window ${period}`);
      const start = periodStart(period);
      await app.db.insert(schema.usageLedger).values([
        { agentId: agent.id, nanoAiu: creditsToNano(4), createdAt: start },
        { agentId: agent.id, nanoAiu: creditsToNano(9), createdAt: new Date(start.getTime() - 1) },
      ]);
      const budget: BudgetDTO = {
        id: randomUUID(),
        scope: "agent",
        scopeId: agent.id,
        scopeLabel: agent.name,
        period,
        limitCredits: 100,
        grantedCredits: 0,
        windowEndsAt: null,
        warnPct: 80,
        enabled: true,
        spentCredits: 0,
        state: "ok",
      };
      expect(await app.budget.spendByAgent(budget)).toEqual([{ agentName: agent.name, credits: 4 }]);
    },
  );
});
