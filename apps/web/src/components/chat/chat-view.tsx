"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentDTO, MessageDTO, ThreadDTO } from "@techgens/core";
import { Lightbulb, MessageSquarePlus, MessagesSquare, Sparkles } from "lucide-react";
import { overrunScopeLabel } from "@/components/approvals/budget-grant";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { QueryView } from "@/components/common/query-view";
import { usePauseMutation } from "@/components/layout/pause-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { eventJobId, eventString, useLiveEventListener } from "@/lib/events";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { approvalHeadline } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import {
  qk,
  useApproval,
  useJobDetail,
  useInitiatives,
  useMessages,
  useOrg,
  useSystem,
  useThreads,
  type JobDetail,
} from "@/lib/queries";
import { cn, sortByDateDesc } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageBubble, StreamingBubble, type ReplyBlocker, type StreamState } from "./message-list";

const STARTER_PROMPTS = [
  "Build InvoiceLite: invoicing SaaS for freelancers, MVP in 6 weeks, budget 400 credits/week",
  "Give me a status report on all active initiatives: progress, risks and spend this week",
  "Research the market for an AI meeting-notes app for small teams and recommend whether we should build it",
  "Draft our engineering standards and security policies for the company constitution",
];

/** A reply blocker before the blocking approval's title is known. */
type BlockerFacts =
  | Exclude<ReplyBlocker, { kind: "approval" }>
  | { kind: "approval"; approvalId: string | null; budget: boolean };

/**
 * What the reply is blocked on, from the global kill switch, the Chief of Staff's own status and the reply job
 * (a budget overrun or gate leaves it `waiting` with waitReason "approval"; its `job.waiting` event names the approval).
 */
function replyBlocker(
  job: JobDetail | undefined,
  paused: boolean,
  chief: AgentDTO | undefined,
): BlockerFacts | null {
  if (paused) return { kind: "paused" };
  if (job && (job.status === "queued" || job.status === "waiting") && chief?.status === "paused") {
    return { kind: "agent-paused", agentName: chief.name };
  }
  if (job?.status !== "waiting" || (job.waitReason !== "approval" && job.waitReason !== "budget"))
    return null;
  const waiting = [...(job.events ?? [])].reverse().find((event) => event.type === "job.waiting");
  const approvalId = waiting && typeof waiting.data.approvalId === "string" ? waiting.data.approvalId : null;
  const budget = job.waitReason === "budget" || /budget/i.test(waiting?.summary ?? "");
  return { kind: "approval", approvalId, budget };
}

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
  const initiatives = useInitiatives();
  const chiefs = org.data?.agents.filter((a) => a.roleId === "chief-of-staff");
  const chief = chiefs?.find((a) => a.status === "active") ?? chiefs?.find((a) => a.status === "paused");
  const now = useNow();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const updateThread = useApiMutation(
    (input: { id: string; title?: string; archived?: boolean }) => {
      const { id, ...body } = input;
      return api.patch<ThreadDTO>(`/api/chat/threads/${id}`, body);
    },
    {
      success: (_thread, input) =>
        input.title !== undefined
          ? "Conversation renamed"
          : input.archived
            ? "Conversation archived — work continues unchanged"
            : "Conversation restored",
      errorTitle: "Couldn't update the conversation",
      invalidate: [qk.threads],
      onSuccess: (_thread, input) => {
        setRenameOpen(false);
        setArchiveOpen(false);
        if (input.archived) set({ thread: null });
      },
    },
  );
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

  const allThreads = sortByDateDesc(threads.data ?? [], (t) => t.updatedAt);
  const threadList = allThreads.filter(
    (t) => t.archived === showArchived && t.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const activeThread = allThreads.find((t) => t.id === threadId);
  const entityLinks = (initiatives.data ?? [])
    .filter(
      (initiative, _index, list) => list.filter((other) => other.title === initiative.title).length === 1,
    )
    .map((initiative) => ({ label: initiative.title, href: `/initiatives/${initiative.id}` }));
  const visibleStream = stream && stream.threadId === threadId ? stream : null;

  const system = useSystem();
  const paused = Boolean(system.data?.paused);
  const resume = usePauseMutation();
  const replyJob = useJobDetail(visibleStream && !visibleStream.error ? visibleStream.jobId : null);
  const replyingChief = chiefs?.find((a) => a.id === replyJob.data?.agentId) ?? chief;
  const facts =
    visibleStream && !visibleStream.error ? replyBlocker(replyJob.data, paused, replyingChief) : null;
  const blockingApproval = useApproval(facts?.kind === "approval" ? facts.approvalId : null);
  const blocker: ReplyBlocker | null =
    facts?.kind === "approval"
      ? {
          ...facts,
          title: blockingApproval.data
            ? blockingApproval.data.kind === "budget_overrun"
              ? `Budget overrun · ${overrunScopeLabel(blockingApproval.data) ?? blockingApproval.data.title}`
              : approvalHeadline(blockingApproval.data.kind, blockingApproval.data.title)
            : null,
        }
      : facts;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="thread-search" className="sr-only">
          Search conversations
        </label>
        <Input
          id="thread-search"
          type="search"
          className="min-w-0 flex-1"
          placeholder="Search conversation titles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="sm" variant="secondary" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Show active" : "Show archived"}
        </Button>
        <Button size="sm" onClick={newDirective}>
          <MessageSquarePlus />
          New directive
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
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
                  {!threadList.length ? (
                    <li className="p-3 text-sm text-muted">
                      No matching {showArchived ? "archived" : "active"} conversations.
                    </li>
                  ) : null}
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
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <AgentAvatar name={chief?.name ?? "Chief of Staff"} department="executive" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{activeThread?.title ?? "New directive"}</h2>
              <p className="truncate text-xs text-muted">
                {chief ? `${chief.name} · Chief of Staff` : "Chief of Staff"} — turns your directives into
                initiatives, charters and roadmaps
              </p>
            </div>
            {activeThread ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={updateThread.isPending}
                  onClick={() => {
                    setTitle(activeThread.title);
                    setRenameOpen(true);
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={updateThread.isPending}
                  onClick={() =>
                    activeThread.archived
                      ? updateThread.mutate({ id: activeThread.id, archived: false })
                      : setArchiveOpen(true)
                  }
                >
                  {activeThread.archived ? "Restore" : "Archive..."}
                </Button>
              </div>
            ) : null}
            <div className="flex items-center gap-2 lg:hidden">
              <label htmlFor="thread-select" className="sr-only">
                Conversation
              </label>
              <Select
                id="thread-select"
                className="w-44 max-w-full"
                value={threadId ?? ""}
                onChange={(event) => set({ thread: event.target.value || null })}
              >
                <option value="">New directive</option>
                {activeThread && !threadList.some((thread) => thread.id === activeThread.id) ? (
                  <option value={activeThread.id}>{activeThread.title}</option>
                ) : null}
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
                        <MessageBubble
                          key={message.id}
                          message={message}
                          chief={chief}
                          now={now}
                          entityLinks={entityLinks}
                        />
                      ))}
                      {visibleStream ? (
                        <StreamingBubble
                          stream={visibleStream}
                          chief={replyingChief}
                          blocker={blocker}
                          onResume={() => resume.mutate(false)}
                          resuming={resume.isPending}
                          entityLinks={entityLinks}
                        />
                      ) : null}
                    </div>
                  )
                }
              </QueryView>
            )}
          </div>

          {activeThread?.archived ? (
            <p className="border-t border-border p-4 text-sm text-muted">
              Archived conversation. Restore it to send another directive. Archiving does not cancel jobs or
              initiatives.
            </p>
          ) : (
            <Composer
              value={draft}
              onValueChange={setDraft}
              onSend={send}
              textareaRef={textareaRef}
              busy={Boolean(visibleStream && !visibleStream.error)}
              paused={paused}
              waitingOnCeo={blocker?.kind === "approval"}
            />
          )}
        </Card>
      </div>
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename conversation" size="sm">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (activeThread && title.trim())
              updateThread.mutate({ id: activeThread.id, title: title.trim() });
          }}
        >
          <Field label="Title" htmlFor="thread-title" required>
            <Input
              id="thread-title"
              data-autofocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
            />
          </Field>
          <Button type="submit" variant="primary" loading={updateThread.isPending} disabled={!title.trim()}>
            Save title
          </Button>
        </form>
      </Dialog>
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive conversation?"
        description="Hides this conversation from the active list. Messages are retained and can be restored. Running replies and initiatives are not stopped."
        confirmLabel="Archive conversation"
        cancelLabel="Keep active"
        tone="primary"
        loading={updateThread.isPending}
        onConfirm={() => activeThread && updateThread.mutate({ id: activeThread.id, archived: true })}
      />
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
