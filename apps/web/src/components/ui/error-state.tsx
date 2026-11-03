"use client";

import { RefreshCw, ServerCrash, TriangleAlert } from "lucide-react";
import { API_URL, errorMessage, isUnreachable } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const offline = isUnreachable(error);
  const Icon = offline ? ServerCrash : TriangleAlert;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border text-center",
        offline ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-rose-400/25 bg-rose-400/[0.04]",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mb-3 size-6", offline ? "text-amber-300" : "text-rose-300")} />
      <p className="text-sm font-semibold text-fg">
        {title ?? (offline ? "Orchestrator unreachable" : "Couldn't load this data")}
      </p>
      <p className="mt-1 max-w-lg text-sm text-muted">
        {offline ? (
          <>
            No response from <code className="rounded bg-white/5 px-1 font-mono text-xs">{API_URL}</code>.
            Start it with <code className="rounded bg-white/5 px-1 font-mono text-xs">pnpm dev</code> — this
            view refreshes automatically.
          </>
        ) : (
          errorMessage(error)
        )}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
