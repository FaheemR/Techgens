import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { DomainError, type DocumentDTO, type DocumentKind, type DocumentStatus, type DocumentSummaryDTO } from "@techgens/core";
import { schema, type Document } from "@techgens/db";
import type { Techgens } from "../app";

export interface DocumentScope {
  agentId?: string | null;
  initiativeId?: string | null;
  productId?: string | null;
  workItemId?: string | null;
}

export class DocumentService {
  constructor(private readonly app: Techgens) {}

  private async authorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!unique.length) return new Map();
    const rows = await this.app.db.select({ id: schema.agents.id, name: schema.agents.name }).from(schema.agents).where(inArray(schema.agents.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async summaries(docs: Document[]): Promise<DocumentSummaryDTO[]> {
    const names = await this.authorNames(docs.map((d) => d.createdByAgentId));
    return docs.map((d) => ({
      id: d.id,
      kind: d.kind as DocumentKind,
      title: d.title,
      status: d.status,
      version: d.currentVersion,
      initiativeId: d.initiativeId,
      authorName: d.createdByAgentId ? (names.get(d.createdByAgentId) ?? null) : null,
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  async write(scope: DocumentScope, input: { title: string; kind: DocumentKind; content: string; documentId?: string; changeSummary?: string }): Promise<{ doc: Document; version: number }> {
    const db = this.app.db;
    let existing: Document | undefined;
    if (input.documentId) {
      existing = await this.get(input.documentId);
    } else if (scope.initiativeId) {
      [existing] = await db
        .select()
        .from(schema.documents)
        .where(and(eq(schema.documents.initiativeId, scope.initiativeId), eq(schema.documents.kind, input.kind), eq(schema.documents.title, input.title)));
    }
    if (existing) {
      const version = existing.currentVersion + 1;
      const [doc] = await db
        .update(schema.documents)
        .set({ content: input.content, title: input.title, currentVersion: version, status: "draft", updatedAt: new Date() })
        .where(eq(schema.documents.id, existing.id))
        .returning();
      await db.insert(schema.documentVersions).values({ documentId: existing.id, version, content: input.content, changeSummary: input.changeSummary ?? "", authorAgentId: scope.agentId ?? null });
      await this.emitWritten(doc!, version, scope.agentId);
      return { doc: doc!, version };
    }
    const [doc] = await db
      .insert(schema.documents)
      .values({
        kind: input.kind,
        title: input.title,
        content: input.content,
        initiativeId: scope.initiativeId ?? null,
        productId: scope.productId ?? null,
        workItemId: scope.workItemId ?? null,
        createdByAgentId: scope.agentId ?? null,
      })
      .returning();
    await db.insert(schema.documentVersions).values({ documentId: doc!.id, version: 1, content: input.content, changeSummary: input.changeSummary ?? "Initial version", authorAgentId: scope.agentId ?? null });
    await this.emitWritten(doc!, 1, scope.agentId);
    return { doc: doc!, version: 1 };
  }

  private async emitWritten(doc: Document, version: number, agentId?: string | null) {
    await this.app.bus.emit({
      type: "document.written",
      actorType: agentId ? "agent" : "system",
      actorId: agentId ?? null,
      subjectType: "document",
      subjectId: doc.id,
      summary: `${doc.title} (v${version})`,
      data: { kind: doc.kind, initiativeId: doc.initiativeId, version },
    });
  }

  async get(id: string): Promise<Document> {
    const [row] = await this.app.db.select().from(schema.documents).where(eq(schema.documents.id, id));
    if (!row) throw new DomainError(`document ${id} not found`, "not_found");
    return row;
  }

  async find(input: { documentId?: string; title?: string; kind?: DocumentKind; initiativeId?: string | null }): Promise<Document | null> {
    if (input.documentId) return this.get(input.documentId).catch(() => null);
    const where: SQL[] = [];
    if (input.initiativeId) where.push(eq(schema.documents.initiativeId, input.initiativeId));
    if (input.kind) where.push(eq(schema.documents.kind, input.kind));
    if (input.title) where.push(sql`lower(${schema.documents.title}) = lower(${input.title})`);
    if (!where.length) return null;
    const [row] = await this.app.db.select().from(schema.documents).where(and(...where)).orderBy(desc(schema.documents.updatedAt)).limit(1);
    return row ?? null;
  }

  async list(filter: { initiativeId?: string; kind?: string; q?: string; ids?: string[]; limit?: number } = {}): Promise<Document[]> {
    const where: SQL[] = [];
    if (filter.initiativeId) where.push(eq(schema.documents.initiativeId, filter.initiativeId));
    if (filter.kind) where.push(eq(schema.documents.kind, filter.kind));
    if (filter.ids) where.push(filter.ids.length ? inArray(schema.documents.id, filter.ids) : sql`false`);
    if (filter.q?.trim()) where.push(sql`${schema.documents.search} @@ websearch_to_tsquery('english', ${filter.q})`);
    return this.app.db
      .select()
      .from(schema.documents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(schema.documents.updatedAt))
      .limit(filter.limit ?? 200);
  }

  async search(query: string, limit = 8): Promise<Array<{ id: string; title: string; kind: string; snippet: string }>> {
    const rows = await this.app.db
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        kind: schema.documents.kind,
        snippet: sql<string>`ts_headline('english', ${schema.documents.content}, websearch_to_tsquery('english', ${query}), 'MaxWords=30, MinWords=10, StartSel=**, StopSel=**')`,
      })
      .from(schema.documents)
      .where(sql`${schema.documents.search} @@ websearch_to_tsquery('english', ${query})`)
      .orderBy(sql`ts_rank(${schema.documents.search}, websearch_to_tsquery('english', ${query})) desc`)
      .limit(limit);
    return rows;
  }

  async setStatus(ids: string[], status: DocumentStatus): Promise<void> {
    if (!ids.length) return;
    await this.app.db.update(schema.documents).set({ status, updatedAt: new Date() }).where(inArray(schema.documents.id, ids));
  }

  async detail(id: string, version?: number): Promise<DocumentDTO> {
    const doc = await this.get(id);
    const versions = await this.app.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, id))
      .orderBy(desc(schema.documentVersions.version));
    const names = await this.authorNames(versions.map((v) => v.authorAgentId));
    const selected = version ? versions.find((v) => v.version === version) : undefined;
    if (version && !selected) throw new DomainError(`version ${version} not found`, "not_found");
    const [summary] = await this.summaries([doc]);
    return {
      ...summary!,
      content: selected?.content ?? doc.content,
      versions: versions.map((v) => ({
        version: v.version,
        changeSummary: v.changeSummary,
        authorName: v.authorAgentId ? (names.get(v.authorAgentId) ?? null) : null,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }
}
