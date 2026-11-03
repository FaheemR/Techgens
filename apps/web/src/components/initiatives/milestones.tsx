"use client";

import type { MilestoneDTO } from "@techgens/core";
import { Flag, Milestone as MilestoneIcon } from "lucide-react";
import { GenericStatusBadge } from "@/components/common/status";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { statusTone, TONE_DOT } from "@/lib/labels";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const DONE = new Set(["done", "completed", "achieved", "complete"]);

function dueLabel(dueDate: string | null, overdue: boolean, now: number): string {
  if (!dueDate) return "No due date";
  const date = formatDate(dueDate);
  const relative = relativeTime(dueDate, now);
  // relativeTime falls back to the plain date for far-away days; don't repeat it.
  if (relative === date) return `Due ${date}`;
  return `Due ${date} · ${overdue ? `${relative.replace(" ago", "")} overdue` : relative}`;
}

function sortMilestones(list: readonly MilestoneDTO[]): MilestoneDTO[] {
  return [...list].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || (Date.parse(a.dueDate ?? "") || 0) - (Date.parse(b.dueDate ?? "") || 0),
  );
}

/** Roadmap: a dated timeline track (when milestones have due dates) plus the ordered milestone list. */
export function MilestoneRoadmap({
  milestones,
  startDate,
  targetDate,
}: {
  milestones: readonly MilestoneDTO[];
  startDate: string;
  targetDate: string | null;
}) {
  const now = useNow(60_000);
  if (milestones.length === 0) {
    return (
      <EmptyState
        compact
        icon={MilestoneIcon}
        title="No roadmap yet"
        description="The Chief of Staff proposes milestones during intake; they appear here once the roadmap is drafted."
      />
    );
  }

  const sorted = sortMilestones(milestones);
  const dated = sorted.filter((m) => m.dueDate && Number.isFinite(Date.parse(m.dueDate)));
  const start = Math.min(Date.parse(startDate) || now, ...dated.map((m) => Date.parse(m.dueDate ?? "")));
  const target = targetDate ? Date.parse(targetDate) : NaN;
  const end = Math.max(
    start + 7 * DAY,
    ...dated.map((m) => Date.parse(m.dueDate ?? "")),
    Number.isFinite(target) ? target : 0,
  );
  const position = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%`;

  return (
    <div className="space-y-5">
      {dated.length > 0 ? (
        <div className="px-2 pt-7 pb-6">
          <div className="relative h-1.5 rounded-full bg-white/[0.07]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/40 to-accent/80"
              style={{ width: position(Math.min(now, end)) }}
            />
            {now >= start && now <= end ? (
              <div
                className="absolute -top-6 bottom-[-6px] w-px bg-accent/70"
                style={{ left: position(now) }}
                aria-hidden
              >
                <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium text-accent">
                  Today
                </span>
              </div>
            ) : null}
            {dated.map((m) => {
              const tone = statusTone(m.status);
              return (
                <span
                  key={m.id}
                  title={`${m.title} — ${formatDate(m.dueDate)} (${m.status})`}
                  className={cn(
                    "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface",
                    DONE.has(m.status) ? "bg-emerald-400" : TONE_DOT[tone],
                  )}
                  style={{ left: position(Date.parse(m.dueDate ?? "")) }}
                />
              );
            })}
            {Number.isFinite(target) ? (
              <span
                className="absolute -top-5 -translate-x-1/2 text-amber-300"
                style={{ left: position(target) }}
                title={`Target date ${formatDate(target)}`}
              >
                <Flag aria-hidden className="size-3.5" />
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-subtle">
            <span>{formatDate(start)}</span>
            <span>{formatDate(end)}</span>
          </div>
        </div>
      ) : null}

      <ol className="relative space-y-4 border-l border-border-strong pl-5">
        {sorted.map((m) => {
          const due = m.dueDate ? Date.parse(m.dueDate) : NaN;
          const done = DONE.has(m.status);
          const overdue = !done && Number.isFinite(due) && due < now;
          return (
            <li key={m.id} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[26px] top-1 size-3 rounded-full border-2 border-surface",
                  done ? "bg-emerald-400" : overdue ? "bg-rose-400" : TONE_DOT[statusTone(m.status)],
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-fg">{m.title}</p>
                <GenericStatusBadge status={m.status} />
              </div>
              {m.description ? <p className="mt-0.5 text-sm text-muted">{m.description}</p> : null}
              <p className={cn("mt-1 text-xs", overdue ? "text-rose-300" : "text-subtle")}>
                {dueLabel(m.dueDate, overdue, now)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
