import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  type BudgetDTO,
  type DashboardDTO,
  type InitiativeSummaryDTO,
  type LiveEvent,
} from "@techgens/core";
import { dashboardAttention, isDashboardEvent } from "./attention";

const now = Date.parse("2026-11-04T12:00:00Z");
const dashboard = (patch: Partial<DashboardDTO> = {}): DashboardDTO => ({
  setup: { strategy: false, github: false, directive: false },
  company: {
    name: "Techgens",
    mission: "",
    vision: "",
    values: [],
    policies: "",
    githubOwner: null,
    onboarded: false,
  },
  initiatives: [],
  pendingApprovals: [],
  activeJobs: [],
  goals: [],
  budgets: [],
  recentEvents: [],
  openIncidents: 0,
  usage: { todayCredits: 0, monthCredits: 0, monthBudgetCredits: null },
  ...patch,
});
const initiative = (patch: Partial<InitiativeSummaryDTO>): InitiativeSummaryDTO => ({
  id: "initiative",
  title: "Launch",
  summary: "",
  directive: "",
  stage: "intake",
  status: "active",
  statusReason: null,
  productId: null,
  productName: null,
  targetDate: null,
  budgetCredits: null,
  grantedCredits: 0,
  spentCredits: 0,
  workItems: { total: 0, done: 0, inProgress: 0, blocked: 0, cancelled: 0 },
  pendingApprovals: 0,
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
  ...patch,
});
const budget = (patch: Partial<BudgetDTO>): BudgetDTO => ({
  id: "budget",
  scope: "company",
  scopeId: null,
  scopeLabel: "Company",
  period: "month",
  limitCredits: 100,
  grantedCredits: 20,
  windowEndsAt: null,
  warnPct: 80,
  enabled: true,
  spentCredits: 96,
  state: "warn",
  ...patch,
});

describe("dashboard attention", () => {
  it.each([
    { name: "before", age: 86_399_999, urgent: false, detail: "Waiting for your decision" },
    { name: "at", age: 86_400_000, urgent: true, detail: "Decision waiting over 24 hours" },
    { name: "after", age: 86_400_001, urgent: true, detail: "Decision waiting over 24 hours" },
  ])("marks approval stale $name the 24-hour boundary", ({ age, urgent, detail }) => {
    const approval = {
      id: "approval",
      title: "Review scope",
      kind: "spec" as const,
      status: "pending" as const,
      initiativeId: null,
      initiativeTitle: null,
      requestedBy: "Morgan",
      createdAt: new Date(now - age).toISOString(),
      summary: "",
      round: 1,
      decidedAt: null,
      decisionComment: null,
    };
    expect(dashboardAttention(dashboard({ pendingApprovals: [approval] }), now)).toEqual([
      {
        id: "approval-approval",
        title: "Review scope",
        detail,
        href: "/approvals?id=approval",
        urgent,
      },
    ]);
    expect(
      dashboardAttention(dashboard({ pendingApprovals: [{ ...approval, kind: "budget_overrun" }] }), now)[0],
    ).toMatchObject({ urgent: true, detail: "Budget decision is blocking work" });
  });

  it("surfaces paused and blocked initiatives but excludes completed and cancelled work", () => {
    const blocked = { total: 2, done: 0, inProgress: 0, blocked: 2, cancelled: 0 };
    const data = dashboard({
      initiatives: [
        initiative({ id: "paused", status: "paused", statusReason: "CEO requested changes" }),
        initiative({ id: "blocked", workItems: blocked }),
        initiative({ id: "single", workItems: { ...blocked, blocked: 1 } }),
        initiative({ id: "healthy" }),
        initiative({ id: "completed", status: "completed", workItems: blocked }),
        initiative({ id: "cancelled", status: "cancelled", workItems: blocked }),
      ],
    });
    expect(dashboardAttention(data, now)).toEqual([
      {
        id: "initiative-paused",
        title: "Launch",
        detail: "CEO requested changes",
        href: "/initiatives/paused",
        urgent: true,
      },
      {
        id: "initiative-blocked",
        title: "Launch",
        detail: "2 blocked work items",
        href: "/initiatives/blocked",
        urgent: true,
      },
      {
        id: "initiative-single",
        title: "Launch",
        detail: "1 blocked work item",
        href: "/initiatives/single",
        urgent: true,
      },
    ]);
  });

  it("ignores disabled and healthy budgets and prioritizes exceeded over warnings", () => {
    expect(
      dashboardAttention(
        dashboard({
          budgets: [
            budget({ id: "warning" }),
            budget({ id: "disabled-warning", enabled: false }),
            budget({ id: "disabled-exceeded", enabled: false, state: "exceeded" }),
            budget({ id: "healthy", state: "ok" }),
            budget({ id: "exceeded", state: "exceeded", spentCredits: 125 }),
          ],
        }),
        now,
      ),
    ).toEqual([
      {
        id: "budget-exceeded",
        title: "Company month budget",
        detail: "125 of 120 credits used (warning at 80%)",
        href: "/budget",
        urgent: true,
      },
      {
        id: "budget-warning",
        title: "Company month budget",
        detail: "96 of 120 credits used (warning at 80%)",
        href: "/budget",
        urgent: false,
      },
    ]);
  });

  it("returns no invented attention and reports singular and plural incident counts", () => {
    expect(dashboardAttention(dashboard(), now)).toEqual([]);
    for (const [openIncidents, title] of [
      [1, "1 open incident"],
      [2, "2 open incidents"],
    ] as const) {
      expect(dashboardAttention(dashboard({ openIncidents }), now)).toEqual([
        {
          id: "incidents",
          title,
          detail: "Review incident status and response",
          href: "/operations",
          urgent: true,
        },
      ]);
    }
  });

  const curated = new Set([
    "initiative.created",
    "initiative.updated",
    "initiative.stage_changed",
    "approval.requested",
    "approval.decided",
    "budget.warning",
    "budget.exceeded",
    "decision.recorded",
    "deployment.updated",
    "incident.opened",
    "job.failed",
    "system.paused",
    "system.resumed",
  ]);
  it.each(EVENT_TYPES)("curates dashboard event %s", (type) => {
    const event: LiveEvent = {
      id: "1",
      type,
      actorType: "system",
      actorId: null,
      subjectId: null,
      subjectType: null,
      summary: "",
      data: {},
      createdAt: new Date(now).toISOString(),
    };
    expect(isDashboardEvent(event)).toBe(curated.has(type));
  });
});
