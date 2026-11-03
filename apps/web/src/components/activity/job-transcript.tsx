"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JobDTO, LiveEvent } from "@techgens/core";
import { nanoToCredits } from "@techgens/core";
import {
  ArrowLeft,
  Ban,
  CircleAlert,
  CircleCheck,
  Coins,
  MessageSquare,
  RotateCcw,
  ScrollText,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { eventMeta } from "@/components/common/activity-feed";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { JobStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { eventJobId, eventString, useLiveEventListener } from "@/lib/events";
import { credits, formatDateTime, formatDuration, formatTime, shortId } from "@/lib/format";
import { useDocumentTitle, useNow } from "@/lib/hooks";
import { TONE_BADGE } from "@/lib/labels";
import { useJob } from "@/lib/queries";
import { asNumber, cn, isRecord } from "@/lib/utils";
import { useJobAction } from "./jobs-panel";

export function JobTranscriptView({ id }: { id: string }) {
  const query = useJob(id);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [streamText, setStreamText] = useState("");

  useLiveEventListener((event) => {
    if (eventJobId(event) !== id) return;
    if (event.type === "agent.message_delta") {
      const delta = typeof event.data.content === "string" ? event.data.content : "";
      if (delta) setStreamText((text) => text + delta);
      return;
    }
    if (event.type === "agent.message" || event.type.startsWith("job.")) setStreamText("");
    setLiveEvents((list) => (list.some((e) => e.id === event.id) ? list : [...list, event]));
  });

  return (
    <QueryView query={query} loading={<PageSkeleton />} errorTitle="Couldn't load this job">
      {(job) => (
        <JobTranscript job={job} events={mergeTranscript(job.events, liveEvents)} streamText={streamText} />
      )}
    </QueryView>
  );
}

function mergeTranscript(stored: readonly LiveEvent[], live: readonly LiveEvent[]): LiveEvent[] {
  const byId = new Map<string, LiveEvent>();
  for (const e of [...stored, ...live]) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (diff !== 0 && Number.isFinite(diff)) return diff;
    return Number(a.id) - Number(b.id) || 0;
  });
}

function JobTranscript({
  job,
  events,
  streamText,
}: {
  job: JobDTO;
  events: LiveEvent[];
  streamText: string;
}) {
  const now = useNow(5_000);
  const action = useJobAction();
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = job.status === "queued" || job.status === "running" || job.status === "waiting";
  const title = job.workItemTitle ?? job.prompt.split("\n")[0] ?? `Job ${shortId(job.id)}`;
  useDocumentTitle(`${title} · Activity · Techgens`);
  const visibleEvents = events.filter((e) => e.type !== "agent.message_delta");

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [visibleEvents.length, streamText, follow]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/activity"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Activity
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <JobStatusBadge status={job.status} />
              <Badge>{job.kind}</Badge>
              <span className="font-mono text-xs text-subtle">job {shortId(job.id)}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{title}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <Link
                href={`/org?agent=${job.agentId}`}
                className="inline-flex items-center gap-1.5 hover:text-fg"
              >
                <AgentAvatar name={job.agentName} department={job.department} size="xs" /> {job.agentName}
              </Link>
              {job.initiativeId ? (
                <Link href={`/initiatives/${job.initiativeId}`} className="text-accent hover:underline">
                  Initiative
                </Link>
              ) : null}
              {job.workItemId ? (
                <Link href={`/work?item=${job.workItemId}`} className="text-accent hover:underline">
                  Work item
                </Link>
              ) : null}
              {job.parentJobId ? (
                <Link href={`/activity/jobs/${job.parentJobId}`} className="text-accent hover:underline">
                  Parent job
                </Link>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            {active ? (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                loading={action.isPending}
                onClick={() => action.mutate({ id: job.id, action: "cancel" })}
              >
                <Ban />
                Cancel job
              </Button>
            ) : null}
            {job.status === "failed" || job.status === "cancelled" ? (
              <Button
                variant="secondary"
                size="sm"
                loading={action.isPending}
                onClick={() => action.mutate({ id: job.id, action: "retry" })}
              >
                <RotateCcw />
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Created" value={formatDateTime(job.createdAt)} />
        <Stat label="Started" value={job.startedAt ? formatDateTime(job.startedAt) : "—"} />
        <Stat
          label="Finished"
          value={job.finishedAt ? formatDateTime(job.finishedAt) : active ? "In progress" : "—"}
        />
        <Stat
          label="Duration"
          value={job.startedAt ? formatDuration(job.startedAt, job.finishedAt ?? now) : "—"}
        />
        <Stat label="Credits" value={credits(job.spentCredits)} />
        <Stat label="Delegation depth" value={String(job.depth)} />
      </dl>

      {job.waitReason && job.status === "waiting" ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-sm text-amber-100">
          Waiting on <strong>{job.waitReason}</strong>
          {job.waitReason === "approval" ? (
            <>
              {" "}
              —{" "}
              <Link href="/approvals" className="text-accent hover:underline">
                open your approvals inbox
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {job.error ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-sm"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-rose-300" />
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs text-rose-100">
            {job.error}
          </pre>
        </div>
      ) : null}

      {job.resultSummary ? (
        <Card className="border-emerald-400/25">
          <CardHeader title="Result" icon={CircleCheck} />
          <CardContent>
            <MarkdownView content={job.resultSummary} />
          </CardContent>
        </Card>
      ) : null}

      <details className="group rounded-xl border border-border bg-surface/90">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
          <ScrollText aria-hidden className="size-4 text-accent" /> Prompt
          <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs font-normal text-muted group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-border p-4">
          <MarkdownView content={job.prompt} compact />
        </div>
      </details>

      <Card>
        <CardHeader
          title="Transcript"
          description={`${visibleEvents.length} event${visibleEvents.length === 1 ? "" : "s"}${active ? " · live" : ""}`}
          icon={SquareTerminal}
          action={
            <label className="flex items-center gap-2 text-xs text-muted">
              <Switch checked={follow} onCheckedChange={setFollow} label="Follow new events" />
              Follow
            </label>
          }
        />
        <div
          ref={scrollRef}
          className="max-h-[70dvh] overflow-y-auto px-4 py-4"
          onWheel={(event) => {
            if (event.deltaY < 0 && follow) setFollow(false);
          }}
        >
          {visibleEvents.length === 0 && !streamText ? (
            <p className="py-8 text-center text-sm text-subtle">
              {active
                ? "Waiting for the agent to start…"
                : "No transcript events were recorded for this job."}
            </p>
          ) : (
            <ol className="space-y-3" aria-label="Job transcript">
              {visibleEvents.map((event) => (
                <TranscriptEntry
                  key={event.id}
                  event={event}
                  agentName={job.agentName}
                  department={job.department}
                />
              ))}
              {streamText ? (
                <li aria-live="polite" className="flex gap-3">
                  <AgentAvatar name={job.agentName} department={job.department} size="sm" />
                  <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-accent/25 bg-surface-2 px-4 py-3">
                    <MarkdownView content={streamText} compact />
                    <span
                      aria-hidden
                      className="mt-1 inline-block h-4 w-1.5 bg-accent motion-safe:animate-blink"
                    />
                  </div>
                </li>
              ) : null}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/90 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function TranscriptEntry({
  event,
  agentName,
  department,
}: {
  event: LiveEvent;
  agentName: string;
  department: string;
}) {
  const time = (
    <time
      dateTime={event.createdAt}
      className="shrink-0 font-mono text-xs text-subtle"
      title={formatDateTime(event.createdAt)}
    >
      {formatTime(event.createdAt)}
    </time>
  );

  if (event.type === "agent.message") {
    const content = eventString(event, "content", "text", "message") ?? event.summary;
    return (
      <li className="flex gap-3">
        <AgentAvatar name={agentName} department={department} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <MessageSquare aria-hidden className="size-3.5 text-violet-300" />
            <span className="font-medium text-muted">{agentName}</span>
            {time}
          </div>
          <div className="rounded-xl rounded-tl-sm border border-border bg-surface-2 px-4 py-3">
            <MarkdownView content={content} compact />
          </div>
        </div>
      </li>
    );
  }

  if (event.type === "agent.tool_call") {
    const tool = eventString(event, "toolName", "tool", "name") ?? "tool";
    const args = event.data.args ?? event.data.arguments ?? event.data.input;
    const success = event.data.success;
    const result = event.data.result ?? event.data.output;
    return (
      <li className="ml-11">
        <details className="group rounded-lg border border-border bg-[#0a1019]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">
            <Wrench aria-hidden className="size-3.5 text-subtle" />
            <span className="font-mono font-medium text-fg">{tool}</span>
            {success === true ? (
              <Badge tone="success">ok</Badge>
            ) : success === false ? (
              <Badge tone="danger">failed</Badge>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-muted">{event.summary}</span>
            {time}
          </summary>
          {args !== undefined || result !== undefined ? (
            <div className="space-y-2 border-t border-border p-3">
              {args !== undefined ? <JsonBlock label="Arguments" value={args} /> : null}
              {result !== undefined ? <JsonBlock label="Result" value={result} /> : null}
            </div>
          ) : null}
        </details>
      </li>
    );
  }

  if (event.type === "usage.recorded") {
    const value =
      asNumber(event.data.credits) ??
      (asNumber(event.data.nanoAiu) !== undefined
        ? nanoToCredits(asNumber(event.data.nanoAiu) ?? 0)
        : undefined);
    const model = eventString(event, "model");
    const input = asNumber(event.data.inputTokens);
    const output = asNumber(event.data.outputTokens);
    return (
      <li className="ml-11 flex items-center gap-2 text-xs text-subtle">
        <Coins aria-hidden className="size-3.5" />
        <span>
          {value !== undefined
            ? `${value >= 0.005 ? "+" : ""}${credits(value)} credits` // tiny amounts read "< 0.01 credits"
            : event.summary}
          {model ? ` · ${model}` : ""}
          {input !== undefined || output !== undefined
            ? ` · ${input ?? 0} in / ${output ?? 0} out tokens`
            : ""}
        </span>
        <span className="ml-auto">{time}</span>
      </li>
    );
  }

  const { icon: Icon, tone } = eventMeta(event.type);
  return (
    <li className="flex items-center gap-3 py-0.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          TONE_BADGE[tone],
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{event.summary || event.type}</p>
        <p className="font-mono text-xs text-subtle">{event.type}</p>
      </div>
      {time}
    </li>
  );
}

/** Tool arguments arrive as (possibly truncated) JSON strings; pretty-print them when they parse. */
function prettyJson(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = prettyJson(value);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <pre
        className={cn(
          "max-h-72 overflow-auto rounded-md border border-border bg-[#060a10] p-2 font-mono text-[11px] leading-relaxed text-muted",
          !isRecord(value) && "whitespace-pre-wrap",
        )}
      >
        {text}
      </pre>
    </div>
  );
}
