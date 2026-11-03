import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { periodStart, type BudgetOverrunPayload } from "@techgens/core";
import { schema, type DbHandle } from "@techgens/db";
import { createTestDb } from "@techgens/db/testing";
import type { Techgens } from "../src/app";
import { createTestApp } from "./helpers";

async function directive(app: Techgens, content: string) {
  const thread = await app.chat.createThread();
  await app.chat.postCeoMessage(thread.id, content);
  await app.engine.runUntilIdle();
  return thread;
}

async function pendingFor(app: Techgens, initiativeId: string) {
  return (await app.approvals.list("pending")).filter((a) => a.initiativeId === initiativeId);
}

async function openJobs(app: Techgens, initiativeId: string) {
  return app.db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.initiativeId, initiativeId), inArray(schema.jobs.status, ["queued", "running", "waiting"])));
}

async function unreadApprovalNotifications(app: Techgens, approvalId: string) {
  return (await app.notifications.list(200)).filter((n) => n.link === `/approvals?id=${approvalId}` && !n.readAt);
}

describe("governance: rejected and cancelled initiatives", () => {
  let h: DbHandle;
  let app: Techgens;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app } = await createTestApp(h));
  });
  afterAll(async () => {
    await h.close();
  });

  it("pauses an initiative whose gate is rejected and restarts the stage with the feedback on resume", async () => {
    const thread = await directive(app, "Build SpendWise: expense tracking for small teams. MVP in 4 weeks, budget 50 credits/week.");
    const reply = (await app.chat.messages(thread.id)).at(-1)!.content;
    expect(reply).toMatch(/I set a total budget cap of 200 credits \(50 credits per week × 4 weeks\)/);
    const [ini] = await app.lifecycle.list();
    expect(ini).toMatchObject({ title: "SpendWise MVP", budgetCredits: 200, status: "active", statusReason: null });

    const [vision] = await pendingFor(app, ini!.id);
    expect(vision).toMatchObject({ kind: "vision_roadmap" });
    expect(await unreadApprovalNotifications(app, vision!.id)).toHaveLength(1);
    await app.approvals.decide(vision!.id, { outcome: "rejected", comment: "Too broad: focus on receipt capture only" });

    let paused = await app.lifecycle.get(ini!.id);
    expect(paused).toMatchObject({ status: "paused", statusReason: "Rejected at Vision & roadmap: Too broad: focus on receipt capture only" });
    const [summary] = await app.lifecycle.summaries([paused]);
    expect(summary).toMatchObject({ status: "paused", statusReason: paused.statusReason, pendingApprovals: 0 });
    expect(await openJobs(app, ini!.id)).toEqual([]);
    expect(await unreadApprovalNotifications(app, vision!.id)).toEqual([]);
    const intake = await app.lifecycle.stageWorkItem(ini!.id, "intake");
    expect(intake?.status).toBe("blocked");
    await app.engine.runUntilIdle();
    expect((await app.lifecycle.get(ini!.id)).status).toBe("paused");

    // Resume: the intake owner proposes a different approach, which arrives as a new pending approval.
    await app.lifecycle.resume(ini!.id);
    expect(await app.lifecycle.get(ini!.id)).toMatchObject({ status: "active", statusReason: null });
    const restarted = await openJobs(app, ini!.id);
    expect(restarted).toHaveLength(1);
    expect(restarted[0]!.prompt).toContain("The CEO rejected the previous proposal at the Vision & roadmap gate");
    expect(restarted[0]!.prompt).toContain("> Too broad: focus on receipt capture only");
    await app.lifecycle.resume(ini!.id); // idempotent: no second job
    expect(await openJobs(app, ini!.id)).toHaveLength(1);
    await app.engine.runUntilIdle();

    const [revised] = await pendingFor(app, ini!.id);
    expect(revised).toMatchObject({ kind: "vision_roadmap", status: "pending", round: 1 });
    expect(revised!.id).not.toBe(vision!.id);
    expect(revised!.summary).toMatch(/after your rejection/);
    const detail = await app.approvals.detail(revised!.id);
    expect(detail.documents.find((d) => d.kind === "charter")?.content).toContain("## Revised approach");
    expect((await app.approvals.get(vision!.id)).status).toBe("rejected");
    const stageItems = (await app.work.list({ initiativeId: ini!.id, kind: "stage" })).filter((w) => w.stage === "intake");
    expect(stageItems).toHaveLength(1);
    expect(stageItems[0]!.status).toBe("in_progress");

    await app.approvals.decide(revised!.id, { outcome: "approved", comment: "Much better" });
    await app.engine.runUntilIdle();
    paused = await app.lifecycle.get(ini!.id);
    expect(paused).toMatchObject({ status: "active", stage: "definition" });
    expect((await pendingFor(app, ini!.id)).map((a) => a.kind)).toEqual(["spec"]);
    const decisions = (await app.lifecycle.detail(ini!.id)).decisions.map((d) => d.summary);
    expect(decisions).toEqual(expect.arrayContaining([expect.stringMatching(/^CEO rejected: Vision & roadmap/), expect.stringMatching(/^CEO approved: Vision & roadmap/)]));

    // Work counts match the Work items tab (every item of the initiative, stage items included).
    const [counts] = await app.lifecycle.summaries([paused]);
    const listed = await app.work.dtos(await app.work.list({ initiativeId: ini!.id }));
    expect(counts!.workItems.total).toBe(listed.length);
    expect(counts!.workItems.done).toBe(listed.filter((w) => w.status === "done").length);
    expect(counts!.workItems.total).toBeGreaterThanOrEqual(3);
  });

  it("records CEO pause reasons and clears them on resume without duplicating jobs", async () => {
    const [ini] = await app.lifecycle.list();
    const before = await openJobs(app, ini!.id);
    expect(before.map((j) => j.status)).toEqual(["waiting"]);
    await app.lifecycle.pause(ini!.id, "Paused by the CEO");
    expect(await app.lifecycle.get(ini!.id)).toMatchObject({ status: "paused", statusReason: "Paused by the CEO" });
    await app.lifecycle.resume(ini!.id);
    expect(await app.lifecycle.get(ini!.id)).toMatchObject({ status: "active", statusReason: null });
    expect((await openJobs(app, ini!.id)).map((j) => j.id)).toEqual(before.map((j) => j.id));
  });

  it("withdraws pending gates when an initiative is cancelled", async () => {
    await directive(app, "Build Pawfect: a pet-sitting marketplace. MVP in 8 weeks.");
    const ini = (await app.lifecycle.list()).find((i) => i.title === "Pawfect MVP")!;
    expect(ini.budgetCredits).toBe(100);
    const [gate] = await pendingFor(app, ini.id);
    expect(gate).toMatchObject({ kind: "vision_roadmap" });

    await app.lifecycle.cancel(ini.id);
    const cancelled = await app.lifecycle.get(ini.id);
    expect(cancelled).toMatchObject({ status: "cancelled", statusReason: "Cancelled by the CEO" });
    expect(await pendingFor(app, ini.id)).toEqual([]);
    const withdrawn = await app.approvals.get(gate!.id);
    expect(withdrawn).toMatchObject({ status: "cancelled", decisionComment: "Withdrawn — the initiative was cancelled." });
    expect(withdrawn.decidedAt).toBeInstanceOf(Date);
    const [summary] = await app.lifecycle.summaries([cancelled]);
    expect(summary!.pendingApprovals).toBe(0);
    expect(summary!.workItems.cancelled).toBeGreaterThan(0);
    expect(summary!.workItems.inProgress).toBe(0);
    expect((await app.approvals.summaries([withdrawn]))[0]).toMatchObject({ status: "cancelled", decisionComment: "Withdrawn — the initiative was cancelled." });
    expect(await unreadApprovalNotifications(app, gate!.id)).toEqual([]);
    const events = await app.bus.list({ subjectType: "approval", subjectId: gate!.id });
    expect(events[0]).toMatchObject({ type: "approval.decided", data: { outcome: "withdrawn", status: "cancelled", initiativeId: ini.id } });
    expect(await openJobs(app, ini.id)).toEqual([]);
    const escalations = (await app.notifications.list(200)).filter((n) => n.kind === "escalation" && n.link === `/initiatives/${ini.id}`);
    expect(escalations).toEqual([]);
    await expect(app.lifecycle.resume(ini.id)).rejects.toThrow(/cancelled/);
  });

  it("answers questions without creating initiatives or products", async () => {
    const inis = (await app.lifecycle.list()).length;
    const products = (await app.company.listProducts()).length;
    const thread = await directive(app, "What is our total spend so far?");
    expect((await app.chat.messages(thread.id)).at(-1)!.content).toMatch(/^Here's where we stand/);
    expect(await app.lifecycle.list()).toHaveLength(inis);
    expect(await app.company.listProducts()).toHaveLength(products);
  });

  it("attaches follow-up directives to the existing product with a short title", async () => {
    const thread = await directive(app, "Build a client portal for SpendWise so freelancers' clients can view and pay invoices online. Budget 400 credits/week.");
    const ini = (await app.lifecycle.list())[0]!;
    expect(ini.title).toBe("Build a client portal for SpendWise");
    expect(ini.budgetCredits).toBe(400);
    const product = await app.company.getProduct(ini.productId!);
    expect(product.name).toBe("SpendWise");
    expect((await app.chat.messages(thread.id)).at(-1)!.content).toMatch(/I set a total budget cap of 400 credits: you gave 400 credits per week but no timeline/);
  });
});

describe("governance: budget grants and notifications", () => {
  let h: DbHandle;
  let app: Techgens;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app } = await createTestApp(h));
  });
  afterAll(async () => {
    await h.close();
  });

  it("grants overrun credits for the current window only and explains the decision", async () => {
    await app.budget.upsertBudgets([{ scope: "company", scopeId: null, period: "day", limitCredits: 0.000001 }]);
    const [budget] = (await app.budget.listBudgets()).filter((b) => b.scope === "company" && b.period === "day");
    // A grant from yesterday's window must not count today.
    const yesterday = new Date(periodStart("day").getTime() - 86_400_000);
    await app.db.insert(schema.budgetAlerts).values({ budgetId: budget!.id, periodStart: yesterday, state: "exceeded", extraCredits: 500 });
    await app.db.insert(schema.usageLedger).values({ nanoAiu: 5_000, source: "estimate" });

    const thread = await directive(app, "Status?");
    const [overrun] = await app.approvals.list("pending");
    expect(overrun).toMatchObject({ kind: "budget_overrun", title: "Company: day budget exceeded", initiativeId: null });
    const payload = (await app.approvals.detail(overrun!.id)).payload as unknown as BudgetOverrunPayload;
    expect(payload).toMatchObject({ budgetId: budget!.id, scope: "company", scopeName: "Company", period: "day", limitCredits: 0.000001, grantedCredits: 0, suggestedExtraCredits: 10 });
    expect(payload.jobIds).toHaveLength(1);
    expect(payload.spentCredits).toBeGreaterThan(0);
    expect(payload.windowEndsAt).toBe(new Date(periodStart("day").getTime() + 86_400_000).toISOString());
    expect(await unreadApprovalNotifications(app, overrun!.id)).toHaveLength(1);

    await app.approvals.decide(overrun!.id, { outcome: "approved" });
    await app.engine.runUntilIdle();
    const decided = await app.approvals.get(overrun!.id);
    expect(decided.decisionComment).toMatch(/^Granted 10 extra credits for today \(until \d{4}-\d{2}-\d{2} 00:00 UTC\)\.$/);
    expect(decided.payload).toMatchObject({ grantedExtraCredits: 10 });
    expect(await unreadApprovalNotifications(app, overrun!.id)).toEqual([]);
    const event = (await app.bus.list({ subjectType: "approval", subjectId: overrun!.id }))[0]!;
    expect(event.summary).toMatch(/Granted 10 extra credits for today/);

    const after = (await app.budget.listBudgets()).find((b) => b.id === budget!.id)!;
    expect(after).toMatchObject({ limitCredits: 0.000001, grantedCredits: 10, state: "ok" });
    expect(after.windowEndsAt).toBe(payload.windowEndsAt);
    expect((await app.chat.messages(thread.id)).at(-1)?.content).toMatch(/where we stand/);
  });

  it("marks approval notifications read when a gate is auto-approved or decided", async () => {
    await app.approvals.updateGatePolicy({ hire: false });
    const { approval, autoApproved } = await app.approvals.request({ kind: "hire", title: "Hire a second QA engineer", summary: "Parallel testing", payload: { roleId: "qa-engineer" } });
    expect(autoApproved).toBe(true);
    expect(await unreadApprovalNotifications(app, approval.id)).toEqual([]);
    await app.approvals.updateGatePolicy({ hire: true });
    const { approval: manual } = await app.approvals.request({ kind: "decision", title: "Pick a payment provider", summary: "Stripe or Adyen?" });
    expect(await unreadApprovalNotifications(app, manual.id)).toHaveLength(1);
    await app.approvals.decide(manual.id, { outcome: "approved", comment: "Stripe" });
    expect(await unreadApprovalNotifications(app, manual.id)).toEqual([]);
  });
});
