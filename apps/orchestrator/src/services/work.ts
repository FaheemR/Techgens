import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { DomainError, type WorkItemDTO, type WorkItemKind, type WorkItemStatus } from "@techgens/core";
import { schema, type NewWorkItem, type WorkItem } from "@techgens/db";
import type { Techgens } from "../app";

export interface WorkFilter {
  initiativeId?: string;
  status?: WorkItemStatus;
  kind?: WorkItemKind;
  assigneeAgentId?: string;
  parentId?: string;
  productId?: string;
}

export class WorkService {
  constructor(private readonly app: Techgens) {}

  async create(input: Omit<NewWorkItem, "id" | "createdAt" | "updatedAt">): Promise<WorkItem> {
    const [row] = await this.app.db.insert(schema.workItems).values(input).returning();
    await this.app.bus.emit({
      type: "work_item.created",
      actorType: input.createdByAgentId ? "agent" : "system",
      actorId: input.createdByAgentId ?? null,
      subjectType: "work_item",
      subjectId: row!.id,
      summary: `${row!.kind}: ${row!.title}`,
      data: { initiativeId: row!.initiativeId, kind: row!.kind, status: row!.status },
    });
    return row!;
  }

  async get(id: string): Promise<WorkItem> {
    const [row] = await this.app.db.select().from(schema.workItems).where(eq(schema.workItems.id, id));
    if (!row) throw new DomainError(`work item ${id} not found`, "not_found");
    return row;
  }

  async update(id: string, patch: Partial<Omit<WorkItem, "id" | "createdAt">>, actor?: { agentId?: string }): Promise<WorkItem> {
    const values: Partial<WorkItem> = { ...patch, updatedAt: new Date() };
    if (patch.status === "done" || patch.status === "cancelled") values.completedAt = new Date();
    const [row] = await this.app.db.update(schema.workItems).set(values).where(eq(schema.workItems.id, id)).returning();
    if (!row) throw new DomainError(`work item ${id} not found`, "not_found");
    await this.app.bus.emit({
      type: "work_item.updated",
      actorType: actor?.agentId ? "agent" : "system",
      actorId: actor?.agentId ?? null,
      subjectType: "work_item",
      subjectId: id,
      summary: `${row.title} → ${row.status}${row.codingStatus !== "unassigned" ? ` (${row.codingStatus})` : ""}`,
      data: { initiativeId: row.initiativeId, status: row.status, codingStatus: row.codingStatus },
    });
    return row;
  }

  async list(filter: WorkFilter = {}): Promise<WorkItem[]> {
    const where: SQL[] = [];
    if (filter.initiativeId) where.push(eq(schema.workItems.initiativeId, filter.initiativeId));
    if (filter.status) where.push(eq(schema.workItems.status, filter.status));
    if (filter.kind) where.push(eq(schema.workItems.kind, filter.kind));
    if (filter.assigneeAgentId) where.push(eq(schema.workItems.assigneeAgentId, filter.assigneeAgentId));
    if (filter.parentId) where.push(eq(schema.workItems.parentId, filter.parentId));
    if (filter.productId) where.push(eq(schema.workItems.productId, filter.productId));
    return this.app.db
      .select()
      .from(schema.workItems)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(schema.workItems.createdAt))
      .limit(1000);
  }

  async dtos(items: WorkItem[]): Promise<WorkItemDTO[]> {
    const ids = [...new Set(items.map((i) => i.assigneeAgentId).filter((x): x is string => Boolean(x)))];
    const agents = ids.length
      ? await this.app.db.select({ id: schema.agents.id, name: schema.agents.name }).from(schema.agents).where(inArray(schema.agents.id, ids))
      : [];
    const names = new Map(agents.map((a) => [a.id, a.name]));
    return items.map((w) => ({
      id: w.id,
      parentId: w.parentId,
      initiativeId: w.initiativeId,
      productId: w.productId,
      kind: w.kind,
      title: w.title,
      description: w.description,
      status: w.status,
      priority: w.priority,
      stage: w.stage ?? null,
      assigneeAgentId: w.assigneeAgentId,
      assigneeName: w.assigneeAgentId ? (names.get(w.assigneeAgentId) ?? null) : null,
      forCodingAgent: w.forCodingAgent,
      githubUrl: w.githubUrl,
      githubIssueNumber: w.githubIssueNumber,
      prNumber: w.prNumber,
      prUrl: w.prUrl,
      codingStatus: w.codingStatus,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      completedAt: w.completedAt?.toISOString() ?? null,
    }));
  }

  async dto(item: WorkItem): Promise<WorkItemDTO> {
    return (await this.dtos([item]))[0]!;
  }

  /** Build-stage tasks still owned by the coding agent pipeline. */
  async openCodingTasks(initiativeId: string): Promise<WorkItem[]> {
    const items = await this.list({ initiativeId });
    return items.filter(
      (w) => w.forCodingAgent && w.status !== "done" && w.status !== "cancelled" && w.kind !== "epic" && w.kind !== "story",
    );
  }
}
