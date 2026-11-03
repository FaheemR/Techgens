import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApprovalSummaryDTO, DashboardDTO, DecisionDTO, InitiativeDetailDTO, InitiativeSummaryDTO, LiveEvent, OrgDTO, SettingsDTO, SystemInfo, ThreadDTO, WorkItemDTO } from "@techgens/core";
import type { DbHandle } from "@techgens/db";
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
  await server.close();
  await h.close();
});

const get = async <T>(url: string) => {
  const res = await server.inject({ method: "GET", url });
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
  return res.json() as T;
};

describe("HTTP API", () => {
  it("reports system status, org and settings", async () => {
    const sys = await get<SystemInfo>("/api/system");
    expect(sys).toMatchObject({ demoMode: true, paused: false, github: { connected: true, mode: "demo" }, runtime: { kind: "fake", ready: true } });
    const org = await get<OrgDTO>("/api/org");
    expect(org.roles.length).toBeGreaterThanOrEqual(22);
    expect(org.agents.find((a) => a.roleId === "chief-of-staff")).toMatchObject({ name: "Morgan", status: "active", managerAgentId: null });
    expect(org.agents.filter((a) => a.roleId === "backend-engineer")).toHaveLength(2);
    expect(org.agents.some((a) => a.roleId === "marketing-lead")).toBe(false);
    const settings = await get<SettingsDTO>("/api/settings");
    expect(settings.gatePolicy.spec).toBe(true);
    const models = await get<unknown[]>("/api/settings/models");
    expect(models.length).toBeGreaterThan(0);
  });

  it("validates input and maps domain errors", async () => {
    const bad = await server.inject({ method: "POST", url: "/api/initiatives", payload: { title: "x" } });
    expect(bad.statusCode).toBe(400);
    const missing = await server.inject({ method: "GET", url: "/api/initiatives/00000000-0000-0000-0000-000000000000" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "not_found" });
  });

  it("drives a directive through chat, approvals and the dashboard", async () => {
    const thread = (await server.inject({ method: "POST", url: "/api/chat/threads", payload: {} })).json() as ThreadDTO;
    const post = await server.inject({ method: "POST", url: `/api/chat/threads/${thread.id}/messages`, payload: { content: "Build Pawfect: a pet-sitting marketplace MVP in 8 weeks." } });
    expect(post.statusCode).toBe(200);
    await app.engine.runUntilIdle();

    const pending = await get<ApprovalSummaryDTO[]>("/api/approvals?status=pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "vision_roadmap", requestedBy: "Morgan" });
    const detail = await get<{ documents: Array<{ kind: string; content: string }> }>(`/api/approvals/${pending[0]!.id}`);
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(["charter", "roadmap"]);

    const needsComment = await server.inject({ method: "POST", url: `/api/approvals/${pending[0]!.id}/decide`, payload: { outcome: "rejected" } });
    expect(needsComment.statusCode).toBe(400);
    const ok = await server.inject({ method: "POST", url: `/api/approvals/${pending[0]!.id}/decide`, payload: { outcome: "approved", comment: "Go" } });
    expect(ok.statusCode).toBe(200);
    await app.engine.runUntilIdle();

    const dash = await get<DashboardDTO>("/api/dashboard");
    expect(dash.initiatives[0]).toMatchObject({ title: "Pawfect MVP", stage: "definition" });
    expect(dash.pendingApprovals.map((a) => a.kind)).toEqual(["spec"]);
    expect(dash.recentEvents.length).toBeGreaterThan(5);
    const ini = await get<InitiativeDetailDTO>(`/api/initiatives/${dash.initiatives[0]!.id}`);
    expect(ini.stages.slice(0, 4).map((s) => s.state)).toEqual(["done", "done", "active", "pending"]);
    expect(ini.decisions.some((d) => d.summary.includes("CEO approved"))).toBe(true);
    const docs = await get<unknown[]>(`/api/documents?q=${encodeURIComponent("competitor")}`);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("keeps initiative work counts in line with the work items list", async () => {
    const [ini] = await get<InitiativeSummaryDTO[]>("/api/initiatives");
    const items = await get<WorkItemDTO[]>(`/api/work-items?initiativeId=${ini!.id}`);
    expect(items.some((w) => w.kind === "stage")).toBe(true);
    expect(ini!.workItems).toMatchObject({ total: items.length, done: items.filter((w) => w.status === "done").length, cancelled: 0 });
  });

  it("pauses and resumes an initiative with a visible reason", async () => {
    const [ini] = await get<InitiativeSummaryDTO[]>("/api/initiatives");
    const paused = (await server.inject({ method: "POST", url: `/api/initiatives/${ini!.id}/pause` })).json() as InitiativeDetailDTO;
    expect(paused).toMatchObject({ status: "paused", statusReason: "Paused by the CEO" });
    const resumed = (await server.inject({ method: "POST", url: `/api/initiatives/${ini!.id}/resume` })).json() as InitiativeDetailDTO;
    expect(resumed).toMatchObject({ status: "active", statusReason: null, pendingApprovals: 1 });
  });

  it("records every gate the CEO switches on or off", async () => {
    const put = (gatePolicy: Record<string, boolean>) => server.inject({ method: "PUT", url: "/api/settings", payload: { gatePolicy } });
    const off = await put({ prod_deploy: false, spec: true });
    expect(off.statusCode).toBe(200);
    expect((off.json() as SettingsDTO).gatePolicy).toMatchObject({ prod_deploy: false, spec: true });
    await put({ prod_deploy: true });
    const expected = ["CEO turned on the Production deploy gate", "CEO turned off the Production deploy gate"];
    const decisions = (await get<DecisionDTO[]>("/api/decisions")).filter((d) => d.initiativeId === null);
    expect(decisions.map((d) => d.summary)).toEqual(expected);
    expect(decisions[1]).toMatchObject({ type: "change", actorType: "ceo", actorName: "CEO", details: expect.stringMatching(/approved automatically/) });
    const events = (await get<LiveEvent[]>("/api/events?limit=50")).filter((e) => e.type === "decision.recorded");
    expect(events.map((e) => e.summary)).toEqual(expected);
    expect(events[1]).toMatchObject({ actorType: "ceo", subjectType: "settings", data: { gate: "prod_deploy", enabled: false } });
  });

  it("pauses and resumes all agents", async () => {
    expect((await server.inject({ method: "POST", url: "/api/system/pause" })).json()).toMatchObject({ paused: true });
    expect((await server.inject({ method: "POST", url: "/api/system/resume" })).json()).toMatchObject({ paused: false });
  });
});
