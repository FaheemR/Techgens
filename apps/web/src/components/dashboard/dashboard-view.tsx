"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ApprovalSummaryDTO,
  CompanyDTO,
  DashboardDTO,
  GoalDTO,
  InitiativeSummaryDTO,
  JobDTO,
} from "@techgens/core";
import {
  ArrowRight,
  Bot,
  Coins,
  Inbox,
  MessagesSquare,
  Rocket,
  Siren,
  Sparkles,
  Target,
  Wallet,
  Activity,
  ShieldAlert,
  X,
} from "lucide-react";
import { ActivityFeed } from "@/components/common/activity-feed";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { Credits } from "@/components/common/credits";
import { KpiCard } from "@/components/common/kpi-card";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { StageBar, stageShortTitle } from "@/components/common/stages";
import {
  ApprovalKindBadge,
  GoalStatusBadge,
  InitiativeStatusBadge,
  JobStatusBadge,
} from "@/components/common/status";
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

export function DashboardView() {
  const dashboard = useDashboard();
  return (
    <QueryView query={dashboard} loading={<PageSkeleton />}>
      {(data) => <Dashboard data={data} />}
    </QueryView>
  );
}

function Dashboard({ data }: { data: DashboardDTO }) {
  const { company, initiatives, pendingApprovals, activeJobs, goals, usage, openIncidents } = data;
  const active = initiatives.filter((i) => i.status === "active");
  const running = activeJobs.filter((j) => j.status === "running").length;
  const waiting = activeJobs.filter((j) => j.status === "waiting").length;
  const budget = usage.monthBudgetCredits;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={company.name || "Your company"}
        title="Command overview"
        description={company.mission || "Set the vision, approve the gates — your AI staff does the rest."}
        actions={
          <>
            <Link href="/approvals" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Inbox />
              Review approvals
            </Link>
            <Link href="/chat" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <MessagesSquare />
              New directive
            </Link>
          </>
        }
      />

      {!company.onboarded ? <OnboardingCallout /> : null}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Active initiatives"
          value={active.length}
          sub={`${initiatives.length} total`}
          icon={Rocket}
          href="/initiatives"
        />
        <KpiCard
          label="Pending approvals"
          value={pendingApprovals.length}
          sub={pendingApprovals.length > 0 ? "Agents are waiting on you" : "Nothing waiting"}
          icon={ShieldAlert}
          tone={pendingApprovals.length > 0 ? "warning" : "success"}
          highlight={pendingApprovals.length > 0}
          href="/approvals"
        />
        <KpiCard
          label="Agent jobs"
          value={activeJobs.length}
          sub={`${running} running · ${waiting} waiting`}
          icon={Bot}
          href="/activity"
        />
        <KpiCard
          label="Credits today"
          value={credits(usage.todayCredits)}
          sub="AI credits spent"
          icon={Coins}
          href="/budget"
        />
        <KpiCard
          label="Credits this month"
          value={credits(usage.monthCredits)}
          sub={
            budget
              ? `of ${credits(budget)} budget · ${percent(usage.monthCredits / budget)}`
              : "No monthly budget set"
          }
          icon={Wallet}
          tone={budget && usage.monthCredits >= budget ? "danger" : "accent"}
          href="/budget"
        >
          {budget ? (
            <Progress value={usage.monthCredits} max={budget} label="Monthly budget used" size="sm" />
          ) : null}
        </KpiCard>
        <KpiCard
          label="Open incidents"
          value={openIncidents}
          sub={openIncidents > 0 ? "Needs attention" : "All systems normal"}
          icon={Siren}
          tone={openIncidents > 0 ? "danger" : "success"}
          highlight={openIncidents > 0}
          href="/operations"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <InitiativesCard initiatives={initiatives} />
          <ActiveJobsCard jobs={activeJobs} />
        </div>
        <div className="space-y-6">
          <ApprovalsPreview approvals={pendingApprovals} />
          <GoalsCard goals={goals} />
          <RecentActivityCard seed={data.recentEvents} />
        </div>
      </div>
    </div>
  );
}

function OnboardingCallout() {
  const queryClient = useQueryClient();
  const dismiss = useApiMutation(() => api.put<CompanyDTO>("/api/company", { onboarded: true }), {
    errorTitle: "Couldn't update onboarding",
    onSuccess: (company) => {
      queryClient.setQueryData(qk.company, company);
      queryClient.setQueryData<DashboardDTO>(qk.dashboard, (data) => (data ? { ...data, company } : data));
    },
    invalidate: [qk.system],
  });
  return (
    <Card className="overflow-hidden border-accent/30 bg-gradient-to-r from-accent/[0.08] via-surface to-surface">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Sparkles aria-hidden className="size-6 shrink-0 text-accent" />
        <div className="flex-1">
          <p className="font-semibold">Welcome, CEO. Let&apos;s set up your company.</p>
          <p className="mt-0.5 text-sm text-muted">
            Define your mission, values and policies (the company constitution), connect GitHub, then give
            your Chief of Staff the first directive.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/strategy" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Company strategy
          </Link>
          <Link href="/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Connect GitHub
          </Link>
          <Link href="/chat" className={buttonVariants({ variant: "primary", size: "sm" })}>
            First directive
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => dismiss.mutate()}
            loading={dismiss.isPending}
            aria-label="Dismiss setup checklist"
            title="Mark setup as done"
          >
            {dismiss.isPending ? null : <X />}
          </Button>
        </div>
      </CardContent>
    </Card>
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

function ApprovalsPreview({ approvals }: { approvals: ApprovalSummaryDTO[] }) {
  const now = useNow();
  return (
    <Card className={approvals.length > 0 ? "border-amber-400/30" : undefined}>
      <CardHeader
        title="Waiting on you"
        description={
          approvals.length > 0
            ? `${approvals.length} gate${approvals.length === 1 ? "" : "s"} need a decision`
            : "Your inbox is clear"
        }
        icon={Inbox}
        action={
          <Link href="/approvals" className={buttonVariants({ variant: "ghost", size: "xs" })}>
            Inbox <ArrowRight />
          </Link>
        }
      />
      {approvals.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldAlert}
          title="No pending approvals"
          description="Gate reviews (PRDs, architecture, releases) land here."
        />
      ) : (
        <ul className="divide-y divide-border/70">
          {approvals.slice(0, 5).map((approval) => (
            <li key={approval.id}>
              <Link
                href={`/approvals?id=${approval.id}`}
                className="block px-4 py-3 transition-colors hover:bg-white/[0.025]"
              >
                <div className="flex items-center justify-between gap-2">
                  <ApprovalKindBadge kind={approval.kind} />
                  <span className="text-[11px] text-subtle">{relativeTime(approval.createdAt, now)}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-fg">{approval.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {approval.initiativeTitle ?? "Company-wide"}
                  {approval.requestedBy ? ` · ${approval.requestedBy}` : ""}
                  {approval.round > 1 ? ` · round ${approval.round}` : ""}
                </p>
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
              <p className="mt-1 text-[11px] text-subtle">
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
  const events = mergeEvents(live.events, seed, 12);
  return (
    <Card>
      <CardHeader
        title="Recent activity"
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
