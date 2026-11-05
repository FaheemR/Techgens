"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { CompanyDTO, DashboardDTO, GoalDTO, InitiativeSummaryDTO, JobDTO } from "@techgens/core";
import { ArrowRight, Bot, ChevronDown, MessagesSquare, Rocket, Target, Activity, X } from "lucide-react";
import { ActivityFeed } from "@/components/common/activity-feed";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { Credits } from "@/components/common/credits";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { KeyResultWarning } from "@/components/common/key-result-warning";
import { StageBar, stageShortTitle } from "@/components/common/stages";
import { GoalStatusBadge, InitiativeStatusBadge, JobStatusBadge } from "@/components/common/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { mergeEvents, useLiveEvents } from "@/lib/events";
import { credits, formatDate, formatDuration, percent, relativeTime } from "@/lib/format";
import { buildObjectiveTree } from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/mutations";
import { qk, useDashboard } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { dashboardAttention, isDashboardEvent } from "@/lib/attention";

export function DashboardView() {
  const dashboard = useDashboard();
  return (
    <QueryView query={dashboard} loading={<PageSkeleton />}>
      {(data) => <Dashboard data={data} />}
    </QueryView>
  );
}

function Dashboard({ data }: { data: DashboardDTO }) {
  const { company, initiatives, activeJobs, goals, usage, openIncidents } = data;
  const active = initiatives.filter((i) => i.status === "active");
  const running = activeJobs.filter((j) => j.status === "running").length;
  const waiting = activeJobs.filter((j) => j.status === "waiting").length;
  const budget = usage.monthBudgetCredits;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Today"
        description="Decisions and blockers, in one place."
        actions={
          <>
            <Link href="/chat" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <MessagesSquare />
              New directive
            </Link>
          </>
        }
      />

      <AttentionCard data={data} />

      <OnboardingCallout setup={data.setup} dismissed={company.onboarded} />

      <details className="group border-t border-border">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-lg font-semibold">Company overview</span>
            <span className="mt-1 block text-sm text-muted">
              {active.length} active initiatives · {running} running jobs · {credits(usage.monthCredits)}{" "}
              credits this month
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-6 pb-6">
          {company.mission ? (
            <p className="max-w-[70ch] text-base leading-relaxed text-muted">{company.mission}</p>
          ) : null}
          <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Credit usage</dt>
              <dd className="mt-1 text-base tabular-nums">
                {credits(usage.todayCredits)} today · {credits(usage.monthCredits)} this month
              </dd>
              <p className="mt-1 text-sm text-muted">
                {budget
                  ? `${credits(budget)} monthly budget · ${percent(usage.monthCredits / budget)} used`
                  : "No monthly budget set"}
              </p>
              <Link
                href="/budget"
                className="mt-2 inline-flex min-h-11 items-center text-sm text-accent hover:underline"
              >
                View budgets
              </Link>
            </div>
            <div>
              <dt className="text-sm text-muted">Company activity</dt>
              <dd className="mt-1 text-base">
                {running} running jobs · {waiting} waiting · {openIncidents} open incidents
              </dd>
              <Link
                href="/operations"
                className="mt-2 inline-flex min-h-11 items-center text-sm text-accent hover:underline"
              >
                View operations
              </Link>
            </div>
          </dl>
          <InitiativesCard initiatives={initiatives} />
          <ActiveJobsCard jobs={activeJobs} />
          <GoalsCard goals={goals} />
          <RecentActivityCard seed={data.recentEvents} />
        </div>
      </details>
    </div>
  );
}

function AttentionCard({ data }: { data: DashboardDTO }) {
  const now = useNow();
  const items = dashboardAttention(data, now);
  return (
    <section aria-labelledby="attention-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attention-heading" className="text-xl font-semibold">
          Needs attention
        </h2>
        <Link
          href="/approvals"
          className="inline-flex min-h-11 items-center text-sm text-accent hover:underline"
        >
          Approval inbox
        </Link>
      </div>
      {items.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                className="flex items-center justify-between gap-4 rounded-lg px-5 py-5 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block break-words text-base font-semibold leading-relaxed",
                      item.urgent ? "text-amber-200" : "text-fg",
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{item.detail}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-accent">
                  {item.id.startsWith("approval-") ? "Review" : "Open"}{" "}
                  <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-border bg-surface px-5 py-6">
          <p className="text-base font-medium">Nothing needs your attention right now</p>
          <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-muted">
            No pending decisions, blockers, budget warnings or open incidents. Check the company overview or
            give the team a new directive.
          </p>
        </div>
      )}
    </section>
  );
}

function OnboardingCallout({ setup, dismissed }: { setup: DashboardDTO["setup"]; dismissed: boolean }) {
  const queryClient = useQueryClient();
  const dismiss = useApiMutation((onboarded: boolean) => api.put<CompanyDTO>("/api/company", { onboarded }), {
    errorTitle: "Couldn't update onboarding",
    onSuccess: (company) => {
      queryClient.setQueryData(qk.company, company);
      queryClient.setQueryData<DashboardDTO>(qk.dashboard, (data) => (data ? { ...data, company } : data));
    },
    invalidate: [qk.system],
  });
  const steps = [
    { done: setup.strategy, label: "Company strategy", href: "/strategy" },
    { done: setup.github, label: "Connect GitHub (simulated in demo mode)", href: "/settings" },
    { done: setup.directive, label: "First directive", href: "/chat" },
  ];
  const completed = steps.filter((step) => step.done).length;
  if (dismissed)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>Company setup: {completed} of 3 steps complete</p>
        <Button variant="ghost" size="sm" onClick={() => dismiss.mutate(false)} loading={dismiss.isPending}>
          Show setup checklist
        </Button>
      </div>
    );
  return (
    <details className="group border-t border-border">
      <summary className="flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-2 py-4 text-sm">
        <span className="font-medium">Company setup</span>
        <span className="inline-flex items-center gap-3 text-muted">
          {completed} of 3 steps complete
          <ChevronDown aria-hidden className="size-5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Progress value={completed} max={3} label="Company setup progress" className="mt-2" />
          <ul className="mt-2 space-y-1 text-sm">
            {steps.map((step) => (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className="inline-flex min-h-11 items-center text-accent hover:underline"
                >
                  <span className="mr-2">{step.done ? "Complete:" : "To do:"}</span>
                  {step.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dismiss.mutate(true)}
            loading={dismiss.isPending}
            aria-label="Dismiss setup checklist"
            title="Dismiss checklist (does not complete unfinished steps)"
          >
            {dismiss.isPending ? null : <X />}
          </Button>
        </div>
      </div>
    </details>
  );
}

function InitiativesCard({ initiatives }: { initiatives: InitiativeSummaryDTO[] }) {
  const now = useNow();
  const visible = [...initiatives]
    .filter((i) => i.status !== "cancelled" && i.status !== "completed")
    .sort(
      (a, b) => b.pendingApprovals - a.pendingApprovals || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )
    .slice(0, 8);
  return (
    <Card>
      <CardHeader
        title="Initiatives"
        description="Where every directive is in the stage-gate lifecycle"
        icon={Rocket}
        action={
          <Link href="/initiatives" className={buttonVariants({ variant: "ghost", size: "xs" })}>
            All initiatives <ArrowRight />
          </Link>
        }
      />
      {visible.length === 0 ? (
        <EmptyState
          compact
          icon={Rocket}
          title="No initiatives in flight"
          description="Give the Chief of Staff a directive and it becomes an initiative with a charter and roadmap."
          action={
            <Link href="/chat" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Give a directive
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border/70">
          {visible.map((initiative) => {
            const budgetRatio = initiative.budgetCredits
              ? initiative.spentCredits / initiative.budgetCredits
              : null;
            return (
              <li key={initiative.id}>
                <Link
                  href={`/initiatives/${initiative.id}`}
                  className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_220px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-fg">{initiative.title}</span>
                      <InitiativeStatusBadge status={initiative.status} />
                      {initiative.pendingApprovals > 0 ? (
                        <Badge tone="warning" dot pulse>
                          Awaiting your approval
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {initiative.productName ? `${initiative.productName} · ` : ""}
                      {initiative.workItems.total > 0
                        ? `${initiative.workItems.done}/${initiative.workItems.total} work items done`
                        : "No work items yet"}
                      {initiative.workItems.blocked > 0 ? ` · ${initiative.workItems.blocked} blocked` : ""}
                      {initiative.targetDate ? ` · due ${formatDate(initiative.targetDate)}` : ""}
                      {` · updated ${relativeTime(initiative.updatedAt, now)}`}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-fg">{stageShortTitle(initiative.stage)}</span>
                      <Credits
                        value={initiative.spentCredits}
                        of={initiative.budgetCredits}
                        className={budgetRatio !== null && budgetRatio >= 1 ? "text-rose-300" : "text-muted"}
                      />
                    </div>
                    <StageBar
                      stage={initiative.stage}
                      status={initiative.status}
                      waitingOnCeo={initiative.pendingApprovals > 0}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActiveJobsCard({ jobs }: { jobs: JobDTO[] }) {
  const now = useNow(10_000);
  return (
    <Card>
      <CardHeader
        title="Agents at work"
        description="Live agent jobs across the company"
        icon={Bot}
        action={
          <Link href="/activity" className={buttonVariants({ variant: "ghost", size: "xs" })}>
            Activity <ArrowRight />
          </Link>
        }
      />
      {jobs.length === 0 ? (
        <EmptyState
          compact
          icon={Bot}
          title="All agents are idle"
          description="Jobs appear here as soon as agents pick up work."
        />
      ) : (
        <ul className="divide-y divide-border/70">
          {jobs.slice(0, 10).map((job) => (
            <li key={job.id}>
              <Link
                href={`/activity/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.025]"
              >
                <AgentAvatar name={job.agentName} department={job.department} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium text-fg">{job.agentName}</span>
                    <span className="text-muted"> · {job.workItemTitle ?? job.kind}</span>
                  </p>
                  <p className="truncate text-xs text-subtle">
                    {job.waitReason ? `Waiting on ${job.waitReason}` : job.prompt.slice(0, 120)}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted sm:block">
                  <div className="tabular-nums">{formatDuration(job.startedAt ?? job.createdAt, now)}</div>
                  <Credits value={job.spentCredits} className="block text-subtle" />
                </div>
                <JobStatusBadge status={job.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalsCard({ goals }: { goals: GoalDTO[] }) {
  const { objectives } = buildObjectiveTree(goals);
  return (
    <Card>
      <CardHeader
        title="Goals & OKRs"
        icon={Target}
        action={
          <Link href="/strategy?tab=goals" className={buttonVariants({ variant: "ghost", size: "xs" })}>
            Manage <ArrowRight />
          </Link>
        }
      />
      {objectives.length === 0 ? (
        <EmptyState
          compact
          icon={Target}
          title="No objectives yet"
          description="Set company OKRs so agents can align their work."
        />
      ) : (
        <CardContent className="space-y-4">
          {objectives.slice(0, 5).map(({ objective, keyResults, progress }) => (
            <div key={objective.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-fg">{objective.title}</p>
                <GoalStatusBadge status={objective.status} />
              </div>
              <KeyResultWarning objective={objective} keyResults={keyResults} />
              <div className="mt-2 flex items-center gap-2">
                <Progress
                  value={progress ?? 0}
                  label={`${objective.title} progress`}
                  size="sm"
                  tone={
                    objective.status === "off_track"
                      ? "danger"
                      : objective.status === "at_risk"
                        ? "warning"
                        : "success"
                  }
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
                  {progress === null ? "—" : percent(Math.min(progress, 1))}
                </span>
              </div>
              <p className="mt-1 text-xs text-subtle">
                {keyResults.length} key result{keyResults.length === 1 ? "" : "s"}
                {objective.dueDate ? ` · due ${formatDate(objective.dueDate)}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function RecentActivityCard({ seed }: { seed: DashboardDTO["recentEvents"] }) {
  const live = useLiveEvents();
  const events = mergeEvents(live.events, seed, 200).filter(isDashboardEvent).slice(0, 8);
  return (
    <Card>
      <CardHeader
        title="Key company events"
        icon={Activity}
        action={
          <Link href="/activity" className={buttonVariants({ variant: "ghost", size: "xs" })}>
            Full feed <ArrowRight />
          </Link>
        }
      />
      <ActivityFeed events={events} dense />
    </Card>
  );
}
