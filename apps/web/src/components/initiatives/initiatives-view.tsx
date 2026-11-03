"use client";

import { useState } from "react";
import Link from "next/link";
import type { InitiativeStatus, InitiativeSummaryDTO, LifecycleStage } from "@techgens/core";
import { LIFECYCLE_STAGES } from "@techgens/core";
import { CalendarDays, Coins, ListChecks, MessagesSquare, Plus, Rocket, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { StageBar, stageShortTitle } from "@/components/common/stages";
import { InitiativeStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { credits, formatDate, relativeTime } from "@/lib/format";
import { useNow, useQueryParams } from "@/lib/hooks";
import { useInitiatives } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { NewInitiativeDialog } from "./new-initiative-dialog";

type StatusFilter = "all" | InitiativeStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "proposed", label: "Proposed" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function InitiativesView() {
  const { get, set } = useQueryParams();
  const status = (get("status") as StatusFilter | null) ?? "all";
  const stage = (get("stage") as LifecycleStage | null) ?? "";
  const dialogOpen = get("new") === "1";
  const [search, setSearch] = useState("");
  const query = useInitiatives(status === "all" ? undefined : status);

  const filtered = (query.data ?? []).filter((i) => {
    if (stage && i.stage !== stage) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.title, i.summary, i.directive, i.productName ?? ""].some((text) =>
      text.toLowerCase().includes(q),
    );
  });

  return (
    <div>
      <PageHeader
        title="Initiatives"
        description="Every CEO directive becomes an initiative that moves through the stage-gate lifecycle — intake to operate."
        actions={
          <>
            <Link href="/chat" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <MessagesSquare />
              Discuss with Chief of Staff
            </Link>
            <Button variant="primary" size="sm" onClick={() => set({ new: "1" })}>
              <Plus />
              New initiative
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Filter by status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value) => set({ status: value === "all" ? null : value })}
        />
        <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
          <div>
            <label htmlFor="stage-filter" className="sr-only">
              Filter by stage
            </label>
            <Select
              id="stage-filter"
              className="sm:w-52"
              value={stage}
              onChange={(event) => set({ stage: event.target.value || null })}
            >
              <option value="">All stages</option>
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageShortTitle(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative sm:w-72">
            <label htmlFor="initiative-search" className="sr-only">
              Search initiatives
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            />
            <Input
              id="initiative-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search initiatives…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <QueryView
        query={query}
        loading={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        }
      >
        {(all) =>
          all.length === 0 ? (
            <Card>
              <EmptyState
                icon={Rocket}
                title={status === "all" ? "No initiatives yet" : `No ${status} initiatives`}
                description="Give the Chief of Staff a directive, or create an initiative directly. It will be chartered, planned and staffed automatically."
                action={
                  <>
                    <Link href="/chat" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Open directives
                    </Link>
                    <Button variant="primary" size="sm" onClick={() => set({ new: "1" })}>
                      <Plus />
                      New initiative
                    </Button>
                  </>
                }
              />
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title="No initiatives match your filters"
                description="Try a different stage or search term."
              />
            </Card>
          ) : (
            <ul
              className={cn(
                "grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3",
                query.isFetching && "opacity-80",
              )}
            >
              {filtered.map((initiative) => (
                <li key={initiative.id}>
                  <InitiativeCard initiative={initiative} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>

      <NewInitiativeDialog open={dialogOpen} onClose={() => set({ new: null })} />
    </div>
  );
}

function InitiativeCard({ initiative }: { initiative: InitiativeSummaryDTO }) {
  const now = useNow();
  const { workItems } = initiative;
  const budgetRatio = initiative.budgetCredits ? initiative.spentCredits / initiative.budgetCredits : null;
  const finished = initiative.status === "completed" || initiative.status === "cancelled";
  const awaiting = finished ? 0 : initiative.pendingApprovals;
  const reason = initiative.statusReason?.trim();
  return (
    <Link
      href={`/initiatives/${initiative.id}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-surface/90 p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-fg group-hover:text-accent">{initiative.title}</h2>
          <p className="mt-0.5 truncate text-xs text-muted">
            {initiative.productName ?? "No product yet"} · created {relativeTime(initiative.createdAt, now)}
          </p>
        </div>
        <InitiativeStatusBadge status={initiative.status} />
      </div>
      {reason ? (
        <p
          className={cn(
            "mt-1.5 line-clamp-2 text-xs",
            initiative.status === "paused" ? "text-amber-200" : "text-muted",
          )}
        >
          {reason}
        </p>
      ) : null}

      <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted">
        {initiative.summary || initiative.directive}
      </p>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-fg">{stageShortTitle(initiative.stage)}</span>
          {awaiting > 0 ? (
            <Badge tone="warning" dot pulse>
              {awaiting} awaiting you
            </Badge>
          ) : (
            <span className="text-subtle">
              Stage {LIFECYCLE_STAGES.indexOf(initiative.stage) + 1}/{LIFECYCLE_STAGES.length}
            </span>
          )}
        </div>
        <StageBar stage={initiative.stage} status={initiative.status} waitingOnCeo={awaiting > 0} />
      </div>

      <div className="mt-auto grid grid-cols-3 gap-3 border-t border-border/70 pt-3 text-xs">
        <div>
          <p className="flex items-center gap-1 text-subtle">
            <ListChecks aria-hidden className="size-3" /> Work
          </p>
          <p className="mt-0.5 tabular-nums text-fg">
            {workItems.done}/{workItems.total}
            {workItems.blocked > 0 ? (
              <span className="ml-1 text-rose-300">· {workItems.blocked} blocked</span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-subtle">
            <Coins aria-hidden className="size-3" /> Spend
          </p>
          <p
            className={cn(
              "mt-0.5 tabular-nums",
              budgetRatio !== null && budgetRatio >= 1 ? "text-rose-300" : "text-fg",
            )}
          >
            {credits(initiative.spentCredits)}
            {initiative.budgetCredits ? (
              <span className="text-subtle"> / {credits(initiative.budgetCredits)}</span>
            ) : null}
          </p>
          {initiative.budgetCredits ? (
            <Progress
              value={initiative.spentCredits}
              max={initiative.budgetCredits}
              label="Budget used"
              size="xs"
              className="mt-1"
            />
          ) : null}
        </div>
        <div>
          <p className="flex items-center gap-1 text-subtle">
            <CalendarDays aria-hidden className="size-3" /> Target
          </p>
          <p className="mt-0.5 text-fg">{initiative.targetDate ? formatDate(initiative.targetDate) : "—"}</p>
        </div>
      </div>
    </Link>
  );
}
