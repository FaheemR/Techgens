import { desc, lt, and, eq, gt, asc, type SQL } from "drizzle-orm";
import { EPHEMERAL_EVENT_TYPES, type ActorType, type EventType, type LiveEvent } from "@techgens/core";
import { schema, type Db, type EventRow } from "@techgens/db";

export interface EmitInput {
  type: EventType;
  actorType?: ActorType;
  actorId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  summary?: string;
  data?: Record<string, unknown>;
}

type Listener = (event: LiveEvent) => void;

export function toLiveEvent(row: EventRow): LiveEvent {
  return {
    id: String(row.seq),
    type: row.type,
    actorType: row.actorType,
    actorId: row.actorId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    summary: row.summary,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Persists activity events and fans them out to live subscribers (SSE). */
export class EventBus {
  private listeners = new Set<Listener>();
  private ephemeralSeq = 0;

  constructor(private readonly db: Db) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(event: LiveEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // A broken subscriber must never break the producer.
      }
    }
  }

  async emit(input: EmitInput): Promise<LiveEvent> {
    const base = {
      type: input.type,
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? null,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      summary: input.summary ?? "",
      data: input.data ?? {},
    };
    if (EPHEMERAL_EVENT_TYPES.includes(input.type)) {
      const event: LiveEvent = { ...base, id: `e${++this.ephemeralSeq}`, createdAt: new Date().toISOString() };
      this.publish(event);
      return event;
    }
    const [row] = await this.db.insert(schema.events).values(base).returning();
    const event = toLiveEvent(row!);
    this.publish(event);
    return event;
  }

  /** Fire-and-forget variant for hot paths (streaming handlers). */
  emitSoon(input: EmitInput): void {
    void this.emit(input).catch((err) => console.error("[events] emit failed", err));
  }

  async list(options: { limit?: number; before?: number; since?: number; subjectType?: string; subjectId?: string } = {}): Promise<LiveEvent[]> {
    const where: SQL[] = [];
    if (options.before) where.push(lt(schema.events.seq, options.before));
    if (options.since !== undefined) where.push(gt(schema.events.seq, options.since));
    if (options.subjectType) where.push(eq(schema.events.subjectType, options.subjectType));
    if (options.subjectId) where.push(eq(schema.events.subjectId, options.subjectId));
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(where.length ? and(...where) : undefined)
      .orderBy(options.since !== undefined ? asc(schema.events.seq) : desc(schema.events.seq))
      .limit(Math.min(options.limit ?? 50, 500));
    return rows.map(toLiveEvent);
  }
}
