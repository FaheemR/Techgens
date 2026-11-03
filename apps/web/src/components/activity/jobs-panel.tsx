"use client";

import { useRouter } from "next/navigation";
import type { JobDTO, JobStatus } from "@techgens/core";
import { JOB_STATUSES } from "@techgens/core";
import { Ban, RotateCcw, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { QueryView } from "@/components/common/query-view";
import { JobStatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { credits, formatDateTime, formatDuration, humanize, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useApiMutation } from "@/lib/mutations";
import { useJobs, useOrg } from "@/lib/queries";

const ACTIVE: readonly JobStatus[] = ["queued", "running", "waiting"];

export function useJobAction() {
  return useApiMutation(
    ({ id, action }: { id: string; action: "cancel" | "retry" }) =>
      api.post<JobDTO>(`/api/jobs/${id}/${action}`),
    {
      success: (_r, v) => (v.action === "cancel" ? "Job cancelled" : "Job queued for retry"),
      errorTitle: "Couldn't update the job",
      invalidate: [["jobs"], ["org"], ["dashboard"]],
    },
  );
}

export function JobsPanel({
  status,
  agentId,
  onChange,
}: {
  status: string;
  agentId: string;
  onChange: (updates: { jobStatus?: string | null; jobAgent?: string | null }) => void;
}) {
  const router = useRouter();
  const org = useOrg();
  const jobs = useJobs({ status: status || undefined, agentId: agentId || undefined, limit: 100 });
  const action = useJobAction();
  const now = useNow(10_000);

  return (
    <>
      <CardHeader
        title="Jobs"
        description="Every unit of agent work, with status, duration and spend"
        icon={SquareTerminal}
        action={
          <div className="flex gap-2">
            <label htmlFor="job-status" className="sr-only">
              Job status
            </label>
            <Select
              id="job-status"
              className="w-36"
              value={status}
              onChange={(e) => onChange({ jobStatus: e.target.value || null })}
            >
              <option value="">All statuses</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
            <label htmlFor="job-agent" className="sr-only">
              Agent
            </label>
            <Select
              id="job-agent"
              className="w-44"
              value={agentId}
              onChange={(e) => onChange({ jobAgent: e.target.value || null })}
            >
              <option value="">All agents</option>
              {[...(org.data?.agents ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </div>
        }
      />
      <QueryView query={jobs} loading={<SkeletonRows rows={6} className="p-4" />} compactError>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              compact
              icon={SquareTerminal}
              title="No jobs"
              description="No agent jobs match these filters yet."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Status</TH>
                  <TH>Agent</TH>
                  <TH>Task</TH>
                  <TH className="text-right">Duration</TH>
                  <TH className="text-right">Credits</TH>
                  <TH className="text-right">Started</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {list.map((job) => (
                  <TR
                    key={job.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/activity/jobs/${job.id}`)}
                  >
                    <TD>
                      <JobStatusBadge status={job.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{job.agentName}</TD>
                    <TD className="max-w-[22rem]">
                      <Link
                        href={`/activity/jobs/${job.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate hover:text-accent"
                        title={job.workItemTitle ?? job.prompt}
                      >
                        {job.workItemTitle ?? job.prompt.split("\n")[0]}
                      </Link>
                      <span className="text-xs text-subtle">
                        {job.kind}
                        {job.depth > 0 ? ` · depth ${job.depth}` : ""}
                        {job.waitReason ? ` · waiting on ${job.waitReason}` : ""}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-right tabular-nums text-muted">
                      {job.startedAt ? formatDuration(job.startedAt, job.finishedAt ?? now) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{credits(job.spentCredits)}</TD>
                    <TD
                      className="whitespace-nowrap text-right text-xs text-subtle"
                      title={formatDateTime(job.startedAt ?? job.createdAt)}
                    >
                      {relativeTime(job.startedAt ?? job.createdAt, now)}
                    </TD>
                    <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                      {ACTIVE.includes(job.status) ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Cancel job: ${job.workItemTitle ?? job.prompt.split("\n")[0]}`}
                          title="Cancel"
                          onClick={() => action.mutate({ id: job.id, action: "cancel" })}
                        >
                          <Ban />
                        </Button>
                      ) : job.status === "failed" || job.status === "cancelled" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Retry job: ${job.workItemTitle ?? job.prompt.split("\n")[0]}`}
                          title="Retry"
                          onClick={() => action.mutate({ id: job.id, action: "retry" })}
                        >
                          <RotateCcw />
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )
        }
      </QueryView>
    </>
  );
}
