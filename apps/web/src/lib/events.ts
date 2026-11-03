"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { EVENT_TYPES, type EventType, type LiveEvent } from "@techgens/core";
import { API_URL } from "./api";
import { isRecord } from "./utils";

export type LiveStatus = "idle" | "connecting" | "open" | "reconnecting";

export interface LiveSnapshot {
  /** Persisted events received over SSE since the page loaded, newest first (ephemeral deltas excluded). */
  events: LiveEvent[];
  status: LiveStatus;
  /** Epoch ms of the last event of any kind (including token deltas, throttled). */
  lastEventAt: number | null;
  /** Bumped every time the stream (re)opens. */
  connectionCount: number;
}

export type LiveEventListener = (event: LiveEvent) => void;

const MAX_EVENTS = 300;
const MAX_SEEN_IDS = 2_000;
const MAX_RETRY_DELAY = 30_000;
const INVALIDATE_DEBOUNCE_MS = 250;

const SERVER_SNAPSHOT: LiveSnapshot = { events: [], status: "idle", lastEventAt: null, connectionCount: 0 };

/** Query-key roots (see `qk` in queries.ts) to invalidate when an event of the given type arrives. */
export function invalidationRoots(type: string): string[] {
  if (type === "agent.message_delta") return [];
  if (type.startsWith("approval.")) return ["approvals", "dashboard", "initiatives", "notifications"];
  if (type.startsWith("job.")) return ["jobs", "org", "agents", "dashboard", "work-items"];
  if (type.startsWith("initiative.")) return ["initiatives", "dashboard", "notifications"];
  if (type.startsWith("work_item.")) return ["work-items", "initiatives"];
  if (type === "document.written") return ["documents", "initiatives", "approvals"];
  if (type === "decision.recorded") return ["decisions", "initiatives"];
  if (type === "usage.recorded" || type.startsWith("budget."))
    return ["usage", "budgets", "dashboard", "org", "agents", "jobs"];
  if (type === "agent.updated") return ["org", "agents"];
  if (type === "notification.created") return ["notifications"];
  if (type === "chat.message" || type === "directive.received") return ["chat", "initiatives"];
  if (type.startsWith("system.")) return ["system"];
  if (type === "company.updated") return ["company", "dashboard", "goals", "products"];
  if (type === "deployment.updated") return ["deployments", "initiatives"];
  if (type === "incident.opened") return ["incidents", "dashboard"];
  if (type.startsWith("github.")) return ["work-items", "products", "deployments", "initiatives"];
  return [];
}

function parseEvent(message: MessageEvent<unknown>, fallbackType: string): LiveEvent | null {
  if (typeof message.data !== "string") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  // The payload is trusted server output; fill in defaults defensively.
  const type = (typeof raw.type === "string" ? raw.type : fallbackType) as EventType;
  return {
    id:
      typeof raw.id === "string" || typeof raw.id === "number"
        ? String(raw.id)
        : message.lastEventId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    actorType: raw.actorType === "ceo" || raw.actorType === "agent" ? raw.actorType : "system",
    actorId: typeof raw.actorId === "string" ? raw.actorId : null,
    subjectType: typeof raw.subjectType === "string" ? raw.subjectType : null,
    subjectId: typeof raw.subjectId === "string" ? raw.subjectId : null,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    data: isRecord(raw.data) ? raw.data : {},
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

class LiveEventStore {
  private source: EventSource | null = null;
  private refCount = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1_000;
  private lastSeq: string | null = null;
  private seen = new Set<string>();
  private snapshot: LiveSnapshot = SERVER_SNAPSHOT;
  private readonly snapshotListeners = new Set<() => void>();
  private readonly eventListeners = new Set<LiveEventListener>();
  private queryClient: QueryClient | null = null;
  private readonly pendingRoots = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => this.snapshot;

  getServerSnapshot = (): LiveSnapshot => SERVER_SNAPSHOT;

  /** Receives every event, including ephemeral `agent.message_delta` token streams. */
  addListener(listener: LiveEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Ref-counted connection: the first consumer opens the shared EventSource, the last one closes it. */
  acquire(queryClient: QueryClient): () => void {
    this.queryClient = queryClient;
    this.refCount += 1;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (!this.source && !this.retryTimer) this.connect();
    return () => {
      this.refCount -= 1;
      if (this.refCount <= 0) {
        this.refCount = 0;
        // Grace period so StrictMode double-mounts and route changes don't churn the connection.
        this.closeTimer = setTimeout(() => this.disconnect(), 2_000);
      }
    };
  }

  /** Reconnect immediately (e.g. after the orchestrator comes back online). */
  reconnectNow(): void {
    if (this.snapshot.status === "open") return;
    if (this.refCount === 0) return;
    this.teardown();
    this.retryDelay = 1_000;
    this.connect();
  }

  private setSnapshot(patch: Partial<LiveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.snapshotListeners) listener();
  }

  private connect(): void {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const url = new URL(`${API_URL}/api/events/stream`, window.location.origin);
    if (this.lastSeq) url.searchParams.set("since", this.lastSeq);
    this.setSnapshot({ status: this.snapshot.connectionCount > 0 ? "reconnecting" : "connecting" });

    const source = new EventSource(url.toString());
    this.source = source;

    source.onopen = () => {
      const reconnected = this.snapshot.connectionCount > 0;
      this.retryDelay = 1_000;
      this.setSnapshot({ status: "open", connectionCount: this.snapshot.connectionCount + 1 });
      // Events may have been missed while offline and cannot be replayed without a cursor.
      if (reconnected && !this.lastSeq) void this.queryClient?.invalidateQueries();
    };

    source.onerror = () => {
      if (this.source !== source) return;
      // Take over reconnection ourselves (with backoff) instead of the browser's fixed interval.
      this.teardown();
      this.setSnapshot({ status: "reconnecting" });
      this.scheduleReconnect();
    };

    const handler = (message: MessageEvent<unknown>) => this.handleMessage(message);
    source.onmessage = handler;
    for (const type of EVENT_TYPES) source.addEventListener(type, handler as EventListener);
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.refCount === 0) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.refCount > 0) this.connect();
    }, delay);
  }

  private teardown(): void {
    if (this.source) {
      this.source.onopen = null;
      this.source.onerror = null;
      this.source.onmessage = null;
      this.source.close();
      this.source = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private disconnect(): void {
    this.closeTimer = null;
    if (this.refCount > 0) return;
    this.teardown();
    this.setSnapshot({ status: "idle" });
  }

  private handleMessage(message: MessageEvent<unknown>): void {
    const event = parseEvent(message, message.type === "message" ? "agent.message" : message.type);
    if (!event) return;
    const ephemeral = event.type === "agent.message_delta";

    if (!ephemeral) {
      if (message.lastEventId && /^\d+$/.test(message.lastEventId)) this.lastSeq = message.lastEventId;
      if (this.seen.has(event.id)) return;
      this.seen.add(event.id);
      if (this.seen.size > MAX_SEEN_IDS) {
        const oldest = this.seen.values().next().value;
        if (oldest !== undefined) this.seen.delete(oldest);
      }
    }

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Live event listener failed", error);
      }
    }

    const now = Date.now();
    if (ephemeral) {
      // Token streams are chatty: refresh the activity indicator at most once per second.
      if (!this.snapshot.lastEventAt || now - this.snapshot.lastEventAt > 1_000)
        this.setSnapshot({ lastEventAt: now });
      return;
    }

    this.setSnapshot({ events: [event, ...this.snapshot.events].slice(0, MAX_EVENTS), lastEventAt: now });
    for (const root of invalidationRoots(event.type)) this.pendingRoots.add(root);
    if (this.pendingRoots.size > 0 && !this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushInvalidations(), INVALIDATE_DEBOUNCE_MS);
    }
  }

  private flushInvalidations(): void {
    this.flushTimer = null;
    const client = this.queryClient;
    if (!client) return;
    const roots = [...this.pendingRoots];
    this.pendingRoots.clear();
    for (const root of roots) void client.invalidateQueries({ queryKey: [root] });
  }
}

/** The single, app-wide live event connection. */
export const liveEvents = new LiveEventStore();

/** Keeps the shared EventSource open while the calling component is mounted. */
export function useLiveConnection(): void {
  const queryClient = useQueryClient();
  useEffect(() => liveEvents.acquire(queryClient), [queryClient]);
}

/**
 * Opens (or joins) the shared SSE connection to `/api/events/stream`, invalidates the relevant React Query
 * caches as events arrive, and returns the latest events plus the connection status.
 */
export function useLiveEvents(): LiveSnapshot {
  useLiveConnection();
  return useSyncExternalStore(liveEvents.subscribe, liveEvents.getSnapshot, liveEvents.getServerSnapshot);
}

/** Calls `handler` for every live event (including `agent.message_delta`) while mounted. */
export function useLiveEventListener(handler: LiveEventListener): void {
  useLiveConnection();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => liveEvents.addListener((event) => ref.current(event)), []);
}

/** Merges events fetched over REST with the live stream (deduped, newest first). */
export function mergeEvents(
  live: readonly LiveEvent[],
  fetched: readonly LiveEvent[] | undefined,
  limit = 200,
): LiveEvent[] {
  const byId = new Map<string, LiveEvent>();
  for (const event of live) byId.set(event.id, event);
  for (const event of fetched ?? []) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()]
    .sort((a, b) => {
      const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (diff !== 0 && Number.isFinite(diff)) return diff;
      return Number(b.id) - Number(a.id) || 0;
    })
    .slice(0, limit);
}

/** Reads `data.<key>` as a string. */
export function eventString(event: LiveEvent, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = event.data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Job id an event belongs to (from `data.jobId` or a job subject). */
export function eventJobId(event: LiveEvent): string | undefined {
  return (
    eventString(event, "jobId") ?? (event.subjectType === "job" ? (event.subjectId ?? undefined) : undefined)
  );
}
