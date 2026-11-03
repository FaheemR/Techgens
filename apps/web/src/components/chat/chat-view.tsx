"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { MessageDTO, ThreadDTO } from "@techgens/core";
import { Lightbulb, MessageSquarePlus, MessagesSquare, Sparkles } from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { QueryView } from "@/components/common/query-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { eventJobId, eventString, useLiveEventListener } from "@/lib/events";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { qk, useMessages, useOrg, useThreads } from "@/lib/queries";
import { cn, sortByDateDesc } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageBubble, StreamingBubble, type StreamState } from "./message-list";

const STARTER_PROMPTS = [
  "Build InvoiceLite: invoicing SaaS for freelancers, MVP in 6 weeks, budget 400 credits/week",
  "Give me a status report on all active initiatives: progress, risks and spend this week",
  "Research the market for an AI meeting-notes app for small teams and recommend whether we should build it",
  "Draft our engineering standards and security policies for the company constitution",
];

function deriveTitle(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "New directive";
  return firstLine.length > 64 ? `${firstLine.slice(0, 63)}…` : firstLine;
}

export function ChatView() {
  const { get, set } = useQueryParams();
  const threadId = get("thread");
  const queryClient = useQueryClient();
  const toast = useToast();
  const threads = useThreads();
  const messages = useMessages(threadId);
  const org = useOrg();
  const chief = org.data?.agents.find((a) => a.roleId === "chief-of-staff");
  const now = useNow();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const [draft, setDraft] = useState("");
  const [stream, setStreamState] = useState<StreamState | null>(null);
  const streamRef = useRef<StreamState | null>(null);
  const setStream = useCallback(
    (next: StreamState | null | ((current: StreamState | null) => StreamState | null)) => {
      const value = typeof next === "function" ? next(streamRef.current) : next;
      streamRef.current = value;
      setStreamState(value);
    },
    [],
  );

  const finishStream = useCallback(
    (target: StreamState) => {
      void queryClient.invalidateQueries({ queryKey: qk.messages(target.threadId) }).then(() => {
        setStream((current) =>
          current && current.threadId === target.threadId && !current.error ? null : current,
        );
      });
      void queryClient.invalidateQueries({ queryKey: qk.threads });
    },
    [queryClient, setStream],
  );

  useLiveEventListener((event) => {
    const current = streamRef.current;
    if (!current) return;
    const eventThread = eventString(event, "threadId");
    const eventJob = eventJobId(event);
    const sameThread = eventThread !== undefined && eventThread === current.threadId;
    const sameJob = current.jobId !== null && eventJob === current.jobId;

    if (event.type === "agent.message_delta" && (sameThread || sameJob)) {
      const delta = typeof event.data.content === "string" ? event.data.content : "";
      if (delta) setStream({ ...current, content: current.content + delta });
      return;
    }
    if (event.type === "chat.message" && sameThread) {
      const messageId = eventString(event, "messageId");
      const authorType = eventString(event, "authorType");
      const fromAgent = event.actorType === "agent" || authorType === "agent";
      const notMine =
        current.ceoMessageId !== null && messageId !== current.ceoMessageId && authorType !== "ceo";
      if (fromAgent || notMine) finishStream(current);
      return;
    }
    if (sameJob && (event.type === "job.failed" || event.type === "job.cancelled")) {
      setStream({
        ...current,
        error:
          event.type === "job.cancelled"
            ? "The reply was cancelled."
            : `The Chief of Staff couldn't finish this reply${event.summary ? `: ${event.summary}` : "."}`,
      });
      return;
    }
    if (sameJob && event.type === "job.completed") {
      // Fallback in case the chat.message event was missed.
      window.setTimeout(() => {
        if (streamRef.current === current || streamRef.current?.jobId === current.jobId)
          finishStream(current);
      }, 1_500);
    }
  });

  const messageList = messages.data;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messageList, stream?.content, stream?.error, threadId]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [threadId]);

  async function send(content: string) {
    let id = threadId;
    const optimistic: MessageDTO = {
      id: `pending-${Date.now()}`,
      threadId: id ?? "",
      authorType: "ceo",
      authorName: "CEO",
      content,
      createdAt: new Date().toISOString(),
    };
    try {
      if (!id) {
        const thread = await api.post<ThreadDTO>("/api/chat/threads", { title: deriveTitle(content) });
        id = thread.id;
        queryClient.setQueryData<ThreadDTO[]>(qk.threads, (list) => [
          thread,
          ...(list ?? []).filter((t) => t.id !== thread.id),
        ]);
        queryClient.setQueryData<MessageDTO[]>(qk.messages(id), []);
        set({ thread: id });
      }
      const target = id;
      queryClient.setQueryData<MessageDTO[]>(qk.messages(target), (list) => [
        ...(list ?? []),
        { ...optimistic, threadId: target },
      ]);
      stickToBottom.current = true;
      setStream({
        threadId: target,
        jobId: null,
        ceoMessageId: null,
        content: "",
        error: null,
        startedAt: Date.now(),
      });

      const res = await api.post<{ message: MessageDTO; jobId: string }>(
        `/api/chat/threads/${target}/messages`,
        { content },
      );
      queryClient.setQueryData<MessageDTO[]>(qk.messages(target), (list) =>
        (list ?? []).map((m) => (m.id === optimistic.id ? res.message : m)),
      );
      setStream((current) =>
        current && current.threadId === target
          ? { ...current, jobId: res.jobId, ceoMessageId: res.message.id }
          : current,
      );
    } catch (error) {
      if (id) {
        queryClient.setQueryData<MessageDTO[]>(qk.messages(id), (list) =>
          (list ?? []).filter((m) => m.id !== optimistic.id),
        );
      }
      setStream(null);
      toast.error("Directive not sent", errorMessage(error));
      throw error;
    }
  }

  function newDirective() {
    set({ thread: null });
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function applyPrompt(prompt: string) {
    setDraft(prompt);
    textareaRef.current?.focus();
  }

  const threadList = sortByDateDesc(threads.data ?? [], (t) => t.updatedAt);
  const activeThread = threadList.find((t) => t.id === threadId);
  const visibleStream = stream && stream.threadId === threadId ? stream : null;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] gap-4">
      <Card className="hidden w-72 shrink-0 flex-col overflow-hidden lg:flex">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h1 className="px-1 text-sm font-semibold">Directives</h1>
          <Button size="xs" variant="primary" onClick={newDirective}>
            <MessageSquarePlus />
            New
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <QueryView
            query={threads}
            compactError
            loading={<SkeletonRows rows={5} className="p-2" />}
            isEmpty={(list) => list.length === 0}
            empty={
              <EmptyState
                compact
                icon={MessagesSquare}
                title="No conversations yet"
                description="Your directives to the Chief of Staff will be listed here."
              />
            }
          >
            {() => (
              <ul className="space-y-0.5" aria-label="Conversation threads">
                {threadList.map((thread) => {
                  const active = thread.id === threadId;
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        onClick={() => set({ thread: thread.id })}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left transition-colors",
                          active ? "bg-accent/10 ring-1 ring-accent/30" : "hover:bg-white/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "line-clamp-2 text-sm",
                            active ? "font-medium text-fg" : "text-muted",
                          )}
                        >
                          {thread.title || "Untitled directive"}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-subtle">
                          {relativeTime(thread.updatedAt, now)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryView>
        </div>
      </Card>

      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <AgentAvatar name={chief?.name ?? "Chief of Staff"} department="executive" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{activeThread?.title ?? "New directive"}</h2>
            <p className="truncate text-xs text-muted">
              {chief ? `${chief.name} · Chief of Staff` : "Chief of Staff"} — turns your directives into
              initiatives, charters and roadmaps
            </p>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <label htmlFor="thread-select" className="sr-only">
              Conversation
            </label>
            <Select
              id="thread-select"
              className="w-44"
              value={threadId ?? ""}
              onChange={(event) => set({ thread: event.target.value || null })}
            >
              <option value="">New directive</option>
              {threadList.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title || "Untitled directive"}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          aria-label="Conversation"
          role="log"
        >
          {!threadId ? (
            <Welcome onPick={applyPrompt} chiefName={chief?.name} />
          ) : (
            <QueryView query={messages} loading={<SkeletonRows rows={3} />}>
              {(list) =>
                list.length === 0 && !visibleStream ? (
                  <Welcome onPick={applyPrompt} chiefName={chief?.name} />
                ) : (
                  <div className="mx-auto max-w-3xl space-y-5">
                    {list.map((message) => (
                      <MessageBubble key={message.id} message={message} chief={chief} now={now} />
                    ))}
                    {visibleStream ? <StreamingBubble stream={visibleStream} chief={chief} /> : null}
                  </div>
                )
              }
            </QueryView>
          )}
        </div>

        <Composer
          value={draft}
          onValueChange={setDraft}
          onSend={send}
          textareaRef={textareaRef}
          busy={Boolean(visibleStream && !visibleStream.error)}
        />
      </Card>
    </div>
  );
}

function Welcome({ onPick, chiefName }: { onPick: (prompt: string) => void; chiefName: string | undefined }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
        <Sparkles aria-hidden className="size-6 text-accent" />
      </div>
      <h2 className="text-lg font-semibold">What should the company build next?</h2>
      <p className="mt-1.5 max-w-lg text-sm text-muted">
        Describe the outcome, deadline and budget. {chiefName ?? "Your Chief of Staff"} will clarify, create
        an initiative with a charter and roadmap, and ask for your approval before work starts.
      </p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="group flex items-start gap-2.5 rounded-xl border border-border bg-surface-2/60 p-3 text-left text-sm text-muted transition-colors hover:border-accent/40 hover:bg-accent/[0.05] hover:text-fg"
          >
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle group-hover:text-accent" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-xs text-subtle">
        Prefer a form?{" "}
        <Link href="/initiatives?new=1" className="text-accent hover:underline">
          Create an initiative directly
        </Link>
        .
      </p>
    </div>
  );
}
