"use client";

import Link from "next/link";
import type { LiveEvent } from "@techgens/core";
import {
  Activity,
  Ban,
  Bell,
  Bot,
  Building2,
  CircleCheck,
  CircleX,
  CloudUpload,
  Coins,
  FileText,
  Gavel,
  GitPullRequest,
  Hourglass,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  OctagonAlert,
  Pause,
  Play,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { eventString } from "@/lib/events";
import { relativeTime, formatDateTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { TONE_BADGE, type Tone } from "@/lib/labels";
import { useOrg } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function eventMeta(type: string): { icon: LucideIcon; tone: Tone } {
  switch (type) {
    case "job.queued":
    case "job.started":
      return { icon: Play, tone: "accent" };
    case "job.completed":
      return { icon: CircleCheck, tone: "success" };
    case "job.failed":
      return { icon: CircleX, tone: "danger" };
    case "job.waiting":
      return { icon: Hourglass, tone: "warning" };
    case "job.cancelled":
      return { icon: Ban, tone: "neutral" };
    case "agent.message":
      return { icon: MessageSquare, tone: "violet" };
    case "agent.tool_call":
      return { icon: Wrench, tone: "neutral" };
    case "agent.updated":
      return { icon: Bot, tone: "info" };
    case "approval.requested":
      return { icon: ShieldAlert, tone: "warning" };
    case "approval.decided":
      return { icon: ShieldCheck, tone: "success" };
    case "document.written":
      return { icon: FileText, tone: "info" };
    case "decision.recorded":
      return { icon: Gavel, tone: "violet" };
    case "budget.warning":
      return { icon: TriangleAlert, tone: "warning" };
    case "budget.exceeded":
      return { icon: OctagonAlert, tone: "danger" };
    case "usage.recorded":
      return { icon: Coins, tone: "neutral" };
    case "deployment.updated":
      return { icon: CloudUpload, tone: "accent" };
    case "incident.opened":
      return { icon: Siren, tone: "danger" };
    case "notification.created":
      return { icon: Bell, tone: "info" };
    case "system.paused":
      return { icon: Pause, tone: "warning" };
    case "system.resumed":
      return { icon: Play, tone: "success" };
    case "chat.message":
      return { icon: MessagesSquare, tone: "violet" };
    case "company.updated":
      return { icon: Building2, tone: "info" };
    default:
      if (type.startsWith("initiative.") || type === "directive.received")
        return { icon: Rocket, tone: "accent" };
      if (type.startsWith("work_item.")) return { icon: ListChecks, tone: "info" };
      if (type.startsWith("github.")) return { icon: GitPullRequest, tone: "neutral" };
      return { icon: Activity, tone: "neutral" };
  }
}

/** Deep link for an event's subject, when the Command Center has a page for it. */
export function eventHref(event: LiveEvent): string | null {
  const id = event.subjectId;
  switch (event.subjectType) {
    case "initiative":
      return id ? `/initiatives/${id}` : null;
    case "approval":
      return id ? `/approvals?id=${id}` : "/approvals";
    case "job":
      return id ? `/activity/jobs/${id}` : null;
    case "document":
      return id ? `/documents/${id}` : null;
    case "work_item":
      return id ? `/work?item=${id}` : "/work";
    case "agent":
      return id ? `/org?agent=${id}` : "/org";
    case "thread":
    case "chat":
      return id ? `/chat?thread=${id}` : "/chat";
    case "incident":
    case "deployment":
    case "routine":
      return "/operations";
    case "budget":
      return "/budget";
    case "company":
      return "/strategy";
    default:
      break;
  }
  const threadId = eventString(event, "threadId");
  if (threadId) return `/chat?thread=${threadId}`;
  const jobId = eventString(event, "jobId");
  if (jobId) return `/activity/jobs/${jobId}`;
  const initiativeId = eventString(event, "initiativeId");
  if (initiativeId) return `/initiatives/${initiativeId}`;
  return null;
}

export function ActivityFeed({
  events,
  className,
  emptyTitle = "No activity yet",
  emptyDescription = "Agent activity streams in here live as your company works.",
  dense = false,
}: {
  events: readonly LiveEvent[];
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  dense?: boolean;
}) {
  const now = useNow(30_000);
  const org = useOrg();
  const agentNames = new Map((org.data?.agents ?? []).map((a) => [a.id, a.name]));

  if (events.length === 0) {
    return <EmptyState compact icon={Activity} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ol className={cn("divide-y divide-border/60", className)} aria-label="Activity feed">
      {events.map((event) => {
        const { icon: Icon, tone } = eventMeta(event.type);
        const href = eventHref(event);
        const actor =
          event.actorType === "ceo"
            ? "CEO"
            : event.actorType === "agent"
              ? (agentNames.get(event.actorId ?? "") ?? eventString(event, "agentName") ?? "Agent")
              : "System";
        const fresh = now - Date.parse(event.createdAt) < 8_000;
        const body = (
          <div className={cn("flex items-start gap-3", dense ? "px-3 py-2" : "px-4 py-2.5")}>
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border",
                TONE_BADGE[tone],
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm text-fg">{event.summary || event.type}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                <span className="text-muted">{actor}</span>
                <span aria-hidden>·</span>
                <span className="font-mono text-[11px]">{event.type}</span>
                <span aria-hidden>·</span>
                <time dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>
                  {relativeTime(event.createdAt, now)}
                </time>
              </p>
            </div>
          </div>
        );
        return (
          <li key={event.id} className={cn(fresh && "animate-flash")}>
            {href ? (
              <Link
                href={href}
                className="block transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04]"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
