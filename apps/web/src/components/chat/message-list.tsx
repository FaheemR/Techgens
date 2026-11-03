"use client";

import Link from "next/link";
import type { AgentDTO, MessageDTO } from "@techgens/core";
import { CircleAlert, SquareTerminal } from "lucide-react";
import { AgentAvatar, CeoAvatar } from "@/components/common/agent-avatar";
import { MarkdownView } from "@/components/common/markdown";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";

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
}: {
  message: MessageDTO;
  chief: AgentDTO | undefined;
  now: number;
}) {
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-xl rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-center text-xs text-muted">
          <MarkdownView content={message.content} compact />
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
            <MarkdownView content={message.content} compact />
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
          <MarkdownView content={message.content} compact />
        </div>
      </div>
    </div>
  );
}

export function StreamingBubble({ stream, chief }: { stream: StreamState; chief: AgentDTO | undefined }) {
  const now = useNow(1_000);
  const name = chief?.name ?? "Chief of Staff";
  return (
    <div className="flex gap-3" aria-live="polite" aria-busy={!stream.error}>
      <AgentAvatar name={name} department={chief?.department ?? "executive"} />
      <div className="min-w-0 max-w-[85%] md:max-w-[80%]">
        <div className="mb-1 flex items-center gap-2 text-[11px] text-subtle">
          <span className="font-medium text-muted">{name}</span>
          {!stream.error ? (
            <span>
              {stream.content ? "typing…" : `thinking · ${Math.round((now - stream.startedAt) / 1000)}s`}
            </span>
          ) : null}
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
          <div className="rounded-2xl rounded-tl-sm border border-border bg-surface-2 px-4 py-3">
            {stream.content ? (
              <div className="relative">
                <MarkdownView content={stream.content} compact />
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-4 w-1.5 animate-blink bg-accent align-[-2px]"
                />
              </div>
            ) : (
              <span className="flex h-5 items-center gap-1" aria-label={`${name} is thinking`}>
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
        )}
      </div>
    </div>
  );
}
