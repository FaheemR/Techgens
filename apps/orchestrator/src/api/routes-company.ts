import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AGENT_STATUSES, DOCUMENT_KINDS, GOAL_STATUSES, GOAL_TYPES, LIFECYCLE_STAGES, REASONING_EFFORTS, AGENT_TOOL_NAMES } from "@techgens/core";
import { generateAzureSetupScript } from "@techgens/azure";
import type { Techgens } from "../app";
import { companyDTO, goalDTO, productDTO } from "../services/company";
import { roleDTO } from "../services/org";
import { parse } from "./server";

const id = z.object({ id: z.string().uuid() });

export function registerCompanyRoutes(server: FastifyInstance, app: Techgens): void {
  // ---- Company & goals ---------------------------------------------------------------------------------------------
  server.get("/api/company", async () => companyDTO(await app.company.get()));
  server.put("/api/company", async (req) => {
    const body = parse(z.object({ name: z.string().min(1).optional(), mission: z.string().optional(), vision: z.string().optional(), values: z.array(z.string()).optional(), policies: z.string().optional(), githubOwner: z.string().nullable().optional(), onboarded: z.boolean().optional() }), req.body);
    return companyDTO(await app.company.update(body));
  });
  const goalBody = z.object({
    type: z.enum(GOAL_TYPES).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    parentId: z.string().uuid().nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    initiativeId: z.string().uuid().nullable().optional(),
    targetValue: z.number().nullable().optional(),
    currentValue: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: z.enum(GOAL_STATUSES).optional(),
  });
  server.get("/api/goals", async () => (await app.company.listGoals()).map(goalDTO));
  server.post("/api/goals", async (req) => goalDTO(await app.company.createGoal(parse(goalBody, req.body) as never)));
  server.patch("/api/goals/:id", async (req) => goalDTO(await app.company.updateGoal(parse(id, req.params).id, parse(goalBody.partial(), req.body) as never)));
  server.delete("/api/goals/:id", async (req, reply) => {
    await app.company.deleteGoal(parse(id, req.params).id);
    return reply.status(204).send();
  });

  // ---- Products ----------------------------------------------------------------------------------------------------
  const productBody = z.object({ name: z.string().min(1), description: z.string().optional(), vision: z.string().optional(), repoOwner: z.string().nullable().optional(), repoName: z.string().nullable().optional() });
  server.get("/api/products", async () => (await app.company.listProducts()).map(productDTO));
  server.post("/api/products", async (req) => productDTO(await app.company.createProduct(parse(productBody, req.body))));
  server.get("/api/products/:id", async (req) => productDTO(await app.company.getProduct(parse(id, req.params).id)));
  server.patch("/api/products/:id", async (req) => {
    const body = parse(productBody.partial().extend({ status: z.string().optional(), integrationBranch: z.string().optional(), defaultBranch: z.string().optional(), azure: z.record(z.string(), z.string()).optional() }), req.body);
    return productDTO(await app.company.updateProduct(parse(id, req.params).id, body));
  });
  server.post("/api/products/:id/bootstrap", async (req) => {
    const body = parse(z.object({ createRepo: z.boolean().default(true), private: z.boolean().optional() }), req.body);
    return productDTO(await app.github.bootstrapProductRepo(parse(id, req.params).id, { private: body.private }));
  });
  server.get("/api/products/:id/azure-setup", async (req) => {
    const product = await app.company.getProduct(parse(id, req.params).id);
    if (!product.repoOwner || !product.repoName) return { script: "# Bootstrap the GitHub repository first (planning stage or the Bootstrap button).", variables: {}, steps: [] };
    const az = product.azure;
    return generateAzureSetupScript({
      subscriptionId: az.subscriptionId ?? "00000000-0000-0000-0000-000000000000",
      tenantId: az.tenantId,
      location: az.location ?? "eastus2",
      githubOwner: product.repoOwner,
      githubRepo: product.repoName,
      productSlug: product.slug,
      resourceGroupPrefix: az.resourceGroupPrefix,
    });
  });

  // ---- Initiatives -------------------------------------------------------------------------------------------------
  server.get("/api/initiatives", async (req) => {
    const q = parse(z.object({ status: z.enum(["proposed", "active", "paused", "completed", "cancelled"]).optional() }), req.query);
    return app.lifecycle.summaries(await app.lifecycle.list(q.status));
  });
  server.post("/api/initiatives", async (req) => {
    const body = parse(z.object({ title: z.string().min(3), directive: z.string().min(5), productId: z.string().uuid().optional(), productName: z.string().optional(), targetDate: z.string().optional(), budgetCredits: z.number().positive().optional(), skipStages: z.array(z.enum(LIFECYCLE_STAGES)).optional() }), req.body);
    const ini = await app.lifecycle.create({ ...body, summary: body.directive });
    return app.lifecycle.detail(ini.id);
  });
  server.get("/api/initiatives/:id", async (req) => app.lifecycle.detail(parse(id, req.params).id));
  server.patch("/api/initiatives/:id", async (req) => {
    const body = parse(z.object({ title: z.string().optional(), summary: z.string().optional(), targetDate: z.string().nullable().optional(), budgetCredits: z.number().nullable().optional() }), req.body);
    await app.lifecycle.update(parse(id, req.params).id, body);
    return app.lifecycle.detail(parse(id, req.params).id);
  });
  for (const action of ["pause", "resume", "cancel"] as const) {
    server.post(`/api/initiatives/:id/${action}`, async (req) => {
      const iid = parse(id, req.params).id;
      if (action === "pause") await app.lifecycle.pause(iid, "Paused by the CEO");
      else if (action === "resume") await app.lifecycle.resume(iid);
      else await app.lifecycle.cancel(iid);
      return app.lifecycle.detail(iid);
    });
  }

  // ---- Directives chat ---------------------------------------------------------------------------------------------
  server.get("/api/chat/threads", async () => app.chat.listThreads());
  server.post("/api/chat/threads", async (req) => app.chat.createThread(parse(z.object({ title: z.string().optional() }), req.body).title));
  server.get("/api/chat/threads/:id/messages", async (req) => app.chat.messages(parse(id, req.params).id));
  server.post("/api/chat/threads/:id/messages", async (req) => app.chat.postCeoMessage(parse(id, req.params).id, parse(z.object({ content: z.string().min(1).max(20_000) }), req.body).content));

  // ---- Organisation ------------------------------------------------------------------------------------------------
  server.get("/api/org", async () => ({ roles: (await app.org.listRoles()).map(roleDTO), agents: await app.org.agentDTOs() }));
  server.post("/api/agents", async (req) => {
    const body = parse(z.object({ roleId: z.string(), name: z.string().optional() }), req.body);
    const agent = await app.org.hire(body.roleId, body.name);
    return (await app.org.agentDTOs()).find((a) => a.id === agent.id);
  });
  server.get("/api/agents/:id", async (req) => app.org.agentDetail(parse(id, req.params).id));
  server.patch("/api/agents/:id", async (req) => {
    const body = parse(z.object({ name: z.string().min(1).optional(), status: z.enum(AGENT_STATUSES).optional(), modelOverride: z.string().nullable().optional(), dailyCreditsOverride: z.number().nonnegative().nullable().optional() }), req.body);
    const agentId = parse(id, req.params).id;
    await app.org.updateAgent(agentId, body);
    return (await app.org.agentDTOs()).find((a) => a.id === agentId);
  });
  server.put("/api/roles/:roleId", async (req) => {
    const { roleId } = parse(z.object({ roleId: z.string() }), req.params);
    const body = parse(
      z.object({
        prompt: z.string().min(20).optional(),
        description: z.string().optional(),
        model: z.string().optional(),
        reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
        tools: z.array(z.enum(AGENT_TOOL_NAMES)).optional(),
        budget: z.object({ dailyCredits: z.number().nonnegative(), perJobCredits: z.number().nonnegative() }).optional(),
      }),
      req.body,
    );
    return roleDTO(await app.org.updateRole(roleId, body));
  });

  // ---- Documents & decisions ---------------------------------------------------------------------------------------
  server.get("/api/documents", async (req) => {
    const q = parse(z.object({ initiativeId: z.string().uuid().optional(), kind: z.enum(DOCUMENT_KINDS).optional(), q: z.string().optional() }), req.query);
    return app.docs.summaries(await app.docs.list(q));
  });
  server.get("/api/documents/:id", async (req) => {
    const q = parse(z.object({ version: z.coerce.number().int().positive().optional() }), req.query);
    return app.docs.detail(parse(id, req.params).id, q.version);
  });
}
