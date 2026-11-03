import { desc, eq, isNull } from "drizzle-orm";
import type { NotificationDTO } from "@techgens/core";
import { schema, type Notification } from "@techgens/db";
import type { Techgens } from "../app";

export function notificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export class NotificationService {
  constructor(private readonly app: Techgens) {}

  async notify(input: { kind: string; title: string; body?: string; link?: string }): Promise<Notification> {
    const [row] = await this.app.db
      .insert(schema.notifications)
      .values({ kind: input.kind, title: input.title, body: input.body ?? "", link: input.link ?? null })
      .returning();
    await this.app.bus.emit({
      type: "notification.created",
      subjectType: "notification",
      subjectId: row!.id,
      summary: input.title,
      data: { kind: input.kind, link: input.link ?? null },
    });
    return row!;
  }

  async list(limit = 50): Promise<NotificationDTO[]> {
    const rows = await this.app.db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(limit);
    return rows.map(notificationDTO);
  }

  async markRead(id: string): Promise<void> {
    await this.app.db.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.id, id));
  }

  async markAllRead(): Promise<void> {
    await this.app.db.update(schema.notifications).set({ readAt: new Date() }).where(isNull(schema.notifications.readAt));
  }
}
