import { asc, desc, eq } from "drizzle-orm";
import { DomainError, truncate, type MessageDTO, type ThreadDTO } from "@techgens/core";
import { schema, type Message, type Thread } from "@techgens/db";
import type { Techgens } from "../app";

const threadDTO = (t: Thread): ThreadDTO => ({
  id: t.id,
  title: t.title,
  archived: t.archived,
  agentId: t.agentId,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

export class ChatService {
  constructor(private readonly app: Techgens) {}

  async listThreads(): Promise<ThreadDTO[]> {
    const rows = await this.app.db.select().from(schema.threads).orderBy(desc(schema.threads.updatedAt));
    return rows.map(threadDTO);
  }

  async createThread(title?: string): Promise<ThreadDTO> {
    const cos = await this.app.org.agentForRole("chief-of-staff");
    const [row] = await this.app.db
      .insert(schema.threads)
      .values({ title: title?.trim() || "New directive", agentId: cos?.id ?? null })
      .returning();
    return threadDTO(row!);
  }

  async getThread(id: string): Promise<Thread> {
    const [row] = await this.app.db.select().from(schema.threads).where(eq(schema.threads.id, id));
    if (!row) throw new DomainError("thread not found", "not_found");
    return row;
  }

  async updateThread(id: string, patch: { title?: string; archived?: boolean }): Promise<ThreadDTO> {
    await this.getThread(id);
    const [row] = await this.app.db
      .update(schema.threads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.threads.id, id))
      .returning();
    return threadDTO(row!);
  }

  async setThreadSession(id: string, sessionId: string): Promise<void> {
    await this.app.db.update(schema.threads).set({ sessionId }).where(eq(schema.threads.id, id));
  }

  private async dtos(rows: Message[]): Promise<MessageDTO[]> {
    const agents = new Map((await this.app.org.listAgentRows()).map((a) => [a.id, a.name]));
    return rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      authorType: m.authorType,
      authorName:
        m.authorType === "ceo" ? "CEO" : m.authorAgentId ? (agents.get(m.authorAgentId) ?? null) : "Techgens",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async messages(threadId: string): Promise<MessageDTO[]> {
    await this.getThread(threadId);
    const rows = await this.app.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.threadId, threadId))
      .orderBy(asc(schema.messages.createdAt));
    return this.dtos(rows);
  }

  async postCeoMessage(threadId: string, content: string): Promise<{ message: MessageDTO; jobId: string }> {
    if (!content.trim()) throw new DomainError("message is empty");
    const thread = await this.getThread(threadId);
    if (thread.archived) throw new DomainError("Restore this conversation before sending another directive.");
    const cos = await this.app.org.agentForRole("chief-of-staff");
    if (!cos) throw new DomainError("No active Chief of Staff", "unavailable");
    const [row] = await this.app.db
      .insert(schema.messages)
      .values({ threadId, authorType: "ceo", content })
      .returning();
    const isFirst =
      (
        await this.app.db
          .select({ id: schema.messages.id })
          .from(schema.messages)
          .where(eq(schema.messages.threadId, threadId))
      ).length === 1;
    await this.app.db
      .update(schema.threads)
      .set({
        updatedAt: new Date(),
        ...(isFirst && thread.title === "New directive"
          ? { title: truncate(content.replace(/\s+/g, " "), 60) }
          : {}),
      })
      .where(eq(schema.threads.id, threadId));
    await this.app.bus.emit({
      type: "directive.received",
      actorType: "ceo",
      subjectType: "thread",
      subjectId: threadId,
      summary: truncate(content, 160),
      data: { threadId, messageId: row!.id },
    });
    const job = await this.app.engine.createJob({ agentId: cos.id, prompt: content, kind: "chat", threadId });
    const [message] = await this.dtos([row!]);
    return { message: message!, jobId: job.id };
  }

  async postAgentReply(threadId: string, agentId: string, content: string, jobId: string): Promise<void> {
    const [row] = await this.app.db
      .insert(schema.messages)
      .values({ threadId, authorType: "agent", authorAgentId: agentId, content, metadata: { jobId } })
      .returning();
    await this.app.db
      .update(schema.threads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.threads.id, threadId));
    await this.app.bus.emit({
      type: "chat.message",
      actorType: "agent",
      actorId: agentId,
      subjectType: "thread",
      subjectId: threadId,
      summary: truncate(content, 160),
      data: { threadId, messageId: row!.id, jobId, content },
    });
  }
}
