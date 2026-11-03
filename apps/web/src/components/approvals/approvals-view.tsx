"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalDetailDTO, ApprovalOutcome, ApprovalSummaryDTO } from "@techgens/core";
import { APPROVAL_KINDS, GATE_LABELS } from "@techgens/core";
import { Inbox, PartyPopper, ShieldOff } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { STAGE_GATE_KINDS, approvalDisplayTitle, approvalHeadline } from "@/lib/labels";
import { qk, useApprovals, useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ApprovalDetailPane } from "./approval-detail";

type Filter = "pending" | "changes_requested" | "approved" | "rejected" | "cancelled" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Withdrawn" },
  { value: "all", label: "All" },
];

const EMPTY: Record<Exclude<Filter, "pending">, { title: string; description: string }> = {
  changes_requested: {
    title: "Nothing in revision",
    description:
      "Nothing is waiting on a revision. Items you send back with “Request changes” stay here until the team resubmits them.",
  },
  approved: {
    title: "Nothing approved yet",
    description: "Gates you approve are kept here with their decision history.",
  },
  rejected: { title: "Nothing rejected", description: "Gates you reject are kept here with your reasons." },
  cancelled: {
    title: "Nothing withdrawn",
    description: "Approvals are withdrawn automatically when their initiative is cancelled.",
  },
  all: {
    title: "No approvals yet",
    description:
      "Agents ask for your approval on charters, specs, architecture, releases, production deploys and budget overruns.",
  },
};

function decisionToast(approval: ApprovalDetailDTO, outcome: ApprovalOutcome): string {
  if (outcome === "approved") {
    return approval.kind === "budget_overrun"
      ? "Credits granted — work resumes"
      : "Approved — the team is moving on";
  }
  if (outcome === "changes_requested") return "Changes requested — the team will revise and resubmit";
  return approval.initiativeId && STAGE_GATE_KINDS.includes(approval.kind)
    ? "Rejected — the team has your reason"
    : "Rejected";
}

export function ApprovalsView() {
  const { get, set } = useQueryParams();
  const filter = (get("status") as Filter | null) ?? "pending";
  const selectedId = get("id");
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useApprovals(filter === "all" ? undefined : filter);
  const pendingList = useApprovals("pending");
  const settings = useSettings();
  const now = useNow();
  const listRef = useRef<HTMLDivElement>(null);
  /** Where focus goes once the inbox has advanced after a decision. */
  const focusAfterDecision = useRef<"detail" | "list" | null>(null);
  /** Filter for which an auto-select navigation is in flight (guards against a second, competing replace). */
  const autoSelecting = useRef<Filter | null>(null);

  const items = list.data ?? [];
  const firstId = items[0]?.id;
  const offGates = settings.data ? APPROVAL_KINDS.filter((k) => settings.data.gatePolicy[k] === false) : [];

  // On wide screens, open the first item automatically so the inbox reads like a mail client. Only once per
  // arrival/filter: a second replace while the first is in flight would swap the item (and the typed comment) away.
  useEffect(() => {
    if (selectedId) {
      autoSelecting.current = null;
      return;
    }
    if (!firstId || list.isPlaceholderData || autoSelecting.current === filter) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    autoSelecting.current = filter;
    set({ id: firstId });
  }, [selectedId, firstId, filter, list.isPlaceholderData, set]);

  useEffect(() => {
    if (selectedId || focusAfterDecision.current !== "list") return;
    focusAfterDecision.current = null;
    listRef.current?.focus();
  }, [selectedId]);

  const takeFocus = useCallback(() => {
    if (focusAfterDecision.current !== "detail") return false;
    focusAfterDecision.current = null;
    return true;
  }, []);

  function onDecided(decided: ApprovalDetailDTO, outcome: ApprovalOutcome) {
    queryClient.setQueryData(qk.approval(decided.id), decided);
    const pending = (pendingList.data ?? []).filter((a) => a.status === "pending");
    const index = pending.findIndex((a) => a.id === decided.id);
    const remaining = pending.filter((a) => a.id !== decided.id);
    const next = remaining[Math.max(0, index)] ?? remaining[remaining.length - 1];
    queryClient.setQueryData<ApprovalSummaryDTO[]>(qk.approvals("pending"), (current) =>
      current?.filter((a) => a.id !== decided.id),
    );
    toast.success(
      decisionToast(decided, outcome),
      next ? `Next: ${approvalHeadline(next.kind, next.title)}` : "Nothing else is waiting on you.",
    );
    focusAfterDecision.current = next ? "detail" : "list";
    set({
      id: next?.id ?? null,
      ...(next && filter !== "pending" && filter !== "all" ? { status: "pending" } : {}),
    });
  }

  const empty = filter === "pending" ? null : EMPTY[filter];

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
            {offGates.length > 0 ? (
              <Link
                href="/settings#approval-gates"
                title={`Auto-approved: ${offGates.map((k) => GATE_LABELS[k]).join(", ")}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-400/15"
              >
                <ShieldOff aria-hidden className="size-3.5" />
                {offGates.length} {offGates.length === 1 ? "gate" : "gates"} off
                <span aria-hidden>→</span>
                Settings
                <span className="sr-only">
                  : {offGates.map((k) => GATE_LABELS[k]).join(", ")} {offGates.length === 1 ? "is" : "are"}{" "}
                  auto-approved
                </span>
              </Link>
            ) : null}
          </div>
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

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", selectedId && "hidden lg:flex")}>
          <div ref={listRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <QueryView
              query={list}
              loading={<SkeletonRows rows={6} className="p-4" />}
              isEmpty={(data) => data.length === 0}
              empty={
                empty ? (
                  <EmptyState icon={Inbox} title={empty.title} description={empty.description} />
                ) : (
                  <EmptyState
                    icon={PartyPopper}
                    title="Inbox zero"
                    description="No gates are waiting on you. Agents will request approval for specs, architecture, releases and production deploys."
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
                            {approvalDisplayTitle(approval.kind, approval.title)}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted">
                              {approval.initiativeTitle ?? "Company-wide"}
                              {approval.requestedBy ? ` · ${approval.requestedBy}` : ""}
                              {approval.round > 1 ? ` · round ${approval.round}` : ""}
                            </p>
                            {approval.status !== "pending" ? (
                              <ApprovalStatusBadge status={approval.status} />
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
            <ApprovalDetailPane
              id={selectedId}
              onDecided={onDecided}
              onBack={() => set({ id: null })}
              takeFocus={takeFocus}
            />
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
