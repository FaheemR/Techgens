"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { UsageSummaryDTO } from "@techgens/core";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Coins,
  Gauge,
  Rocket,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { AgentAvatar } from "@/components/common/agent-avatar";
import { KpiCard } from "@/components/common/kpi-card";
import { PageHeader } from "@/components/common/page-header";
import { QueryView } from "@/components/common/query-view";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { compactNumber, credits, percent } from "@/lib/format";
import { useQueryParams } from "@/lib/hooks";
import { departmentStyle } from "@/lib/labels";
import { useUsage } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { BudgetsEditor } from "./budgets-editor";
import { SpendChart, fillDays } from "./spend-chart";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

export function BudgetView() {
  const { get, set } = useQueryParams();
  const raw = get("days");
  const days = raw === "7" || raw === "90" ? Number(raw) : 30;
  const usage = useUsage(days);

  return (
    <div>
      <PageHeader
        title="Budget & usage"
        description="AI credits consumed by your agents (GitHub Copilot usage), where they go, and the limits that keep spend in check."
        actions={
          <Segmented
            label="Time range"
            value={String(days) as (typeof RANGES)[number]["value"]}
            options={RANGES}
            onChange={(value) => set({ days: value === "30" ? null : value })}
          />
        }
      />
      <QueryView query={usage} loading={<PageSkeleton />}>
        {(data) => <UsageContent data={data} days={days} fetching={usage.isFetching} />}
      </QueryView>
      <div className="mt-6">
        <BudgetsEditor />
      </div>
    </div>
  );
}

function UsageContent({ data, days, fetching }: { data: UsageSummaryDTO; days: number; fetching: boolean }) {
  const monthBudget = data.budgets.find((b) => b.scope === "company" && b.period === "month" && b.enabled);
  const dayBudget = data.budgets.find((b) => b.scope === "company" && b.period === "day" && b.enabled);
  const weekBudget = data.budgets.find((b) => b.scope === "company" && b.period === "week" && b.enabled);
  const daily = fillDays(data.daily, days);
  const rangeTotal = daily.reduce((sum, d) => sum + d.credits, 0);

  return (
    <div className={cn("space-y-6 transition-opacity", fetching && "opacity-80")}>
      <section aria-label="Spend totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Today"
          value={credits(data.todayCredits)}
          sub={dayBudget ? `of ${credits(dayBudget.limitCredits)} daily budget` : "credits"}
          icon={Coins}
          tone={dayBudget && data.todayCredits >= dayBudget.limitCredits ? "danger" : "accent"}
        >
          {dayBudget ? (
            <Progress
              value={data.todayCredits}
              max={dayBudget.limitCredits}
              warnAt={dayBudget.warnPct / 100}
              label="Daily budget used"
              size="sm"
            />
          ) : null}
        </KpiCard>
        <KpiCard
          label="This week"
          value={credits(data.weekCredits)}
          sub={weekBudget ? `of ${credits(weekBudget.limitCredits)} weekly budget` : "credits"}
          icon={CalendarDays}
        >
          {weekBudget ? (
            <Progress
              value={data.weekCredits}
              max={weekBudget.limitCredits}
              warnAt={weekBudget.warnPct / 100}
              label="Weekly budget used"
              size="sm"
            />
          ) : null}
        </KpiCard>
        <KpiCard
          label="This month"
          value={credits(data.monthCredits)}
          sub={
            monthBudget
              ? `of ${credits(monthBudget.limitCredits)} · ${percent(data.monthCredits / monthBudget.limitCredits)}`
              : "No monthly company budget"
          }
          icon={Wallet}
          tone={monthBudget && data.monthCredits >= monthBudget.limitCredits ? "danger" : "accent"}
        >
          {monthBudget ? (
            <Progress
              value={data.monthCredits}
              max={monthBudget.limitCredits}
              warnAt={monthBudget.warnPct / 100}
              label="Monthly budget used"
              size="sm"
            />
          ) : null}
        </KpiCard>
        <KpiCard
          label="Premium requests"
          value={compactNumber(data.premiumRequestsMonth)}
          sub="this month"
          icon={Sparkles}
          tone="violet"
        />
      </section>

      <Card>
        <CardHeader
          title="Daily spend"
          description={`${credits(rangeTotal)} credits over the last ${days} days · avg ${credits(rangeTotal / Math.max(1, daily.length))}/day`}
          icon={BarChart3}
        />
        <CardContent className="pt-6">
          {rangeTotal === 0 ? (
            <EmptyState
              compact
              icon={Gauge}
              title="No spend in this period"
              description="Usage appears as soon as agents run jobs."
            />
          ) : (
            <SpendChart daily={daily} dailyLimit={dayBudget?.limitCredits ?? null} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Breakdown
          title="By agent"
          icon={Users}
          rows={data.byAgent.map((r) => ({
            key: r.agentId,
            label: r.agentName,
            credits: r.credits,
            href: `/org?agent=${r.agentId}`,
            prefix: <AgentAvatar name={r.agentName} size="xs" />,
          }))}
        />
        <Breakdown
          title="By department"
          icon={Building2}
          rows={data.byDepartment.map((r) => ({
            key: r.department,
            label: departmentStyle(r.department).label,
            credits: r.credits,
            color: departmentStyle(r.department).hex,
          }))}
        />
        <Breakdown
          title="By initiative"
          icon={Rocket}
          rows={data.byInitiative.map((r) => ({
            key: r.initiativeId,
            label: r.title,
            credits: r.credits,
            href: `/initiatives/${r.initiativeId}`,
          }))}
        />
      </div>
    </div>
  );
}

interface BreakdownRow {
  key: string;
  label: string;
  credits: number;
  href?: string;
  color?: string;
  prefix?: ReactNode;
}

function Breakdown({ title, icon, rows }: { title: string; icon: typeof Users; rows: BreakdownRow[] }) {
  const sorted = [...rows].sort((a, b) => b.credits - a.credits);
  const total = sorted.reduce((sum, r) => sum + r.credits, 0);
  const top = sorted[0]?.credits ?? 0;
  return (
    <Card>
      <CardHeader
        title={title}
        icon={icon}
        description={total > 0 ? `${credits(total)} credits` : undefined}
      />
      {sorted.length === 0 ? (
        <EmptyState compact title="No spend yet" />
      ) : (
        <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto">
          {sorted.map((row) => {
            const label = row.href ? (
              <Link href={row.href} className="truncate hover:text-accent">
                {row.label}
              </Link>
            ) : (
              <span className="truncate">{row.label}</span>
            );
            return (
              <li key={row.key} className="px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {row.prefix ??
                    (row.color ? (
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: row.color }}
                      />
                    ) : null)}
                  <span className="flex min-w-0 flex-1">{label}</span>
                  <span className="shrink-0 tabular-nums">{credits(row.credits)}</span>
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-subtle">
                    {percent(total > 0 ? row.credits / total : 0)}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${top > 0 ? (row.credits / top) * 100 : 0}%`,
                      backgroundColor: row.color ?? "var(--color-accent)",
                      opacity: 0.75,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
