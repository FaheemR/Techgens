import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { DomainError, type DashboardDTO, type SettingsDTO, type SystemInfo } from "@techgens/core";
import type { Techgens } from "../app";
import { companyDTO, goalDTO } from "../services/company";
import { registerCompanyRoutes } from "./routes-company";
import { registerWorkRoutes } from "./routes-work";

const STATUS: Record<DomainError["code"], number> = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403, budget: 402, unavailable: 503 };

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value ?? {});
}

export async function systemInfo(app: Techgens): Promise<SystemInfo> {
  const [paused, github, company, runtime] = await Promise.all([app.settings.get("systemPaused"), app.settings.get("github"), app.company.get(), app.runtime.status()]);
  return {
    version: "0.1.0",
    paused,
    demoMode: app.config.agentRuntime === "fake",
    runtime,
    github: { connected: app.github.connected, login: github.login, mode: github.mode, appSlug: github.appSlug },
    onboarded: company.onboarded,
  };
}

export async function settingsDTO(app: Techgens): Promise<SettingsDTO> {
  const s = await app.settings.all();
  return {
    gatePolicy: s.gatePolicy,
    roleModels: s.roleModels,
    maxDelegationDepth: s.maxDelegationDepth,
    maxConcurrentJobs: s.maxConcurrentJobs,
    autoMergeToIntegration: s.autoMergeToIntegration,
    mcpServers: Object.fromEntries(Object.entries(s.mcpServers).map(([k, v]) => [k, { command: v.command, args: v.args ?? [], tools: v.tools }])),
    github: { connected: app.github.connected, login: s.github.login, mode: s.github.mode, appSlug: s.github.appSlug, owner: s.github.owner },
  };
}

export async function buildServer(app: Techgens): Promise<FastifyInstance> {
  const server = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const origins = new Set([app.config.webUrl, "http://localhost:3000", "http://127.0.0.1:3000"]);
  await server.register(cors, { origin: (origin, cb) => cb(null, !origin || origins.has(origin)), methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });

  server.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) return reply.status(STATUS[err.code]).send({ error: err.message, code: err.code });
    if (err instanceof ZodError) return reply.status(400).send({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "invalid" });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    app.log.error({ err }, "request failed");
    return reply.status(500).send({ error: (err as Error).message || "Internal error" });
  });

  server.get("/health", async () => ({ ok: true }));
  server.get("/api/system", async () => systemInfo(app));
  server.post("/api/system/pause", async () => {
    await app.settings.set("systemPaused", true);
    await app.bus.emit({ type: "system.paused", actorType: "ceo", summary: "All agents paused by the CEO" });
    return systemInfo(app);
  });
  server.post("/api/system/resume", async () => {
    await app.settings.set("systemPaused", false);
    await app.bus.emit({ type: "system.resumed", actorType: "ceo", summary: "Agents resumed" });
    await app.engine.requeueAll();
    return systemInfo(app);
  });

  server.get("/api/dashboard", async (): Promise<DashboardDTO> => {
    const [company, initiatives, pending, jobs, goals, usage, events, incidents] = await Promise.all([
      app.company.get(),
      app.lifecycle.list(),
      app.approvals.list("pending"),
      app.engine.listJobDTOs({ limit: 50 }),
      app.company.listGoals(),
      app.budget.summary(14),
      app.bus.list({ limit: 30 }),
      app.db.query.incidents.findMany({ where: (t, { ne }) => ne(t.status, "resolved") }),
    ]);
    const monthBudget = usage.budgets.find((b) => b.scope === "company" && b.period === "month");
    return {
      company: companyDTO(company),
      initiatives: await app.lifecycle.summaries(initiatives.filter((i) => i.status !== "cancelled").slice(0, 12)),
      pendingApprovals: await app.approvals.summaries(pending),
      activeJobs: jobs.filter((j) => ["queued", "running", "waiting"].includes(j.status)),
      goals: goals.map(goalDTO),
      usage: { todayCredits: usage.todayCredits, monthCredits: usage.monthCredits, monthBudgetCredits: monthBudget?.limitCredits ?? null },
      recentEvents: events,
      openIncidents: incidents.length,
    };
  });

  // ---- Live events (SSE) -------------------------------------------------------------------------------------------
  server.get("/api/events", async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().optional(), before: z.coerce.number().optional(), subjectType: z.string().optional(), subjectId: z.string().optional() }), req.query);
    return app.bus.list(q);
  });
  server.get("/api/events/stream", async (req, reply) => {
    const q = parse(z.object({ since: z.coerce.number().optional() }), req.query);
    const lastId = Number(req.headers["last-event-id"] ?? q.since ?? NaN);
    reply.hijack();
    const inherited = Object.fromEntries(Object.entries(reply.getHeaders()).filter(([, v]) => v !== undefined)) as Record<string, string | number | string[]>;
    reply.raw.writeHead(200, { ...inherited, "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (e: { id: string; type: string }) => reply.raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    if (Number.isFinite(lastId)) for (const e of await app.bus.list({ since: lastId, limit: 500 })) send(e);
    reply.raw.write(`: connected\n\n`);
    const off = app.bus.subscribe(send);
    const ping = setInterval(() => reply.raw.write(`: ping\n\n`), 15_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      off();
    });
  });

  // ---- Settings & GitHub connection --------------------------------------------------------------------------------
  server.get("/api/settings", async () => settingsDTO(app));
  server.put("/api/settings", async (req) => {
    const body = parse(
      z.object({
        gatePolicy: z.record(z.string(), z.boolean()).optional(),
        roleModels: z.record(z.string(), z.string()).optional(),
        maxDelegationDepth: z.number().int().min(1).max(8).optional(),
        maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
        autoMergeToIntegration: z.boolean().optional(),
        mcpServers: z
          .record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.object({ command: z.string().min(1), args: z.array(z.string()).default([]), env: z.record(z.string(), z.string()).optional(), tools: z.array(z.string().min(1)).min(1) }))
          .optional(),
      }),
      req.body,
    );
    if (body.mcpServers) await app.settings.set("mcpServers", body.mcpServers);
    if (body.gatePolicy) await app.settings.set("gatePolicy", { ...(await app.settings.get("gatePolicy")), ...body.gatePolicy });
    if (body.roleModels) await app.settings.set("roleModels", Object.fromEntries(Object.entries(body.roleModels).filter(([, v]) => v)));
    if (body.maxDelegationDepth) await app.settings.set("maxDelegationDepth", body.maxDelegationDepth);
    if (body.maxConcurrentJobs) await app.settings.set("maxConcurrentJobs", body.maxConcurrentJobs);
    if (body.autoMergeToIntegration !== undefined) await app.settings.set("autoMergeToIntegration", body.autoMergeToIntegration);
    return settingsDTO(app);
  });
  server.get("/api/settings/models", async () => app.runtime.listModels().catch(() => []));
  server.post("/api/settings/github/token", async (req) => {
    const { token } = parse(z.object({ token: z.string().min(20) }), req.body);
    await app.github.connectToken(token);
    return settingsDTO(app);
  });
  server.delete("/api/settings/github", async () => {
    await app.github.disconnect();
    return settingsDTO(app);
  });
  server.post("/api/settings/github/app", async (req) => {
    const { owner } = parse(z.object({ owner: z.string().optional() }), req.body);
    return app.github.startAppManifest(owner);
  });
  const toSettings = (status: string) => `${app.config.webUrl}/settings?github=${status}`;
  server.get("/api/github/app/callback", async (req, reply) => {
    const q = parse(z.object({ code: z.string(), state: z.string() }), req.query);
    return reply.redirect(await app.github.handleAppCreated(q.code, q.state));
  });
  server.get("/api/github/app/installed", async (_req, reply) => reply.redirect(await app.github.handleAppInstalled()));
  server.get("/api/github/oauth/callback", async (req, reply) => {
    const q = parse(z.object({ code: z.string(), state: z.string() }), req.query);
    try {
      await app.github.handleOAuthCallback(q.code, q.state);
      return reply.redirect(toSettings("connected"));
    } catch (err) {
      app.log.warn({ err }, "GitHub OAuth failed");
      return reply.redirect(toSettings("error"));
    }
  });

  registerCompanyRoutes(server, app);
  registerWorkRoutes(server, app);
  return server;
}
