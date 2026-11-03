import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { APPROVAL_OUTCOMES, APPROVAL_STATUSES, BUDGET_PERIODS, BUDGET_SCOPES, JOB_STATUSES, PRIORITIES, WORK_ITEM_KINDS, WORK_ITEM_STATUSES, type DeploymentDTO, type IncidentDTO } from "@techgens/core";
import { schema, type Deployment, type Incident } from "@techgens/db";
import type { Techgens } from "../app";
import { routineDTO } from "../services/routines";
import { parse } from "./server";

const id = z.object({ id: z.string().uuid() });

const deploymentDTO = (d: Deployment): DeploymentDTO => ({ id: d.id, productId: d.productId, environment: d.environment, status: d.status, runUrl: d.runUrl, sha: d.sha, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() });
const incidentDTO = (i: Incident): IncidentDTO => ({ id: i.id, productId: i.productId, title: i.title, severity: i.severity, status: i.status, source: i.source, details: i.details, createdAt: i.createdAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null });

export function registerWorkRoutes(server: FastifyInstance, app: Techgens): void {
  // ---- Work items --------------------------------------------------------------------------------------------------
  server.get("/api/work-items", async (req) => {
    const q = parse(
      z.object({ initiativeId: z.string().uuid().optional(), status: z.enum(WORK_ITEM_STATUSES).optional(), kind: z.enum(WORK_ITEM_KINDS).optional(), assigneeAgentId: z.string().uuid().optional(), parentId: z.string().uuid().optional() }),
      req.query,
    );
    return app.work.dtos(await app.work.list(q));
  });
  server.post("/api/work-items", async (req) => {
    const body = parse(z.object({ title: z.string().min(3), description: z.string().default(""), kind: z.enum(["task", "research", "document", "review", "bug"]).default("task"), initiativeId: z.string().uuid().optional(), assigneeRoleId: z.string().default("chief-of-staff") }), req.body);
    const agent = await app.org.resolveAgent(body.assigneeRoleId);
    const ini = body.initiativeId ? await app.lifecycle.get(body.initiativeId) : null;
    const item = await app.work.create({ kind: body.kind, title: body.title, description: body.description, initiativeId: ini?.id ?? null, productId: ini?.productId ?? null, assigneeAgentId: agent.id, status: "in_progress", priority: "p1" });
    await app.engine.createJob({ agentId: agent.id, workItemId: item.id, initiativeId: ini?.id ?? null, prompt: `# Assignment from the CEO: ${body.title}\n\n${body.description}\n\nCall complete_task when done.` });
    return app.work.dto(item);
  });
  server.get("/api/work-items/:id", async (req) => {
    const item = await app.work.get(parse(id, req.params).id);
    return { ...(await app.work.dto(item)), children: await app.work.dtos(await app.work.list({ parentId: item.id })), jobs: await app.engine.listJobDTOs({ workItemId: item.id }) };
  });
  server.patch("/api/work-items/:id", async (req) => {
    const body = parse(z.object({ status: z.enum(WORK_ITEM_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), title: z.string().optional(), description: z.string().optional() }), req.body);
    return app.work.dto(await app.work.update(parse(id, req.params).id, body));
  });

  // ---- Jobs --------------------------------------------------------------------------------------------------------
  server.get("/api/jobs", async (req) => {
    const q = parse(z.object({ status: z.enum(JOB_STATUSES).optional(), agentId: z.string().uuid().optional(), initiativeId: z.string().uuid().optional(), limit: z.coerce.number().int().optional() }), req.query);
    return app.engine.listJobDTOs(q);
  });
  server.get("/api/jobs/:id", async (req) => {
    const jobId = parse(id, req.params).id;
    const [dto] = (await app.engine.listJobDTOs({ limit: 500 })).filter((j) => j.id === jobId);
    const job = dto ?? (await app.engine.listJobDTOs({ agentId: (await app.engine.getJob(jobId)).agentId, limit: 500 })).find((j) => j.id === jobId);
    const events = (await app.bus.list({ subjectType: "job", subjectId: jobId, limit: 500 })).reverse();
    return { ...job, events };
  });
  server.post("/api/jobs/:id/cancel", async (req) => {
    const job = await app.engine.cancelJob(parse(id, req.params).id);
    return (await app.engine.listJobDTOs({ agentId: job.agentId, limit: 200 })).find((j) => j.id === job.id);
  });
  server.post("/api/jobs/:id/retry", async (req) => {
    const job = await app.engine.retryJob(parse(id, req.params).id);
    return (await app.engine.listJobDTOs({ agentId: job.agentId, limit: 200 })).find((j) => j.id === job.id);
  });

  // ---- Decisions & approvals ---------------------------------------------------------------------------------------
  server.get("/api/decisions", async (req) => {
    const q = parse(z.object({ initiativeId: z.string().uuid().optional() }), req.query);
    if (q.initiativeId) return (await app.lifecycle.detail(q.initiativeId)).decisions;
    const rows = await app.db.select().from(schema.decisions).orderBy(desc(schema.decisions.createdAt)).limit(200);
    return rows.map((d) => ({ id: d.id, initiativeId: d.initiativeId, type: d.type, summary: d.summary, details: d.details, actorType: d.actorType, actorName: d.actorType === "ceo" ? "CEO" : null, createdAt: d.createdAt.toISOString() }));
  });
  server.get("/api/approvals", async (req) => {
    const q = parse(z.object({ status: z.enum(APPROVAL_STATUSES).optional() }), req.query);
    return app.approvals.summaries(await app.approvals.list(q.status));
  });
  server.get("/api/approvals/:id", async (req) => app.approvals.detail(parse(id, req.params).id));
  server.post("/api/approvals/:id/decide", async (req) => {
    // extraCredits may arrive as a number or a numeric string; the service validates it (an explicit amount always wins).
    const body = parse(z.object({ outcome: z.enum(APPROVAL_OUTCOMES), comment: z.string().optional(), extraCredits: z.union([z.number(), z.string()]).nullable().optional() }), req.body);
    const approvalId = parse(id, req.params).id;
    await app.approvals.decide(approvalId, body, "ceo");
    return app.approvals.detail(approvalId);
  });

  // ---- Budget & usage ----------------------------------------------------------------------------------------------
  server.get("/api/usage/summary", async (req) => app.budget.summary(parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query).days));
  server.get("/api/budgets", async () => app.budget.listBudgets());
  server.put("/api/budgets", async (req) => {
    const items = parse(z.array(z.object({ scope: z.enum(BUDGET_SCOPES), scopeId: z.string().nullable().default(null), period: z.enum(BUDGET_PERIODS), limitCredits: z.number().nonnegative(), warnPct: z.number().int().min(1).max(100).optional(), enabled: z.boolean().optional() })), req.body);
    return app.budget.upsertBudgets(items);
  });
  server.delete("/api/budgets/:id", async (req, reply) => {
    await app.budget.deleteBudget(parse(id, req.params).id);
    return reply.status(204).send();
  });

  // ---- Operations --------------------------------------------------------------------------------------------------
  server.get("/api/deployments", async (req) => {
    const q = parse(z.object({ productId: z.string().uuid().optional() }), req.query);
    const rows = await app.db.select().from(schema.deployments).where(q.productId ? eq(schema.deployments.productId, q.productId) : undefined).orderBy(desc(schema.deployments.createdAt)).limit(100);
    return rows.map(deploymentDTO);
  });
  server.get("/api/incidents", async () => (await app.db.select().from(schema.incidents).orderBy(desc(schema.incidents.createdAt)).limit(200)).map(incidentDTO));
  server.post("/api/incidents", async (req) => {
    const body = parse(z.object({ title: z.string().min(3), productId: z.string().uuid().optional(), severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).default("sev3"), details: z.string().default("") }), req.body);
    const [row] = await app.db.insert(schema.incidents).values({ ...body, source: "ceo" }).returning();
    await app.bus.emit({ type: "incident.opened", actorType: "ceo", subjectType: "incident", subjectId: row!.id, summary: `${body.severity}: ${body.title}` });
    const sre = await app.org.agentForRole("sre");
    if (sre) {
      const item = await app.work.create({ kind: "bug", title: `Incident: ${body.title}`, description: body.details, assigneeAgentId: sre.id, status: "in_progress", priority: body.severity === "sev1" ? "p0" : "p1", productId: body.productId ?? null });
      await app.db.update(schema.incidents).set({ workItemId: item.id }).where(eq(schema.incidents.id, row!.id));
      await app.engine.createJob({ agentId: sre.id, workItemId: item.id, prompt: `# Incident (${body.severity}): ${body.title}\n\n${body.details}\n\nAssess impact, mitigate (rollback if needed), communicate, and file follow-up work items. Use get_deployments and get_ci_status. Escalate sev1/sev2 immediately. Call complete_task with the status.` });
    }
    return incidentDTO(row!);
  });
  server.patch("/api/incidents/:id", async (req) => {
    const body = parse(z.object({ status: z.enum(["open", "mitigated", "resolved"]) }), req.body);
    const [row] = await app.db.update(schema.incidents).set({ status: body.status, resolvedAt: body.status === "resolved" ? new Date() : null }).where(eq(schema.incidents.id, parse(id, req.params).id)).returning();
    return incidentDTO(row!);
  });
  server.get("/api/routines", async () => (await app.routines.list()).map(routineDTO));
  server.patch("/api/routines/:id", async (req) => routineDTO(await app.routines.update(parse(id, req.params).id, parse(z.object({ enabled: z.boolean().optional(), cron: z.string().optional() }), req.body))));
  server.post("/api/routines/:id/run", async (req) => app.routines.run(parse(id, req.params).id));
  server.get("/api/notifications", async () => app.notifications.list());
  server.post("/api/notifications/read-all", async (_req, reply) => {
    await app.notifications.markAllRead();
    return reply.status(204).send();
  });
  server.post("/api/notifications/:id/read", async (req, reply) => {
    await app.notifications.markRead(parse(id, req.params).id);
    return reply.status(204).send();
  });
}

