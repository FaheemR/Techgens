"use client";

import { useState, type DragEvent } from "react";
import type { WorkItemDTO, WorkItemStatus } from "@techgens/core";
import { Bot } from "lucide-react";
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

export function KanbanBoard({
  items,
  columns,
  onOpen,
  onMove,
}: {
  items: readonly WorkItemDTO[];
  columns: readonly WorkItemStatus[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: WorkItemStatus) => void;
}) {
  const [over, setOver] = useState<WorkItemStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function onDrop(event: DragEvent<HTMLElement>, status: WorkItemStatus) {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    setDragging(null);
    const item = items.find((i) => i.id === id);
    if (item && item.status !== status) onMove(id, status);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Work board columns">
      {columns.map((status) => {
        const columnItems = items.filter((i) => i.status === status);
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
              if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setOver(null);
            }}
            onDrop={(event) => onDrop(event, status)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border bg-surface/70 transition-colors",
              over === status ? "border-accent/60 bg-accent/[0.04]" : "border-border",
            )}
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <span aria-hidden className={cn("size-2 rounded-full", TONE_DOT[WORK_STATUS_TONE[status]])} />
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
                columnItems.map((item) => (
                  <li key={item.id}>
                    <WorkCard
                      item={item}
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
          </section>
        );
      })}
    </div>
  );
}

function WorkCard({
  item,
  onOpen,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  item: WorkItemDTO;
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
      <div className="flex items-center gap-1.5 text-[11px] text-subtle">
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
