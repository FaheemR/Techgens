"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalStatus, ApprovalSummaryDTO } from "@techgens/core";
import { Inbox, PartyPopper } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonRows } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { qk, useApprovals } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ApprovalDetailPane } from "./approval-detail";

type Filter = "pending" | "changes_requested" | "approved" | "rejected" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export function ApprovalsView() {
  const { get, set } = useQueryParams();
  const filter = (get("status") as Filter | null) ?? "pending";
  const selectedId = get("id");
  const queryClient = useQueryClient();
  const list = useApprovals(filter === "all" ? undefined : filter);
  const pendingList = useApprovals("pending");
  const now = useNow();

  const items = list.data ?? [];
  const firstId = items[0]?.id;

  // On wide screens, open the first item automatically so the inbox reads like a mail client.
  useEffect(() => {
    if (selectedId || !firstId) return;
    if (window.matchMedia("(min-width: 1024px)").matches) set({ id: firstId });
  }, [selectedId, firstId, set]);

  function onDecided(decidedId: string) {
    const pending = (pendingList.data ?? []).filter((a) => a.status === "pending");
    const index = pending.findIndex((a) => a.id === decidedId);
    const remaining = pending.filter((a) => a.id !== decidedId);
    const next = remaining[Math.max(0, index)] ?? remaining[remaining.length - 1];
    queryClient.setQueryData<ApprovalSummaryDTO[]>(qk.approvals("pending"), (current) =>
      current?.filter((a) => a.id !== decidedId),
    );
    set({
      id: next?.id ?? null,
      ...(next && filter !== "pending" && filter !== "all" ? { status: "pending" } : {}),
    });
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
          <p className="mt-1 text-sm text-muted">
            Stage gates, releases, deployments and budget decisions waiting on the CEO.
          </p>
        </div>
        <Segmented
          label="Filter approvals"
          options={FILTERS.map((f) => ({
            ...f,
            count: f.value === "pending" ? pendingList.data?.length : undefined,
          }))}
          value={filter}
          onChange={(value) => set({ status: value === "pending" ? null : value, id: null })}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", selectedId && "hidden lg:flex")}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryView
              query={list}
              loading={<SkeletonRows rows={6} className="p-4" />}
              isEmpty={(data) => data.length === 0}
              empty={
                filter === "pending" ? (
                  <EmptyState
                    icon={PartyPopper}
                    title="Inbox zero"
                    description="No gates are waiting on you. Agents will request approval for specs, architecture, releases and production deploys."
                  />
                ) : (
                  <EmptyState
                    icon={Inbox}
                    title="Nothing here"
                    description={`No ${filter === "all" ? "" : filter.replace("_", " ")} approvals.`}
                  />
                )
              }
            >
              {(data) => (
                <ul aria-label="Approvals" className="divide-y divide-border/70">
                  {data.map((approval) => {
                    const selected = approval.id === selectedId;
                    return (
                      <li key={approval.id}>
                        <button
                          type="button"
                          onClick={() => set({ id: approval.id })}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "relative w-full px-4 py-3 text-left transition-colors",
                            selected ? "bg-accent/[0.08]" : "hover:bg-white/[0.03]",
                          )}
                        >
                          {selected ? (
                            <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
                          ) : null}
                          <div className="flex items-center justify-between gap-2">
                            <ApprovalKindBadge kind={approval.kind} />
                            <span className="text-[11px] text-subtle">
                              {relativeTime(approval.createdAt, now)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-1.5 line-clamp-2 text-sm",
                              selected ? "font-semibold text-fg" : "font-medium text-fg",
                            )}
                          >
                            {approval.title}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted">
                              {approval.initiativeTitle ?? "Company-wide"}
                              {approval.requestedBy ? ` · ${approval.requestedBy}` : ""}
                              {approval.round > 1 ? ` · round ${approval.round}` : ""}
                            </p>
                            {approval.status !== "pending" ? (
                              <ApprovalStatusBadge status={approval.status as ApprovalStatus} />
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </QueryView>
          </div>
        </Card>

        <Card className={cn("min-h-0 overflow-hidden", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <ApprovalDetailPane id={selectedId} onDecided={onDecided} onBack={() => set({ id: null })} />
          ) : (
            <EmptyState
              className="h-full"
              icon={Inbox}
              title="Select an approval"
              description="Review the summary and attached documents, then approve, request changes or reject."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
