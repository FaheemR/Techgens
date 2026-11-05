"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ApprovalDetailDTO, ApprovalOutcome, ApprovalStatus, ApprovalSummaryDTO } from "@techgens/core";
import { APPROVAL_KINDS, GATE_LABELS } from "@techgens/core";
import { Inbox, PartyPopper, ShieldOff, TriangleAlert } from "lucide-react";
import { QueryView } from "@/components/common/query-view";
import { ApprovalKindBadge, ApprovalStatusBadge } from "@/components/common/status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PageSkeleton, SkeletonRows } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { STAGE_GATE_KINDS, approvalDisplayTitle, approvalOutcomeLabel } from "@/lib/labels";
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

function decisionMessage(
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
  const [recorded, setRecorded] = useState<{
    id: string;
    title: string;
    outcome: ApprovalOutcome;
    message: ReturnType<typeof decisionMessage>;
  } | null>(null);
  const list = useApprovals(FILTERS.find((f) => f.value === filter)?.status);
  const pendingList = useApprovals("pending");
  const settings = useSettings();
  const now = useNow();
  const listRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLHeadingElement>(null);
  const focusAfterDecision = useRef<"detail" | "list" | null>(null);

  const offGates = settings.data ? APPROVAL_KINDS.filter((k) => settings.data.gatePolicy[k] === false) : [];
  const outcome = recorded?.id === selectedId ? recorded : null;
  const next = pendingList.data?.find((approval) => approval.id !== recorded?.id);

  useEffect(() => {
    if (outcome) focusWithFlash(outcomeRef.current);
  }, [outcome]);

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
    queryClient.setQueryData<ApprovalSummaryDTO[]>(qk.approvals("pending"), (current) =>
      current?.filter((a) => a.id !== decided.id),
    );
    setRecorded({
      id: decided.id,
      title: approvalDisplayTitle(decided.kind, decided.title),
      outcome,
      message: decisionMessage(decided, outcome, grantedCredits),
    });
  }

  const empty = filter === "pending" ? null : EMPTY[filter];

  function changeFilter(value: Filter) {
    setRecorded(null);
    set({ status: value === "pending" ? null : value, id: null });
  }

  function returnToQueue() {
    setRecorded(null);
    focusAfterDecision.current = "list";
    set({ status: null, id: null });
  }

  function backToInbox() {
    setRecorded(null);
    focusAfterDecision.current = "list";
    set({ id: null });
  }

  if (!hydrated) return <PageSkeleton />;

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
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
        {!selectedId ? (
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
        ) : null}
      </div>
      {unknownStatus ? (
        <p className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-amber-200">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            Unknown filter “{unknownStatus.slice(0, 40)}” — showing Pending.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4">
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", selectedId && "hidden")}>
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
                          onClick={() => {
                            setRecorded(null);
                            focusAfterDecision.current = "detail";
                            set({ id: approval.id }, "push");
                          }}
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

        {selectedId ? (
          <Card className="min-w-0 overflow-hidden">
            {outcome ? (
              <section aria-label="Decision outcome" className="space-y-6 p-5 sm:p-8">
                <div role="status">
                  <h2
                    ref={outcomeRef}
                    tabIndex={-1}
                    className={cn("rounded-sm text-2xl font-semibold", FOCUS_FLASH_INSET)}
                  >
                    {approvalOutcomeLabel(outcome.outcome)}
                  </h2>
                  <p className="mt-3 break-words text-lg font-medium">{outcome.title}</p>
                  <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-muted">
                    {outcome.message.title}
                  </p>
                  {outcome.message.detail ? (
                    <p className="mt-2 text-base text-muted">{outcome.message.detail}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button size="lg" onClick={returnToQueue}>
                    Return to queue
                  </Button>
                  {next ? (
                    <Button
                      size="lg"
                      variant="primary"
                      onClick={() => {
                        // Keep the outcome mounted until navigation so the old detail cannot consume focus.
                        focusAfterDecision.current = "detail";
                        set({ id: next.id, status: null }, "push");
                      }}
                    >
                      Review next
                    </Button>
                  ) : (
                    <p className="self-center text-sm text-muted">No other pending decisions.</p>
                  )}
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => {
                      focusAfterDecision.current = "detail";
                      setRecorded(null);
                    }}
                  >
                    View recorded decision
                  </Button>
                </div>
              </section>
            ) : (
              <ApprovalDetailPane
                id={selectedId}
                onDecided={onDecided}
                onBack={backToInbox}
                takeFocus={takeFocus}
              />
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
