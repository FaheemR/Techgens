"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileQuestion, RefreshCw, ServerCrash, TriangleAlert } from "lucide-react";
import { API_URL, ApiError, errorMessage, isUnreachable } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

/** Detail routes and where to send the CEO when their subject doesn't exist. */
const SECTIONS: ReadonlyArray<{ pattern: RegExp; noun: string; href: string; back: string }> = [
  { pattern: /^\/initiatives\/[^/]+/, noun: "initiative", href: "/initiatives", back: "Back to initiatives" },
  { pattern: /^\/documents\/[^/]+/, noun: "document", href: "/documents", back: "Back to documents" },
  { pattern: /^\/activity\/jobs\/[^/]+/, noun: "job", href: "/activity", back: "Back to activity" },
  { pattern: /^\/approvals/, noun: "approval", href: "/approvals", back: "Back to approvals" },
  { pattern: /^\/work/, noun: "work item", href: "/work", back: "Back to the work board" },
  { pattern: /^\/org/, noun: "agent", href: "/org", back: "Back to the org chart" },
];

interface NotFound {
  noun: string;
  invalidId: boolean;
  href: string;
  back: string;
}

/**
 * 404s and malformed ids (400 "id: Invalid UUID") mean the subject doesn't exist — retrying can't help. The noun comes
 * from the API message ("initiative not found", "work item <id> not found") or else from the route.
 */
function notFoundInfo(error: unknown, pathname: string): NotFound | null {
  if (!(error instanceof ApiError)) return null;
  const invalidId = error.status === 400 && /invalid uuid|invalid id/i.test(error.message);
  if (error.status !== 404 && !invalidId) return null;
  const section = SECTIONS.find((s) => s.pattern.test(pathname));
  const fromMessage = /^([a-z][a-z ]*?)\s+(?:[\w-]+\s+)?not found$/i.exec(error.message.trim())?.[1];
  return {
    noun: fromMessage?.toLowerCase() ?? section?.noun ?? "item",
    invalidId,
    href: section?.href ?? "/",
    back: section?.back ?? "Back to the dashboard",
  };
}

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
  const pathname = usePathname() ?? "/";
  const notFound = notFoundInfo(error, pathname);
  if (notFound) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-border bg-surface/90 text-center",
          compact ? "px-4 py-6" : "px-6 py-12",
          className,
        )}
      >
        <FileQuestion aria-hidden className="mb-3 size-6 text-subtle" />
        <p className="text-sm font-semibold text-fg">
          This {notFound.noun} doesn&apos;t exist or was removed.
        </p>
        <p className="mt-1 max-w-lg text-sm text-muted">
          {notFound.invalidId
            ? `The link doesn't contain a valid ${notFound.noun} ID — it may have been cut off or mistyped.`
            : `It may have been deleted, or the link you followed is out of date.`}
        </p>
        <Link
          href={notFound.href}
          className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}
        >
          {notFound.back}
        </Link>
      </div>
    );
  }

  const offline = isUnreachable(error);
  // A client error (4xx) fails the same way again; only network and server failures are worth retrying.
  const retryable = !(error instanceof ApiError) || offline || error.status >= 500;
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
      {onRetry && retryable ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
