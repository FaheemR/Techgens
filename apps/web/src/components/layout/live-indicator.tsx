"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { useLiveEvents } from "@/lib/events";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const LABELS = {
  idle: "Offline",
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
} as const;

/** Connection state of the live event stream, flashing as events arrive. */
export function LiveIndicator() {
  const { status, lastEventAt, events } = useLiveEvents();
  const now = useNow(1_500);
  const recent = lastEventAt !== null && now - lastEventAt < 2_500;
  const latest = events[0];
  const open = status === "open";

  return (
    <Link
      href="/activity"
      className={cn(
        "group flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
        open
          ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200"
          : "border-amber-400/25 bg-amber-400/[0.06] text-amber-200",
      )}
      title={
        latest ? `Latest: ${latest.summary} (${relativeTime(latest.createdAt, now)})` : "Live activity stream"
      }
      aria-label={`Live activity: ${LABELS[status]}${latest ? `. Latest event: ${latest.summary}` : ""}`}
    >
      <span className="relative flex size-2">
        {open ? (
          <span
            className={cn(
              "absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60",
              recent ? "animate-ping" : "",
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            open ? "bg-emerald-400" : "animate-pulse bg-amber-400",
          )}
        />
      </span>
      <span>{LABELS[status]}</span>
      <Radio
        aria-hidden
        className={cn("size-3.5 transition-opacity", recent ? "opacity-100" : "opacity-40")}
      />
    </Link>
  );
}

/** One-line ticker of the most recent event (wide screens). */
export function LiveTicker() {
  const { events } = useLiveEvents();
  const now = useNow(15_000);
  const latest = events[0];
  if (!latest) return null;
  return (
    <p
      key={latest.id}
      className="hidden min-w-0 animate-fade-in items-center gap-2 text-xs text-muted xl:flex"
      aria-live="off"
    >
      <span className="font-mono text-[11px] text-subtle">{relativeTime(latest.createdAt, now)}</span>
      <span className="truncate">{latest.summary}</span>
    </p>
  );
}
