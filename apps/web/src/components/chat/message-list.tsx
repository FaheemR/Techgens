"use client";

import Link from "next/link";
import type { AgentDTO, MessageDTO } from "@techgens/core";
import { ArrowRight, CircleAlert, Hourglass, OctagonPause, Play, SquareTerminal } from "lucide-react";
import { AgentAvatar, CeoAvatar } from "@/components/common/agent-avatar";
import { MarkdownView } from "@/components/common/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { EntityLink } from "@/lib/chat-markdown";

export interface StreamState {
  threadId: string;
  jobId: string | null;
  ceoMessageId: string | null;
  content: string;
  error: string | null;
  startedAt: number;
}

export function MessageBubble({
  message,
  chief,
  now,
  entityLinks = [],
}: {
  message: MessageDTO;
  chief: AgentDTO | undefined;
  now: number;
  entityLinks?: readonly EntityLink[];
}) {
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-xl rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-center text-xs text-muted">
          <MarkdownView content={message.content} compact headingOffset={2} preserveBreaks />
        </div>
      </div>
    );
  }
  if (message.authorType === "ceo") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] md:max-w-[75%]">
          <div className="mb-1 flex items-center justify-end gap-2 text-[11px] text-subtle">
            <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
              {relativeTime(message.createdAt, now)}
            </time>
            <span className="font-medium text-muted">You</span>
          </div>
          <div className="rounded-2xl rounded-tr-sm border border-accent/25 bg-accent/[0.09] px-4 py-2.5">
            <MarkdownView content={message.content} compact headingOffset={2} preserveBreaks />
          </div>
        </div>
        <CeoAvatar />
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <AgentAvatar name={message.authorName ?? chief?.name} department={chief?.department ?? "executive"} />
      <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-subtle">
          <span className="font-medium text-muted">
            {message.authorName ?? chief?.name ?? "Chief of Staff"}
          </span>
          <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {relativeTime(message.createdAt, now)}
          </time>
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-3">
          <MarkdownView
            content={message.content}
            compact
            headingOffset={2}
            preserveBreaks
            entityLinks={entityLinks}
          />
        </div>
      </div>
    </div>
  );
}

/** Why a reply can't progress right now (shown instead of "thinking…"). */
export type ReplyBlocker =
  | { kind: "paused" }
  | { kind: "agent-paused"; agentName: string }
  | { kind: "approval"; approvalId: string | null; title: string | null; budget: boolean };

function BlockerNotice({
  blocker,
  onResume,
  resuming,
}: {
  blocker: ReplyBlocker;
  onResume: () => void;
  resuming: boolean;
}) {
  if (blocker.kind === "paused") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl rounded-tl-sm border border-rose-400/30 bg-rose-500/[0.06] px-4 py-3 text-sm">
        <OctagonPause aria-hidden className="size-4 shrink-0 text-rose-300" />
        <p className="min-w-0 flex-1 text-rose-100">
          Agents are paused — this reply continues when you resume.
        </p>
        <Button variant="success" size="xs" onClick={onResume} loading={resuming}>
          {resuming ? null : <Play />}
          Resume agents
        </Button>
      </div>
    );
  }
  if (blocker.kind === "agent-paused") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl rounded-tl-sm border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm">
        <OctagonPause aria-hidden className="size-4 shrink-0 text-amber-300" />
        <p className="min-w-0 flex-1 text-amber-100">
          {blocker.agentName} is paused — this reply continues when you resume them.
        </p>
        <Link href="/org?view=directory" className={buttonVariants({ variant: "outline", size: "xs" })}>
          Open org chart
        </Link>
      </div>
    );
  }
  const href = blocker.approvalId ? `/approvals?id=${blocker.approvalId}` : "/approvals";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl rounded-tl-sm border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm">
      <Hourglass aria-hidden className="size-4 shrink-0 text-amber-300" />
      <p className="min-w-0 flex-1 text-amber-100">
        {blocker.budget ? "Waiting for your budget decision" : "Waiting for your decision"}
        {blocker.title ? (
          <>
            : <span className="font-medium text-fg">{blocker.title}</span>
          </>
        ) : null}
      </p>
      <Link href={href} className={buttonVariants({ variant: "warning", size: "xs" })}>
        Review
        <span className="sr-only"> {blocker.title ?? "the pending approval"}</span>
        <ArrowRight aria-hidden />
      </Link>
    </div>
  );
}

export function StreamingBubble({
  stream,
  chief,
  blocker = null,
  onResume,
  resuming = false,
  entityLinks = [],
}: {
  stream: StreamState;
  chief: AgentDTO | undefined;
  blocker?: ReplyBlocker | null;
  onResume: () => void;
  resuming?: boolean;
  entityLinks?: readonly EntityLink[];
}) {
  const now = useNow(1_000);
  const name = chief?.name ?? "Chief of Staff";
  const status = stream.error
    ? null
    : blocker
      ? blocker.kind === "approval"
        ? "waiting on you"
        : "paused"
      : stream.content
        ? "typing…"
        : `thinking · ${Math.round((now - stream.startedAt) / 1000)}s`;
  return (
    // No aria-live here: the conversation is a role="log", which already announces new content.
    <div className="flex gap-3">
      <AgentAvatar name={name} department={chief?.department ?? "executive"} />
      <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-subtle">
          <span className="font-medium text-muted">{name}</span>
          {status ? <span>{status}</span> : null}
          {stream.jobId ? (
            <Link
              href={`/activity/jobs/${stream.jobId}`}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <SquareTerminal aria-hidden className="size-3" /> transcript
            </Link>
          ) : null}
        </div>
        {stream.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl rounded-tl-sm border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-100"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-rose-300" />
            <span>{stream.error}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {stream.content || !blocker ? (
              <div
                aria-busy={!blocker}
                className="rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-3"
              >
                {stream.content ? (
                  <div className="relative">
                    <MarkdownView
                      content={stream.content}
                      compact
                      headingOffset={2}
                      preserveBreaks
                      entityLinks={entityLinks}
                    />
                    {!blocker ? (
                      <span
                        aria-hidden
                        className="ml-0.5 inline-block h-4 w-1.5 animate-blink bg-accent align-[-2px]"
                      />
                    ) : null}
                  </div>
                ) : (
                  <span className="flex h-5 items-center gap-1" role="img" aria-label={`${name} is thinking`}>
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="size-1.5 animate-bounce rounded-full bg-accent/80"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            ) : null}
            {blocker ? <BlockerNotice blocker={blocker} onResume={onResume} resuming={resuming} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
