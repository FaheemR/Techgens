import { asc, eq } from "drizzle-orm";
import { DomainError, slugify, type CompanyDTO, type GoalDTO, type ProductDTO } from "@techgens/core";
import { DEFAULT_POLICIES, DEFAULT_VALUES, loadRolesFromDir, validateOrgChart } from "@techgens/agents";
import { schema, type Company, type Goal, type Product } from "@techgens/db";
import type { Techgens } from "../app";

export function companyDTO(c: Company): CompanyDTO {
  return {
    name: c.name,
    mission: c.mission,
    vision: c.vision,
    values: c.values,
    policies: c.policies,
    githubOwner: c.githubOwner,
    onboarded: c.onboarded,
  };
}

export function productDTO(p: Product): ProductDTO {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    vision: p.vision,
    status: p.status,
    repoOwner: p.repoOwner,
    repoName: p.repoName,
    repoUrl: p.repoOwner && p.repoName ? `https://github.com/${p.repoOwner}/${p.repoName}` : null,
    defaultBranch: p.defaultBranch,
    integrationBranch: p.integrationBranch,
    azure: { ...p.azure },
    createdAt: p.createdAt.toISOString(),
  };
}

export function goalDTO(g: Goal): GoalDTO {
  return {
    id: g.id,
    parentId: g.parentId,
    productId: g.productId,
    initiativeId: g.initiativeId,
    type: g.type,
    title: g.title,
    description: g.description,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    unit: g.unit,
    dueDate: g.dueDate?.toISOString() ?? null,
    status: g.status,
  };
}

const DEFAULT_COMPANY_BUDGET_MONTH = 3000;

export class CompanyService {
  constructor(private readonly app: Techgens) {}

  /** Idempotent: roles are (re)loaded from role files; agents, budgets and routines are created when missing. */
  async seed(): Promise<void> {
    const db = this.app.db;
    await db.insert(schema.company).values({ id: "default", policies: DEFAULT_POLICIES, values: DEFAULT_VALUES }).onConflictDoNothing();

    const roles = loadRolesFromDir();
    const errors = validateOrgChart(roles);
    if (errors.length) throw new Error(`invalid built-in org chart: ${errors.join("; ")}`);
    const existing = new Map((await db.select().from(schema.roles)).map((r) => [r.id, r]));
    for (const role of roles) {
      const { prompt, ...definition } = role;
      const row = { id: role.id, title: role.title, department: role.department, reportsTo: role.reportsTo, description: role.description, definition, prompt };
      const current = existing.get(role.id);
      if (!current) await db.insert(schema.roles).values({ ...row, source: "builtin" });
      else if (current.source === "builtin") await db.update(schema.roles).set({ ...row, updatedAt: new Date() }).where(eq(schema.roles.id, role.id));
    }

    // Staff roles that have no agents yet.
    const agents = await db.select().from(schema.agents);
    const staffed = new Set(agents.map((a) => a.roleId));
    for (const role of roles) {
      if (staffed.has(role.id)) continue;
      for (let i = 0; i < role.headcount; i++) {
        const name = role.names[i] ?? `${role.title} ${i + 1}`;
        const [agent] = await db.insert(schema.agents).values({ roleId: role.id, name }).returning();
        await this.app.budget.ensureAgentBudget(agent!.id, role.budget.dailyCredits);
      }
    }
    await this.app.org.relinkManagers();

    const budgets = await db.select().from(schema.budgets).where(eq(schema.budgets.scope, "company"));
    if (!budgets.length) {
      await db.insert(schema.budgets).values({ scope: "company", scopeId: null, period: "month", limitCredits: DEFAULT_COMPANY_BUDGET_MONTH });
    }
    await this.app.routines.seed();
  }

  async get(): Promise<Company> {
    const [row] = await this.app.db.select().from(schema.company).where(eq(schema.company.id, "default"));
    if (!row) throw new DomainError("company not initialised", "unavailable");
    return row;
  }

  async update(patch: Partial<CompanyDTO>): Promise<Company> {
    const allowed: Partial<Company> = {};
    if (patch.name !== undefined) allowed.name = patch.name;
    if (patch.mission !== undefined) allowed.mission = patch.mission;
    if (patch.vision !== undefined) allowed.vision = patch.vision;
    if (patch.values !== undefined) allowed.values = patch.values;
    if (patch.policies !== undefined) allowed.policies = patch.policies;
    if (patch.githubOwner !== undefined) allowed.githubOwner = patch.githubOwner;
    if (patch.onboarded !== undefined) allowed.onboarded = patch.onboarded;
    const [row] = await this.app.db
      .update(schema.company)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(schema.company.id, "default"))
      .returning();
    await this.app.bus.emit({ type: "company.updated", actorType: "ceo", summary: "Company strategy updated" });
    return row!;
  }

  // ---- Products -------------------------------------------------------------------------------------------------
  async listProducts(): Promise<Product[]> {
    return this.app.db.select().from(schema.products).orderBy(asc(schema.products.createdAt));
  }

  async getProduct(id: string): Promise<Product> {
    const [row] = await this.app.db.select().from(schema.products).where(eq(schema.products.id, id));
    if (!row) throw new DomainError("product not found", "not_found");
    return row;
  }

  async findProductByName(name: string): Promise<Product | null> {
    const slug = slugify(name);
    const [row] = await this.app.db.select().from(schema.products).where(eq(schema.products.slug, slug));
    return row ?? null;
  }

  async createProduct(input: { name: string; description?: string; vision?: string; repoOwner?: string | null; repoName?: string | null }): Promise<Product> {
    if (!input.name.trim()) throw new DomainError("product name is required");
    let slug = slugify(input.name) || "product";
    for (let i = 2; await this.slugTaken(slug); i++) slug = `${slugify(input.name)}-${i}`;
    const [row] = await this.app.db
      .insert(schema.products)
      .values({
        name: input.name.trim(),
        slug,
        description: input.description ?? "",
        vision: input.vision ?? "",
        repoOwner: input.repoOwner ?? null,
        repoName: input.repoName ?? null,
      })
      .returning();
    return row!;
  }

  private async slugTaken(slug: string): Promise<boolean> {
    const rows = await this.app.db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug));
    return rows.length > 0;
  }

  async updateProduct(id: string, patch: Partial<Pick<Product, "name" | "description" | "vision" | "status" | "repoOwner" | "repoName" | "defaultBranch" | "integrationBranch" | "azure" | "projectNumber">>): Promise<Product> {
    const [row] = await this.app.db
      .update(schema.products)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.products.id, id))
      .returning();
    if (!row) throw new DomainError("product not found", "not_found");
    return row;
  }

  // ---- Goals ----------------------------------------------------------------------------------------------------
  async listGoals(): Promise<Goal[]> {
    return this.app.db.select().from(schema.goals).orderBy(asc(schema.goals.createdAt));
  }

  async createGoal(input: Partial<GoalDTO> & { title: string }): Promise<Goal> {
    const [row] = await this.app.db
      .insert(schema.goals)
      .values({
        title: input.title,
        type: input.type ?? (input.parentId ? "key_result" : "objective"),
        description: input.description ?? "",
        parentId: input.parentId ?? null,
        productId: input.productId ?? null,
        initiativeId: input.initiativeId ?? null,
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? null,
        unit: input.unit ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: input.status ?? "on_track",
      })
      .returning();
    return row!;
  }

  async updateGoal(id: string, input: Partial<GoalDTO>): Promise<Goal> {
    const patch: Partial<Goal> = {};
    for (const key of ["title", "description", "targetValue", "currentValue", "unit", "status", "type"] as const) {
      if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
    }
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    const [row] = await this.app.db.update(schema.goals).set({ ...patch, updatedAt: new Date() }).where(eq(schema.goals.id, id)).returning();
    if (!row) throw new DomainError("goal not found", "not_found");
    return row;
  }

  async deleteGoal(id: string): Promise<void> {
    await this.app.db.delete(schema.goals).where(eq(schema.goals.id, id));
  }
}
