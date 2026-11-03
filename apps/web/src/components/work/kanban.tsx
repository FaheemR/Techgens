"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { WorkItemDTO, WorkItemStatus } from "@techgens/core";
import { Bot, Rocket } from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { CodingStatusBadge, PriorityBadge } from "@/components/common/status";
import { humanize } from "@/lib/format";
import { TONE_DOT, WORK_STATUS_LABEL, WORK_STATUS_TONE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { GithubLinks, WorkKindIcon } from "./work-item-bits";

export const BOARD_COLUMNS: readonly WorkItemStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "in_review",
  "done",
];

const DRAG_TYPE = "application/x-techgens-work-item";
/** Done is the busiest column: it shows the most recent cards until the CEO asks for all of them. */
const DONE_PREVIEW = 10;

function finishedAt(item: WorkItemDTO): number {
  return Date.parse(item.completedAt ?? item.updatedAt) || 0;
}

export function KanbanBoard({
  items,
  columns,
  onOpen,
  onMove,
  initiativeTitles,
}: {
  items: readonly WorkItemDTO[];
  columns: readonly WorkItemStatus[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: WorkItemStatus) => void;
  /** Initiative names for the chip on stage cards; omit when every card belongs to the same initiative. */
  initiativeTitles?: ReadonlyMap<string, string> | undefined;
}) {
  const [over, setOver] = useState<WorkItemStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Fade the edges that have more columns behind them, so an off-screen "Done" column is discoverable.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function onDrop(event: DragEvent<HTMLElement>, status: WorkItemStatus) {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    setDragging(null);
    const item = items.find((i) => i.id === id);
    if (item && item.status !== status) onMove(id, status);
  }

  return (
    <div className="relative">
      {/* Focusable so keyboard users can scroll the board with the arrow keys. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Work board, scrolls sideways"
        tabIndex={0}
        className="overflow-x-auto rounded-xl pb-3"
      >
        <div className="flex w-max gap-3" role="list" aria-label="Work board columns">
          {columns.map((status) => {
            const columnItems = items.filter((i) => i.status === status);
            if (status === "done") columnItems.sort((a, b) => finishedAt(b) - finishedAt(a));
            const collapsible = status === "done" && columnItems.length > DONE_PREVIEW;
            const shown = collapsible && !allDone ? columnItems.slice(0, DONE_PREVIEW) : columnItems;
            return (
              <section
                key={status}
                role="listitem"
                aria-label={`${WORK_STATUS_LABEL[status]} (${columnItems.length})`}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (over !== status) setOver(status);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null))
                    setOver(null);
                }}
                onDrop={(event) => onDrop(event, status)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-xl border bg-surface/70 transition-colors",
                  over === status ? "border-accent/60 bg-accent/[0.04]" : "border-border",
                )}
              >
                <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", TONE_DOT[WORK_STATUS_TONE[status]])}
                  />
                  <h2 className="text-sm font-semibold">{WORK_STATUS_LABEL[status]}</h2>
                  <span className="ml-auto rounded-full bg-white/5 px-2 text-xs tabular-nums text-muted">
                    {columnItems.length}
                  </span>
                </header>
                <ul className="flex max-h-[calc(100dvh-18rem)] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                  {columnItems.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                      {dragging ? "Drop here" : "Nothing here"}
                    </li>
                  ) : (
                    shown.map((item) => (
                      <li key={item.id}>
                        <WorkCard
                          item={item}
                          initiativeTitle={
                            item.kind === "stage" && item.initiativeId
                              ? initiativeTitles?.get(item.initiativeId)
                              : undefined
                          }
                          onOpen={onOpen}
                          dragging={dragging === item.id}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(DRAG_TYPE, item.id);
                            event.dataTransfer.setData("text/plain", item.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDragging(item.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      </li>
                    ))
                  )}
                </ul>
                {collapsible ? (
                  <div className="border-t border-border p-2">
                    <button
                      type="button"
                      onClick={() => setAllDone((v) => !v)}
                      aria-expanded={allDone}
                      className="w-full rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-white/5 hover:text-fg"
                    >
                      {allDone ? `Show the ${DONE_PREVIEW} most recent` : `Show all ${columnItems.length}`}
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-3 left-0 top-0 w-12 bg-gradient-to-r from-bg to-transparent transition-opacity",
          edges.start ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-3 right-0 top-0 w-12 bg-gradient-to-l from-bg to-transparent transition-opacity",
          edges.end ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function WorkCard({
  item,
  initiativeTitle,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  item: WorkItemDTO;
  initiativeTitle?: string | undefined;
  onOpen: (id: string) => void;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative cursor-grab rounded-lg border border-border bg-[#0e1622] p-3 shadow-sm transition-colors hover:border-border-strong active:cursor-grabbing",
        dragging && "opacity-40",
        item.status === "blocked" && "border-rose-400/30",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        <WorkKindIcon kind={item.kind} />
        <span>{humanize(item.kind)}</span>
        {item.forCodingAgent ? (
          <span
            className="inline-flex items-center gap-0.5 text-cyan-300"
            title="Implemented by the Copilot coding agent"
          >
            <Bot aria-hidden className="size-3" /> coding agent
          </span>
        ) : null}
        <PriorityBadge priority={item.priority} className="ml-auto" />
      </div>
      <h3 className="mt-1.5 text-sm font-medium leading-snug text-fg">
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="line-clamp-3 text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
        >
          {item.title}
        </button>
      </h3>
      {initiativeTitle ? (
        // Stage cards share titles ("Intake: charter & roadmap"), so name the initiative they belong to.
        <p className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-muted">
          <Rocket aria-hidden className="size-3 shrink-0 text-subtle" />
          <span className="sr-only">Initiative:</span>
          <span className="truncate">{initiativeTitle}</span>
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {item.assigneeName ? (
            <>
              <AgentAvatar name={item.assigneeName} size="xs" />
              <span className="truncate">{item.assigneeName}</span>
            </>
          ) : (
            <span className="text-subtle">Unassigned</span>
          )}
        </span>
        <span className="relative z-10">
          <GithubLinks item={item} />
        </span>
      </div>
      {item.codingStatus && item.codingStatus !== "unassigned" ? (
        <div className="relative z-10 mt-2">
          <CodingStatusBadge status={item.codingStatus} />
        </div>
      ) : null}
    </article>
  );
}
