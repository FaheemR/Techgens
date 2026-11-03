import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DomainError, type AgentDTO, type AgentDetailDTO, type RoleDTO, type RoleDefinition, type RoleFrontmatter } from "@techgens/core";
import type { PromptTeamMember } from "@techgens/agents";
import { schema, type Agent, type Role } from "@techgens/db";
import type { Techgens } from "../app";

export function roleDTO(r: Role): RoleDTO {
  return {
    id: r.id,
    title: r.title,
    department: r.department,
    reportsTo: r.reportsTo,
    description: r.description,
    definition: r.definition,
    prompt: r.prompt,
    source: r.source,
  };
}

export function roleDefinition(r: Role): RoleDefinition {
  return { ...r.definition, prompt: r.prompt };
}

export class OrgService {
  constructor(private readonly app: Techgens) {}

  async listRoles(): Promise<Role[]> {
    return this.app.db.select().from(schema.roles).orderBy(asc(schema.roles.id));
  }

  async getRole(id: string): Promise<Role> {
    const [row] = await this.app.db.select().from(schema.roles).where(eq(schema.roles.id, id));
    if (!row) throw new DomainError(`role ${id} not found`, "not_found");
    return row;
  }

  async listAgentRows(): Promise<Agent[]> {
    return this.app.db.select().from(schema.agents).orderBy(asc(schema.agents.createdAt));
  }

  async getAgent(id: string): Promise<Agent> {
    const [row] = await this.app.db.select().from(schema.agents).where(eq(schema.agents.id, id));
    if (!row) throw new DomainError("agent not found", "not_found");
    return row;
  }

  async agentWithRole(id: string): Promise<{ agent: Agent; role: Role }> {
    const agent = await this.getAgent(id);
    return { agent, role: await this.getRole(agent.roleId) };
  }

  /** First active agent of a role (by seniority). */
  async agentForRole(roleId: string): Promise<Agent | null> {
    const [row] = await this.app.db
      .select()
      .from(schema.agents)
      .where(and(eq(schema.agents.roleId, roleId), eq(schema.agents.status, "active")))
      .orderBy(asc(schema.agents.createdAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * Resolves "product-manager", "Product Manager" or an agent name ("Leo") to an active agent. For roles with several
   * agents, picks the one with the fewest open jobs.
   */
  async resolveAgent(ref: string, options: { excludeAgentId?: string } = {}): Promise<Agent> {
    const needle = ref.trim().toLowerCase();
    const roles = await this.listRoles();
    const agents = (await this.listAgentRows()).filter((a) => a.status === "active" && a.id !== options.excludeAgentId);
    const byName = agents.find((a) => a.name.toLowerCase() === needle);
    if (byName) return byName;
    const role = roles.find((r) => r.id === needle || r.title.toLowerCase() === needle || r.id === needle.replace(/\s+/g, "-"));
    if (!role) throw new DomainError(`No colleague matches "${ref}". Use a role id such as ${roles.map((r) => r.id).slice(0, 6).join(", ")}…`);
    const candidates = agents.filter((a) => a.roleId === role.id);
    if (!candidates.length) throw new DomainError(`No active agent holds the ${role.title} role.`);
    if (candidates.length === 1) return candidates[0]!;
    const loads = await this.app.db
      .select({ agentId: schema.jobs.agentId, n: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(and(inArray(schema.jobs.agentId, candidates.map((c) => c.id)), inArray(schema.jobs.status, ["queued", "running", "waiting"])))
      .groupBy(schema.jobs.agentId);
    const load = new Map(loads.map((l) => [l.agentId, l.n]));
    return [...candidates].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!;
  }

  /** Manager / reports / colleagues for the system prompt. */
  async teamContext(agent: Agent): Promise<{ manager: PromptTeamMember | null; reports: PromptTeamMember[]; colleagues: PromptTeamMember[] }> {
    const roles = new Map((await this.listRoles()).map((r) => [r.id, r]));
    const agents = (await this.listAgentRows()).filter((a) => a.status === "active");
    const member = (a: Agent): PromptTeamMember => {
      const r = roles.get(a.roleId)!;
      return { name: a.name, roleId: r.id, title: r.title, description: r.description };
    };
    const manager = agent.managerAgentId ? agents.find((a) => a.id === agent.managerAgentId) : undefined;
    const reports = agents.filter((a) => a.managerAgentId === agent.id);
    const seenRoles = new Set([agent.roleId, ...reports.map((r) => r.roleId), manager?.roleId]);
    const colleagues: PromptTeamMember[] = [];
    for (const a of agents) {
      if (seenRoles.has(a.roleId)) continue;
      seenRoles.add(a.roleId);
      colleagues.push(member(a));
    }
    return { manager: manager ? member(manager) : null, reports: reports.map(member), colleagues };
  }

  /** Sets every agent's manager to the senior agent of its role's `reportsTo`. */
  async relinkManagers(): Promise<void> {
    const roles = await this.listRoles();
    const agents = await this.listAgentRows();
    for (const agent of agents) {
      const role = roles.find((r) => r.id === agent.roleId);
      const manager = role?.reportsTo ? agents.find((a) => a.roleId === role.reportsTo && a.status !== "retired") : undefined;
      const managerId = manager?.id ?? null;
      if (agent.managerAgentId !== managerId) {
        await this.app.db.update(schema.agents).set({ managerAgentId: managerId }).where(eq(schema.agents.id, agent.id));
      }
    }
  }

  async hire(roleId: string, name?: string): Promise<Agent> {
    const role = await this.getRole(roleId);
    const count = (await this.listAgentRows()).filter((a) => a.roleId === roleId).length;
    const def = role.definition;
    const [agent] = await this.app.db
      .insert(schema.agents)
      .values({ roleId, name: name?.trim() || def.names[count] || `${role.title} ${count + 1}` })
      .returning();
    await this.app.budget.ensureAgentBudget(agent!.id, def.budget.dailyCredits);
    await this.relinkManagers();
    await this.app.bus.emit({ type: "agent.updated", actorType: "ceo", subjectType: "agent", subjectId: agent!.id, summary: `Hired ${agent!.name} as ${role.title}` });
    return agent!;
  }

  async updateAgent(id: string, patch: { name?: string; status?: Agent["status"]; modelOverride?: string | null; dailyCreditsOverride?: number | null }): Promise<Agent> {
    const before = await this.getAgent(id);
    const [agent] = await this.app.db.update(schema.agents).set({ ...patch, updatedAt: new Date() }).where(eq(schema.agents.id, id)).returning();
    if (patch.dailyCreditsOverride !== undefined) {
      const role = await this.getRole(agent!.roleId);
      await this.app.budget.ensureAgentBudget(id, patch.dailyCreditsOverride ?? role.definition.budget.dailyCredits, true);
    }
    if (patch.status && patch.status !== before.status) {
      if (patch.status === "active") await this.app.engine.requeueAgentJobs(id);
      if (patch.status === "retired") await this.relinkManagers();
    }
    await this.app.bus.emit({ type: "agent.updated", actorType: "ceo", subjectType: "agent", subjectId: id, summary: `${agent!.name} updated` });
    return agent!;
  }

  async updateRole(id: string, patch: Partial<Pick<RoleFrontmatter, "model" | "reasoningEffort" | "tools" | "budget" | "description" | "responsibilities">> & { prompt?: string }): Promise<Role> {
    const role = await this.getRole(id);
    const { prompt, ...defPatch } = patch;
    const definition = { ...role.definition, ...defPatch };
    const [row] = await this.app.db
      .update(schema.roles)
      .set({ definition, prompt: prompt ?? role.prompt, description: definition.description, source: "customized", updatedAt: new Date() })
      .where(eq(schema.roles.id, id))
      .returning();
    return row!;
  }

  async agentDTOs(): Promise<AgentDTO[]> {
    const [roles, agents, active, spent] = await Promise.all([
      this.listRoles(),
      this.listAgentRows(),
      this.app.db
        .select({ agentId: schema.jobs.agentId, status: schema.jobs.status, title: schema.workItems.title })
        .from(schema.jobs)
        .leftJoin(schema.workItems, eq(schema.jobs.workItemId, schema.workItems.id))
        .where(inArray(schema.jobs.status, ["queued", "running", "waiting"])),
      this.app.budget.spentTodayByAgent(),
    ]);
    const roleMap = new Map(roles.map((r) => [r.id, r]));
    const roleModels = await this.app.settings.get("roleModels");
    const budgets = await this.app.budget.agentDailyLimits();
    return agents.map((a) => {
      const role = roleMap.get(a.roleId)!;
      const mine = active.filter((j) => j.agentId === a.id);
      const running = mine.find((j) => j.status === "running");
      return {
        id: a.id,
        name: a.name,
        roleId: a.roleId,
        roleTitle: role.title,
        department: role.department,
        managerAgentId: a.managerAgentId,
        status: a.status,
        executor: role.definition.executor,
        model: a.modelOverride ?? roleModels[a.roleId] ?? role.definition.model ?? null,
        dailyBudgetCredits: budgets.get(a.id) ?? role.definition.budget.dailyCredits,
        spentTodayCredits: spent.get(a.id) ?? 0,
        activeJobs: mine.length,
        currentActivity: running?.title ?? (mine[0] ? `${mine[0].status}: ${mine[0].title ?? "assignment"}` : null),
      };
    });
  }

  async agentDetail(id: string): Promise<AgentDetailDTO> {
    const dto = (await this.agentDTOs()).find((a) => a.id === id);
    if (!dto) throw new DomainError("agent not found", "not_found");
    const role = await this.getRole(dto.roleId);
    const memories = await this.app.db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.agentId, id))
      .orderBy(asc(schema.memories.createdAt));
    return {
      ...dto,
      role: roleDTO(role),
      recentJobs: await this.app.engine.listJobDTOs({ agentId: id, limit: 20 }),
      memories: memories.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt.toISOString() })),
    };
  }

  /** Model for an agent: per-agent override → CEO per-role setting → role default → runtime default. */
  async effectiveModel(agent: Agent, role: Role): Promise<string | undefined> {
    const roleModels = await this.app.settings.get("roleModels");
    return agent.modelOverride ?? roleModels[role.id] ?? role.definition.model ?? undefined;
  }
}
