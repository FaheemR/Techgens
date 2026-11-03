"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { JobDTO, Priority, WorkItemDTO, WorkItemStatus } from "@techgens/core";
import { PRIORITIES, WORK_ITEM_STATUSES } from "@techgens/core";
import { Bot, ListTree, SquareTerminal } from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { QueryView } from "@/components/common/query-view";
import { stageShortTitle } from "@/components/common/stages";
import {
  CodingStatusBadge,
  JobStatusBadge,
  PriorityBadge,
  WorkStatusBadge,
} from "@/components/common/status";
import { Sheet } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { credits, formatDateTime, humanize, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { WORK_STATUS_LABEL } from "@/lib/labels";
import { useApiMutation } from "@/lib/mutations";
import { useWorkItem } from "@/lib/queries";
import { GithubLinks, WorkKindIcon } from "./work-item-bits";

export function WorkItemSheet({
  id,
  onClose,
  onOpenItem,
}: {
  id: string | null;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}) {
  const query = useWorkItem(id);
  const item = query.data;
  const update = useApiMutation(
    (patch: { status?: WorkItemStatus; priority?: Priority }) =>
      api.patch<WorkItemDTO>(`/api/work-items/${id}`, patch),
    {
      success: "Work item updated",
      errorTitle: "Couldn't update the work item",
      invalidate: [["work-items"], ["initiatives"]],
    },
  );

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={item?.title ?? "Work item"}
      description={
        item ? (
          <span className="inline-flex items-center gap-1.5">
            <WorkKindIcon kind={item.kind} /> {humanize(item.kind)}
            {item.stage ? ` · ${stageShortTitle(item.stage)} stage` : ""}
          </span>
        ) : null
      }
      headerExtra={
        item ? (
          <div className="flex flex-wrap items-center gap-2">
            <WorkStatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
            <CodingStatusBadge status={item.codingStatus} />
            <GithubLinks item={item} />
          </div>
        ) : null
      }
    >
      {id ? (
        <QueryView query={query} loading={<LoadingBlock />}>
          {(detail) => (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="wi-status" className="text-xs font-medium text-muted">
                    Status
                  </label>
                  <Select
                    id="wi-status"
                    value={detail.status}
                    disabled={update.isPending}
                    onChange={(event) => update.mutate({ status: event.target.value as WorkItemStatus })}
                  >
                    {WORK_ITEM_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {WORK_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="wi-priority" className="text-xs font-medium text-muted">
                    Priority
                  </label>
                  <Select
                    id="wi-priority"
                    value={detail.priority}
                    disabled={update.isPending}
                    onChange={(event) => update.mutate({ priority: event.target.value as Priority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-surface-2/50 p-3 text-sm">
                <Meta label="Initiative">
                  {detail.initiativeId ? (
                    <Link
                      href={`/initiatives/${detail.initiativeId}`}
                      className="text-accent hover:underline"
                    >
                      Open initiative
                    </Link>
                  ) : (
                    "—"
                  )}
                </Meta>
                <Meta label="Assignee">
                  {detail.assigneeAgentId ? (
                    <Link
                      href={`/org?agent=${detail.assigneeAgentId}`}
                      className="text-accent hover:underline"
                    >
                      {detail.assigneeName ?? "Agent"}
                    </Link>
                  ) : (
                    (detail.assigneeName ?? "Unassigned")
                  )}
                </Meta>
                <Meta label="Executor">
                  {detail.forCodingAgent ? (
                    <span className="inline-flex items-center gap-1 text-cyan-200">
                      <Bot aria-hidden className="size-3.5" /> Copilot coding agent
                    </span>
                  ) : (
                    "Agent session"
                  )}
                </Meta>
                <Meta label="Created">{formatDateTime(detail.createdAt)}</Meta>
                <Meta label="Updated">{formatDateTime(detail.updatedAt)}</Meta>
                <Meta label="Completed">{detail.completedAt ? formatDateTime(detail.completedAt) : "—"}</Meta>
              </dl>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                  Description
                </h3>
                {detail.description.trim() ? (
                  <MarkdownView content={detail.description} compact />
                ) : (
                  <p className="text-sm text-subtle">No description.</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                  <ListTree aria-hidden className="size-3.5" /> Sub-items ({detail.children.length})
                </h3>
                {detail.children.length === 0 ? (
                  <p className="text-sm text-subtle">No sub-items.</p>
                ) : (
                  <ul className="divide-y divide-border/70 rounded-lg border border-border">
                    {detail.children.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          onClick={() => onOpenItem(child.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.03]"
                        >
                          <WorkKindIcon kind={child.kind} />
                          <span className="min-w-0 flex-1 truncate">{child.title}</span>
                          <WorkStatusBadge status={child.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <JobsSection jobs={detail.jobs} />
            </div>
          )}
        </QueryView>
      ) : null}
    </Sheet>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-fg">{children}</dd>
    </div>
  );
}

function JobsSection({ jobs }: { jobs: JobDTO[] }) {
  const now = useNow();
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <SquareTerminal aria-hidden className="size-3.5" /> Agent jobs ({jobs.length})
      </h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-subtle">No jobs have run for this item yet.</p>
      ) : (
        <ul className="divide-y divide-border/70 rounded-lg border border-border">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/activity/jobs/${job.id}`}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]"
              >
                <JobStatusBadge status={job.status} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{job.agentName}</span>
                  <span className="text-muted"> · {job.kind}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">
                  {credits(job.spentCredits)} cr · {relativeTime(job.createdAt, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
