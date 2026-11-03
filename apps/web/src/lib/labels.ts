import {
  GATE_LABELS,
  type ApprovalKind,
  type ApprovalStatus,
  type GoalStatus,
  type InitiativeStatus,
  type JobStatus,
  type Priority,
  type WorkItemKind,
  type WorkItemStatus,
} from "@techgens/core";
import {
  Bot,
  Bug,
  BookOpen,
  CalendarClock,
  CircleCheck,
  Eye,
  FileText,
  FlaskConical,
  Layers,
  ListChecks,
  MessageSquare,
  Milestone,
  type LucideIcon,
} from "lucide-react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "violet";

export const TONE_BADGE: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-slate-300",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  danger: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  accent: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  accent: "bg-cyan-400",
  violet: "bg-violet-400",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-slate-300",
  info: "text-sky-300",
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  accent: "text-cyan-300",
  violet: "text-violet-300",
};

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  queued: "neutral",
  running: "accent",
  waiting: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
};

export const INITIATIVE_STATUS_TONE: Record<InitiativeStatus, Tone> = {
  proposed: "violet",
  active: "accent",
  paused: "warning",
  completed: "success",
  cancelled: "neutral",
};

export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  changes_requested: "info",
  cancelled: "neutral",
};

/** CEO-facing names for approval states. `cancelled` = withdrawn because its initiative was cancelled. */
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  cancelled: "Withdrawn",
};

export function approvalStatusLabel(status: string): string {
  return (
    APPROVAL_STATUS_LABEL[status as ApprovalStatus] ??
    status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Gate label for use mid-sentence: "Reject vision & roadmap", "Reject product spec (PRD)". */
export function gateLabelLower(kind: ApprovalKind): string {
  const label = GATE_LABELS[kind] ?? kind.replace(/_/g, " ");
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Strip a repeated gate label from approval titles; shared with the orchestrator's event summaries. */
export { approvalDisplayTitle, approvalHeadline } from "@techgens/core";

/** Gates that move an initiative to its next lifecycle stage (rejecting one pauses the initiative). */
export const STAGE_GATE_KINDS: readonly ApprovalKind[] = [
  "vision_roadmap",
  "spec",
  "architecture",
  "merge_to_main",
  "prod_deploy",
];

/** One line at the top of an approval: what the CEO is actually authorising. */
export const APPROVAL_INTENT: Record<ApprovalKind, string> = {
  vision_roadmap: "Approving the charter and milestone roadmap. Discovery and research start next.",
  spec: "Signing off the product requirements (PRD). Design and architecture start next.",
  architecture:
    "Approving the system design, ADRs and threat model. Backlog planning and repository setup start next.",
  merge_to_main: "Merging the release PR into main. Required checks must be green.",
  prod_deploy: "Deploying to production.",
  budget_overrun: "Granting extra credits so the paused work can continue. Rejecting stops the blocked jobs.",
  hire: "Staffing an additional agent. It starts taking work right away.",
  decision: "An agent escalated a trade-off to you. Your answer and comment go back to the team.",
};

/** Comment placeholders per gate kind (examples that make sense for that decision). */
export const DECISION_PLACEHOLDERS: Record<ApprovalKind, string> = {
  vision_roadmap: "e.g. Approved — keep the MVP scope tight and drop multi-currency.",
  spec: "e.g. Approved — move CSV export to v2 and add acceptance criteria for late payments.",
  architecture: "e.g. Approved — prefer managed Postgres; revisit the queue choice after launch.",
  merge_to_main: "e.g. Approved — mention the API change in the release notes.",
  prod_deploy: "e.g. Approved — deploy after 18:00 UTC and watch error rates for an hour.",
  budget_overrun: "e.g. One-off grant — keep research spend low for the rest of the window.",
  hire: "e.g. Approved — a second QA engineer for the release crunch.",
  decision: "e.g. Go with option B; we can revisit after launch.",
};

/** What happens when the CEO switches a gate off (shown in the confirmation). */
export const GATE_OFF_CONSEQUENCES: Record<ApprovalKind, string> = {
  vision_roadmap:
    "New initiatives will move from intake into discovery without you reviewing their charter and roadmap.",
  spec: "Product requirements (PRDs) will be accepted without your sign-off; design and architecture start immediately.",
  architecture:
    "System designs, ADRs and threat models will be accepted without your review; backlog planning starts immediately.",
  merge_to_main: "Release pull requests will be merged into main without your review.",
  prod_deploy: "Agents will deploy to production without asking you.",
  budget_overrun:
    "When a budget limit is hit, agents automatically get the suggested extra credits and keep spending.",
  hire: "Agents will hire additional agents without asking you.",
  decision: "Agents will settle significant trade-offs on their own instead of escalating them to you.",
};

export const APPROVAL_KIND_TONE: Record<ApprovalKind, Tone> = {
  vision_roadmap: "violet",
  spec: "info",
  architecture: "accent",
  merge_to_main: "success",
  prod_deploy: "warning",
  budget_overrun: "warning",
  hire: "neutral",
  decision: "neutral",
};

export const WORK_STATUS_TONE: Record<WorkItemStatus, Tone> = {
  backlog: "neutral",
  ready: "info",
  in_progress: "accent",
  blocked: "danger",
  in_review: "violet",
  done: "success",
  cancelled: "neutral",
};

export const WORK_STATUS_LABEL: Record<WorkItemStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_TONE: Record<Priority, Tone> = {
  p0: "danger",
  p1: "warning",
  p2: "neutral",
  p3: "neutral",
};

export const GOAL_STATUS_TONE: Record<GoalStatus, Tone> = {
  on_track: "success",
  at_risk: "warning",
  off_track: "danger",
  achieved: "accent",
  missed: "neutral",
};

export const WORK_KIND_ICON: Record<WorkItemKind, LucideIcon> = {
  stage: Milestone,
  epic: Layers,
  story: BookOpen,
  task: ListChecks,
  bug: Bug,
  research: FlaskConical,
  document: FileText,
  review: Eye,
  meeting: CalendarClock,
  chat: MessageSquare,
};

export const CODING_STATUS: Record<string, { label: string; tone: Tone }> = {
  unassigned: { label: "Not assigned", tone: "neutral" },
  assigned: { label: "Coding agent assigned", tone: "info" },
  pr_open: { label: "PR open", tone: "accent" },
  ready_for_review: { label: "Ready for review", tone: "violet" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  approved: { label: "PR approved", tone: "success" },
  merged: { label: "Merged", tone: "success" },
  failed: { label: "Coding failed", tone: "danger" },
};

export function codingStatusMeta(status: string | null | undefined): { label: string; tone: Tone } | null {
  if (!status || status === "unassigned") return null;
  return CODING_STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" };
}

export const CodingAgentIcon = Bot;
export const DoneIcon = CircleCheck;

/** Generic tone for free-form status strings (deployments, incidents, milestones…). */
export function statusTone(status: string | null | undefined): Tone {
  const s = (status ?? "").toLowerCase();
  if (
    [
      "success",
      "succeeded",
      "completed",
      "done",
      "active",
      "resolved",
      "healthy",
      "approved",
      "merged",
      "deployed",
      "achieved",
    ].includes(s)
  )
    return "success";
  if (["failed", "failure", "error", "errored", "open", "critical", "rejected", "down"].includes(s))
    return "danger";
  if (
    [
      "in_progress",
      "running",
      "deploying",
      "pending",
      "queued",
      "waiting",
      "investigating",
      "acknowledged",
      "mitigated",
    ].includes(s)
  )
    return s === "queued" || s === "pending" || s === "waiting" ? "warning" : "accent";
  if (["cancelled", "canceled", "skipped", "inactive", "archived", "superseded"].includes(s))
    return "neutral";
  if (["draft", "planned", "proposed"].includes(s)) return "violet";
  if (["in_review", "review"].includes(s)) return "info";
  return "neutral";
}

export function severityTone(severity: string | null | undefined): Tone {
  const s = (severity ?? "").toLowerCase();
  if (s === "sev1" || s === "critical") return "danger";
  if (s === "sev2" || s === "high") return "warning";
  if (s === "sev3" || s === "medium") return "info";
  return "neutral";
}

export interface DepartmentStyle {
  label: string;
  /** Solid colour used for org-chart accents and chart bars. */
  hex: string;
  text: string;
  badge: string;
}

const DEPARTMENT_STYLES: Record<string, DepartmentStyle> = {
  executive: {
    label: "Executive",
    hex: "#f59e0b",
    text: "text-amber-300",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  product: {
    label: "Product",
    hex: "#a78bfa",
    text: "text-violet-300",
    badge: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
  design: {
    label: "Design",
    hex: "#f472b6",
    text: "text-pink-300",
    badge: "border-pink-400/30 bg-pink-400/10 text-pink-300",
  },
  engineering: {
    label: "Engineering",
    hex: "#38bdf8",
    text: "text-sky-300",
    badge: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  qa: {
    label: "QA",
    hex: "#34d399",
    text: "text-emerald-300",
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  devops: {
    label: "DevOps & SRE",
    hex: "#fb923c",
    text: "text-orange-300",
    badge: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  },
  security: {
    label: "Security",
    hex: "#f87171",
    text: "text-red-300",
    badge: "border-red-400/30 bg-red-400/10 text-red-300",
  },
  docs: {
    label: "Docs",
    hex: "#2dd4bf",
    text: "text-teal-300",
    badge: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  },
  marketing: {
    label: "Marketing",
    hex: "#e879f9",
    text: "text-fuchsia-300",
    badge: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
  },
  sales: {
    label: "Sales",
    hex: "#a3e635",
    text: "text-lime-300",
    badge: "border-lime-400/30 bg-lime-400/10 text-lime-300",
  },
  support: {
    label: "Support",
    hex: "#60a5fa",
    text: "text-blue-300",
    badge: "border-blue-400/30 bg-blue-400/10 text-blue-300",
  },
  finance: {
    label: "Finance",
    hex: "#facc15",
    text: "text-yellow-300",
    badge: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
  },
  legal: {
    label: "Legal",
    hex: "#94a3b8",
    text: "text-slate-300",
    badge: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  },
  hr: {
    label: "People",
    hex: "#fb7185",
    text: "text-rose-300",
    badge: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  },
};

export function departmentStyle(department: string | null | undefined): DepartmentStyle {
  return (
    DEPARTMENT_STYLES[department ?? ""] ?? {
      label: department ? department.charAt(0).toUpperCase() + department.slice(1) : "Other",
      hex: "#94a3b8",
      text: "text-slate-300",
      badge: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    }
  );
}

/** Explanations shown next to the gate policy toggles in Settings. */
export const GATE_DESCRIPTIONS: Record<ApprovalKind, string> = {
  vision_roadmap: "Review the initiative charter and milestone roadmap before discovery starts.",
  spec: "Sign off the PRD (scope, user stories, acceptance criteria) before design and architecture.",
  architecture: "Approve the system design, ADRs and threat model before the backlog is planned.",
  merge_to_main: "Approve the release pull request from the integration branch into main.",
  prod_deploy: "Approve the production deployment (change set, rollout and rollback plan).",
  budget_overrun: "Decide whether agents may keep spending after a budget limit is exceeded.",
  hire: "Approve agents' requests to staff additional agents.",
  decision: "Agents escalate significant trade-offs and decisions to you.",
};

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  charter: "Charter",
  roadmap: "Roadmap",
  research: "Research",
  prd: "PRD",
  ux_spec: "UX spec",
  architecture: "Architecture",
  adr: "ADR",
  threat_model: "Threat model",
  test_plan: "Test plan",
  plan: "Delivery plan",
  release_notes: "Release notes",
  runbook: "Runbook",
  report: "Report",
  policy: "Policy",
  other: "Other",
};

export function documentKindLabel(kind: string): string {
  return DOCUMENT_KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
