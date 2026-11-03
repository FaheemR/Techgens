import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { stageIndex, type ApprovalDetailDTO, type InitiativeDetailDTO } from "@techgens/core";
import { MIGRATIONS_FOLDER, schema, type DbHandle } from "@techgens/db";
import { createTestDb } from "@techgens/db/testing";
import type { FastifyInstance } from "fastify";
import type { FakeAgentRuntime } from "@techgens/runtime";
import { buildServer } from "../src/api/server";
import type { Techgens } from "../src/app";
import { createTestApp } from "./helpers";

async function pendingFor(app: Techgens, initiativeId: string) {
  return (await app.approvals.list("pending")).filter((a) => a.initiativeId === initiativeId);
}

async function gatesOf(app: Techgens, initiativeId: string, kind: "vision_roadmap" | "spec") {
  return app.db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.initiativeId, initiativeId), eq(schema.approvals.kind, kind)));
}

async function unreadNotices(app: Techgens, initiativeId: string) {
  return (await app.notifications.list(200)).filter(
    (n) => n.link === `/initiatives/${initiativeId}` && !n.readAt,
  );
}

describe("approved gates stay approved", () => {
  let h: DbHandle;
  let app: Techgens;
  let server: FastifyInstance;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app } = await createTestApp(h));
    server = await buildServer(app);
  });
  afterAll(async () => {
    await server.close();
    await h.close();
  });

  it("continues the stage after a budget grant instead of requesting the approved gate again", async () => {
    const thread = await app.chat.createThread();
    await app.chat.postCeoMessage(
      thread.id,
      "Build Tallybook: shared expense ledgers for clubs. MVP in 4 weeks, budget 200 credits.",
    );
    await app.engine.runUntilIdle();
    const ini = (await app.lifecycle.list())[0]!;
    const [vision] = await pendingFor(app, ini.id);
    await app.approvals.decide(vision!.id, { outcome: "approved", comment: "Go" });
    await app.engine.runUntilIdle();
    const [spec] = await pendingFor(app, ini.id);
    expect(spec).toMatchObject({ kind: "spec" });

    // The initiative's own budget (edited on the Budget page) runs out on the step right after the PRD approval.
    await server.inject({
      method: "PUT",
      url: "/api/budgets",
      payload: [{ scope: "initiative", scopeId: ini.id, period: "total", limitCredits: 0.001 }],
    });
    await app.approvals.decide(spec!.id, { outcome: "approved", comment: "PRD approved" });
    await app.engine.runUntilIdle();
    const [overrun] = await pendingFor(app, ini.id);
    expect(overrun).toMatchObject({ kind: "budget_overrun" });
    const [blocked] = await app.engine.listJobDTOs({ status: "waiting", initiativeId: ini.id });
    expect(blocked).toMatchObject({ roleId: "product-manager", waitReason: "approval" });
    // The approval reached the job but was not delivered yet: the budget check stopped its next turn.
    const undelivered = async () => (await app.engine.getJob(blocked!.id)).resumeMessage ?? "";
    expect(await undelivered()).toMatch(/^The CEO APPROVED "Product requirements/);

    // An explicit amount (here a numeric string with decimals) always wins over the suggestion.
    const granted = await server.inject({
      method: "POST",
      url: `/api/approvals/${overrun!.id}/decide`,
      payload: { outcome: "approved", extraCredits: "12.5" },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json() as ApprovalDetailDTO).toMatchObject({
      decisionComment: "Granted 12.5 credits on top of the total budget.",
      payload: { grantedExtraCredits: 12.5 },
    });
    expect(await undelivered()).toMatch(
      /^The CEO APPROVED "Product requirements[\s\S]*\n\nThe CEO granted 12\.5 extra credits; continue where you left off\.$/,
    );
    await app.engine.runUntilIdle();

    expect((await gatesOf(app, ini.id, "spec")).map((a) => a.status)).toEqual(["approved"]);
    expect(stageIndex((await app.lifecycle.get(ini.id)).stage)).toBeGreaterThan(stageIndex("definition"));
    expect((await pendingFor(app, ini.id)).map((a) => a.kind)).toEqual(["architecture"]);
    const pm = (await app.engine.listJobDTOs({ initiativeId: ini.id })).find(
      (j) => j.roleId === "product-manager" && j.workItemTitle?.startsWith("Definition"),
    );
    expect(pm).toMatchObject({
      status: "succeeded",
      resultSummary: "Product requirements approved by the CEO.",
    });

    // One budget record: the card shows the enforced limit plus the grant.
    const detail = (
      await server.inject({ method: "GET", url: `/api/initiatives/${ini.id}` })
    ).json() as InitiativeDetailDTO;
    expect(detail).toMatchObject({ budgetCredits: 0.001, grantedCredits: 12.5 });
  });

  it("rejects grant amounts that are not positive numbers", async () => {
    const { approval } = await app.approvals.request({
      kind: "budget_overrun",
      title: "Company: day budget exceeded",
      summary: "Over",
      payload: { suggestedExtraCredits: 10 },
    });
    for (const extraCredits of ["abc", "0", -2, "1,5"]) {
      const res = await server.inject({
        method: "POST",
        url: `/api/approvals/${approval.id}/decide`,
        payload: { outcome: "approved", extraCredits },
      });
      expect(res.statusCode, String(extraCredits)).toBe(400);
    }
    const res = await server.inject({
      method: "POST",
      url: `/api/approvals/${approval.id}/decide`,
      payload: { outcome: "approved", extraCredits: 0.5 },
    });
    expect(res.json() as ApprovalDetailDTO).toMatchObject({
      status: "approved",
      decisionComment: "Granted 0.5 credits.",
      payload: { grantedExtraCredits: 0.5 },
    });
  });

  it("keeps the initiative budget and the Budget page on one record", async () => {
    const ini = (await app.lifecycle.list())[0]!;
    const patch = (budgetCredits: number | null) =>
      server.inject({ method: "PATCH", url: `/api/initiatives/${ini.id}`, payload: { budgetCredits } });
    await server.inject({
      method: "PUT",
      url: "/api/budgets",
      payload: [{ scope: "initiative", scopeId: ini.id, period: "total", limitCredits: 400, warnPct: 60 }],
    });
    expect((await app.lifecycle.get(ini.id)).budgetCredits).toBe(400);
    expect(((await patch(250)).json() as InitiativeDetailDTO).budgetCredits).toBe(250);
    expect(await app.budget.initiativeCap(ini.id)).toMatchObject({
      limitCredits: 250,
      warnPct: 60,
      enabled: true,
    });
    expect((await patch(0)).statusCode).toBe(400);
    expect((await patch(null)).json() as InitiativeDetailDTO).toMatchObject({
      budgetCredits: null,
      grantedCredits: 0,
    });
    expect(await app.budget.initiativeCap(ini.id)).toBeNull();
    expect((await app.lifecycle.get(ini.id)).budgetCredits).toBeNull();
    await patch(300);
    const cap = (await app.budget.initiativeCap(ini.id))!;
    await server.inject({
      method: "PUT",
      url: "/api/budgets",
      payload: [{ scope: "initiative", scopeId: ini.id, period: "total", limitCredits: 300, enabled: false }],
    });
    expect((await app.lifecycle.summaries([await app.lifecycle.get(ini.id)]))[0]).toMatchObject({
      budgetCredits: null,
    });
    await server.inject({ method: "DELETE", url: `/api/budgets/${cap.id}` });
    expect((await app.lifecycle.get(ini.id)).budgetCredits).toBeNull();
  });

  it("clears stale notices of resumed and cancelled initiatives", async () => {
    const ini = (await app.lifecycle.list())[0]!;
    await app.lifecycle.pause(ini.id, "Paused by the CEO");
    expect((await unreadNotices(app, ini.id)).map((n) => n.title)).toContain(`${ini.title} paused`);
    await app.lifecycle.resume(ini.id);
    expect(await unreadNotices(app, ini.id)).toEqual([]);
    await app.lifecycle.pause(ini.id, "Paused by the CEO");
    await app.lifecycle.cancel(ini.id);
    expect(await unreadNotices(app, ini.id)).toEqual([]);
  });
});

describe("request_approval for an already approved document gate", () => {
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

  it("returns the existing decision instead of opening a second gate", async () => {
    const replies: string[] = [];
    // A Chief of Staff that loses track after the approval and asks for the same gate again.
    runtime.on("chief-of-staff", async (ctx) => {
      if (/was approved/.test(ctx.prompt))
        return void (await ctx.callTool("complete_task", { summary: "Charter approved." }));
      if (ctx.turn === 0)
        await ctx.callTool("write_document", {
          kind: "charter",
          title: "Ledger charter",
          content: "# Charter\n\nScope.",
        });
      replies.push(
        await ctx.callTool("request_approval", {
          kind: "vision_roadmap",
          title: "Vision & roadmap — Ledger",
          summary: "Charter for review.",
        }),
      );
    });
    const ini = await app.lifecycle.create({
      title: "Ledger",
      directive: "Build Ledger: bookkeeping for freelancers",
    });
    await app.engine.runUntilIdle();
    const [gate] = await pendingFor(app, ini.id);
    await app.approvals.decide(gate!.id, { outcome: "approved", comment: "Go" });
    await app.engine.runUntilIdle();

    expect(replies[1]).toBe(
      `The CEO already approved this gate for the current stage (approval ${gate!.id}); it was not requested again. Don't redo the approved work: finish your assignment and call complete_task.`,
    );
    expect((await gatesOf(app, ini.id, "vision_roadmap")).map((a) => a.status)).toEqual(["approved"]);
    expect((await app.lifecycle.get(ini.id)).stage).not.toBe("intake");
  });
});

describe("migration 0001 data fixes", () => {
  let h: DbHandle;
  let app: Techgens;

  beforeAll(async () => {
    h = await createTestDb();
    ({ app } = await createTestApp(h));
  });
  afterAll(async () => {
    await h.close();
  });

  it("closes legacy work, notices, milestones and budget mismatches (idempotent statements)", async () => {
    const [cancelled] = await app.db
      .insert(schema.initiatives)
      .values({ title: "Legacy", directive: "x", status: "cancelled" })
      .returning();
    const [completed] = await app.db
      .insert(schema.initiatives)
      .values({ title: "Shipped", directive: "x", status: "completed", budgetCredits: 400 })
      .returning();
    await app.db.insert(schema.workItems).values([
      { kind: "stage", title: "Intake", initiativeId: cancelled!.id, status: "in_progress" },
      { kind: "task", title: "Done task", initiativeId: cancelled!.id, status: "done" },
    ]);
    await app.db.insert(schema.milestones).values({ initiativeId: completed!.id, title: "Launch" });
    await app.db
      .insert(schema.budgets)
      .values({ scope: "initiative", scopeId: completed!.id, period: "total", limitCredits: 0.02 });
    await app.db.insert(schema.notifications).values([
      { kind: "initiative", title: "Legacy paused", link: `/initiatives/${cancelled!.id}` },
      { kind: "escalation", title: "Shipped: Build is blocked", link: `/initiatives/${completed!.id}` },
      { kind: "initiative", title: "Shipped completed", link: `/initiatives/${completed!.id}` },
    ]);

    const migration = readFileSync(`${MIGRATIONS_FOLDER}/0001_initiative_status_reason.sql`, "utf8");
    for (const statement of migration
      .split("--> statement-breakpoint")
      .filter((s) => /^\s*(?:--[^\n]*\n\s*)*UPDATE/.test(s)))
      await h.pool.query(statement);

    const items = await app.work.list({ initiativeId: cancelled!.id });
    expect(items.map((w) => w.status).sort()).toEqual(["cancelled", "done"]);
    expect((await app.lifecycle.milestones(completed!.id)).map((m) => m.status)).toEqual(["done"]);
    expect((await app.lifecycle.get(completed!.id)).budgetCredits).toBe(0.02);
    expect((await unreadNotices(app, cancelled!.id)).length).toBe(0);
    expect((await unreadNotices(app, completed!.id)).map((n) => n.title)).toEqual(["Shipped completed"]);
  });
});
