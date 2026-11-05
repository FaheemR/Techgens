import type { DashboardDTO, LiveEvent } from "@techgens/core";

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  urgent: boolean;
}

export function dashboardAttention(data: DashboardDTO, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const approval of data.pendingApprovals) {
    const stale = now - Date.parse(approval.createdAt) >= 24 * 60 * 60 * 1000;
    items.push({
      id: `approval-${approval.id}`,
      title: approval.title,
      detail:
        approval.kind === "budget_overrun"
          ? "Budget decision is blocking work"
          : stale
            ? "Decision waiting over 24 hours"
            : "Waiting for your decision",
      href: `/approvals?id=${approval.id}`,
      urgent: stale || approval.kind === "budget_overrun",
    });
  }
  for (const initiative of data.initiatives) {
    if (initiative.status === "completed" || initiative.status === "cancelled") continue;
    if (initiative.status !== "paused" && !initiative.workItems.blocked) continue;
    items.push({
      id: `initiative-${initiative.id}`,
      title: initiative.title,
      detail:
        initiative.statusReason ??
        `${initiative.workItems.blocked} blocked work item${initiative.workItems.blocked === 1 ? "" : "s"}`,
      href: `/initiatives/${initiative.id}`,
      urgent: true,
    });
  }
  for (const budget of data.budgets) {
    if (!budget.enabled || (budget.state !== "warn" && budget.state !== "exceeded")) continue;
    items.push({
      id: `budget-${budget.id}`,
      title: `${budget.scopeLabel} ${budget.period} budget`,
      detail: `${budget.spentCredits.toLocaleString()} of ${(budget.limitCredits + budget.grantedCredits).toLocaleString()} credits used (warning at ${budget.warnPct}%)`,
      href: "/budget",
      urgent: budget.state === "exceeded",
    });
  }
  if (data.openIncidents)
    items.push({
      id: "incidents",
      title: `${data.openIncidents} open incident${data.openIncidents === 1 ? "" : "s"}`,
      detail: "Review incident status and response",
      href: "/operations",
      urgent: true,
    });
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

export function isDashboardEvent(event: LiveEvent): boolean {
  return (
    event.type.startsWith("initiative.") ||
    event.type.startsWith("approval.") ||
    event.type.startsWith("budget.") ||
    [
      "decision.recorded",
      "deployment.updated",
      "incident.opened",
      "job.failed",
      "system.paused",
      "system.resumed",
    ].includes(event.type)
  );
}
