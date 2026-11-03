"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalDetailDTO, ApprovalOutcome, ApprovalStatus, ApprovalSummaryDTO } from "@techgens/core";
import { APPROVAL_KINDS, GATE_LABELS } from "@techgens/core";
import { Inbox, PartyPopper, ShieldOff, TriangleAlert } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PageSkeleton, SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { STAGE_GATE_KINDS, approvalDisplayTitle, approvalHeadline } from "@/lib/labels";
import { qk, useApprovals, useSettings } from "@/lib/queries";
import { asNumber, cn } from "@/lib/utils";
import { ApprovalDetailPane } from "./approval-detail";
import { creditsLabel, formatWindowEnd, overrunScopeLabel, readOverrun } from "./budget-grant";
import { FOCUS_FLASH_INSET, focusWithFlash } from "./focus-flash";

/** URL values of the status filter (`?status=`); "pending" is the default and has no parameter. */
type Filter = "pending" | "in-revision" | "approved" | "rejected" | "withdrawn" | "all";

const FILTERS: Array<{ value: Filter; label: string; status: ApprovalStatus | undefined }> = [
  { value: "pending", label: "Pending", status: "pending" },
  { value: "in-revision", label: "In revision", status: "changes_requested" },
  { value: "approved", label: "Approved", status: "approved" },
  { value: "rejected", label: "Rejected", status: "rejected" },
  { value: "withdrawn", label: "Withdrawn", status: "cancelled" },
  { value: "all", label: "All", status: undefined },
];

/** Other accepted spellings: API statuses and label variants (old links, hand-typed URLs). */
const FILTER_ALIASES: Record<string, Filter> = {
  changes_requested: "in-revision",
  "changes-requested": "in-revision",
  in_revision: "in-revision",
  revision: "in-revision",
  cancelled: "withdrawn",
  canceled: "withdrawn",
};

/** Validates `?status=`: unknown values fall back to Pending (and are reported) instead of reaching the API. */
function parseFilter(raw: string | null): { filter: Filter; unknown: string | null } {
  if (!raw) return { filter: "pending", unknown: null };
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  const match = FILTERS.find((f) => f.value === key)?.value ?? FILTER_ALIASES[key];
  return match ? { filter: match, unknown: null } : { filter: "pending", unknown: raw };
}

const EMPTY: Record<Exclude<Filter, "pending">, { title: string; description: string }> = {
  "in-revision": {
    title: "Nothing in revision",
    description:
      "When you request changes, the item waits here until the team resubmits it — usually within minutes.",
  },
  approved: {
    title: "Nothing approved yet",
    description: "Gates you approve are kept here with their decision history.",
  },
  rejected: { title: "Nothing rejected", description: "Gates you reject are kept here with your reasons." },
  withdrawn: {
    title: "Nothing withdrawn",
    description: "Approvals are withdrawn automatically when their initiative is cancelled.",
  },
  all: {
    title: "No approvals yet",
    description:
      "Agents ask for your approval on charters, specs, architecture, releases, production deploys and budget overruns.",
  },
};

function decisionToast(
  approval: ApprovalDetailDTO,
  outcome: ApprovalOutcome,
  grantedCredits: number | undefined,
): { title: string; detail: string | null } {
  if (outcome === "approved") {
    if (approval.kind !== "budget_overrun")
      return { title: "Approved — the team is moving on", detail: null };
    // Prefer the amount the orchestrator recorded; otherwise the amount that was sent.
    const granted = asNumber(approval.payload?.grantedExtraCredits) ?? grantedCredits;
    const ends = readOverrun(approval.payload ?? {}, approval.summary, undefined).windowEndsAt;
    return {
      title:
        granted !== undefined
          ? `Granted ${creditsLabel(granted)} — work resumes`
          : "Credits granted — work resumes",
      detail: ends ? `Valid until ${formatWindowEnd(ends)}` : null,
    };
  }
  if (outcome === "changes_requested") {
    return { title: "Changes requested — the team will revise and resubmit", detail: null };
  }
  return {
    title:
      approval.initiativeId && STAGE_GATE_KINDS.includes(approval.kind)
        ? "Rejected — the team has your reason"
        : "Rejected",
    detail: null,
  };
}

const subscribeNothing = () => () => {};

/**
 * False during the server render and hydration, true afterwards (and right away on client navigations). The inbox
 * shares the sidebar's pending-approvals query, so hydrating it with that data could differ from the server HTML.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function ApprovalsView() {
  const hydrated = useHydrated();
  const { get, set } = useQueryParams();
  const { filter, unknown: unknownStatus } = parseFilter(get("status"));
  const selectedId = get("id");
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useApprovals(FILTERS.find((f) => f.value === filter)?.status);
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
    focusWithFlash(listRef.current);
  }, [selectedId]);

  const takeFocus = useCallback(() => {
    if (focusAfterDecision.current !== "detail") return false;
    focusAfterDecision.current = null;
    return true;
  }, []);

  function onDecided(decided: ApprovalDetailDTO, outcome: ApprovalOutcome, grantedCredits?: number) {
    queryClient.setQueryData(qk.approval(decided.id), decided);
    const pending = (pendingList.data ?? []).filter((a) => a.status === "pending");
    const index = pending.findIndex((a) => a.id === decided.id);
    const remaining = pending.filter((a) => a.id !== decided.id);
    const next = remaining[Math.max(0, index)] ?? remaining[remaining.length - 1];
    queryClient.setQueryData<ApprovalSummaryDTO[]>(qk.approvals("pending"), (current) =>
      current?.filter((a) => a.id !== decided.id),
    );
    const message = decisionToast(decided, outcome, grantedCredits);
    toast.success(
      message.title,
      [
        message.detail,
        next ? `Next: ${approvalHeadline(next.kind, next.title)}` : "Nothing else is waiting on you.",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    focusAfterDecision.current = next ? "detail" : "list";
    set({
      id: next?.id ?? null,
      ...(next && filter !== "pending" && filter !== "all" ? { status: null } : {}),
    });
  }

  const empty = filter === "pending" ? null : EMPTY[filter];

  function changeFilter(value: Filter) {
    set({ status: value === "pending" ? null : value, id: null });
  }

  if (!hydrated) return <PageSkeleton />;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col">
      <div className="mb-4 flex flex-col gap-3 min-[1366px]:flex-row min-[1366px]:items-end min-[1366px]:justify-between">
        <div className="min-w-0">
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
        <div className="shrink-0">
          <div className="flex items-center gap-2 sm:hidden">
            <label htmlFor="approvals-filter" className="text-sm text-muted">
              Show
            </label>
            <Select
              id="approvals-filter"
              className="min-w-0 flex-1"
              value={filter}
              onChange={(event) => changeFilter(event.target.value as Filter)}
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                  {f.value === "pending" && pendingList.data ? ` (${pendingList.data.length})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <Segmented
            label="Filter approvals"
            className="max-sm:hidden"
            options={FILTERS.map((f) => ({
              value: f.value,
              label: f.label,
              count: f.value === "pending" ? pendingList.data?.length : undefined,
            }))}
            value={filter}
            onChange={changeFilter}
          />
        </div>
      </div>
      {unknownStatus ? (
        <p className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-amber-200">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            Unknown filter “{unknownStatus.slice(0, 40)}” — showing Pending.
          </span>
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", selectedId && "hidden lg:flex")}>
          <div
            ref={listRef}
            tabIndex={-1}
            className={cn("min-h-0 flex-1 overflow-y-auto", FOCUS_FLASH_INSET)}
          >
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
                    const scopeLabel =
                      approval.kind === "budget_overrun" ? overrunScopeLabel(approval) : null;
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
                              {scopeLabel ?? approval.initiativeTitle ?? "Company-wide"}
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
