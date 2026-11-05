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
    const row = await this.app.db.transaction(async (tx) => {
      if (input.assigneeAgentId) {
        const [agent] = await tx
          .select()
          .from(schema.agents)
          .where(eq(schema.agents.id, input.assigneeAgentId))
          .for("update");
        if (!agent || agent.status === "retired")
          throw new DomainError("Choose a non-retired agent for this work item.", "conflict");
      }
      const [created] = await tx.insert(schema.workItems).values(input).returning();
      return created!;
    });
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

  async update(
    id: string,
    patch: Partial<Omit<WorkItem, "id" | "createdAt">>,
    actor?: { agentId?: string },
  ): Promise<WorkItem> {
    const values: Partial<WorkItem> = { ...patch, updatedAt: new Date() };
    if (patch.status === "done" || patch.status === "cancelled") values.completedAt = new Date();
    const row = await this.app.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, id))
        .for("update");
      if (!current) throw new DomainError(`work item ${id} not found`, "not_found");
      const reopening = patch.status !== undefined && patch.status !== "done" && patch.status !== "cancelled";
      const assignee =
        patch.assigneeAgentId !== undefined
          ? patch.assigneeAgentId
          : reopening
            ? current.assigneeAgentId
            : null;
      if (assignee) {
        const [agent] = await tx
          .select()
          .from(schema.agents)
          .where(eq(schema.agents.id, assignee))
          .for("update");
        if (!agent || agent.status === "retired")
          throw new DomainError("Choose a non-retired agent for this work item.", "conflict");
      }
      const [updated] = await tx
        .update(schema.workItems)
        .set(values)
        .where(eq(schema.workItems.id, id))
        .returning();
      return updated;
    });
    if (!row) throw new DomainError(`work item ${id} not found`, "not_found");
    if (patch.status === "done" && row.parentId) await this.rollupParent(row.parentId);
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

  /** Closes an epic/story (and its GitHub issue) once every child is done or cancelled. */
  private async rollupParent(parentId: string): Promise<void> {
    const parent = await this.get(parentId).catch(() => null);
    if (!parent || (parent.kind !== "epic" && parent.kind !== "story") || parent.status === "done") return;
    const children = await this.list({ parentId });
    if (!children.length || !children.every((c) => c.status === "done" || c.status === "cancelled")) return;
    await this.update(parent.id, { status: "done" });
    if (parent.githubIssueNumber && parent.githubRepo && this.app.github.connected) {
      const [owner, name] = parent.githubRepo.split("/") as [string, string];
      await (
        await this.app.github.botPort(owner)
      )
        .updateIssue({ owner, name }, parent.githubIssueNumber, { state: "closed" })
        .catch((err) => this.app.log.warn({ err: (err as Error).message }, "closing parent issue failed"));
    }
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
      ? await this.app.db
          .select({ id: schema.agents.id, name: schema.agents.name })
          .from(schema.agents)
          .where(inArray(schema.agents.id, ids))
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
      (w) =>
        w.forCodingAgent &&
        w.status !== "done" &&
        w.status !== "cancelled" &&
        w.kind !== "epic" &&
        w.kind !== "story",
    );
  }
}
