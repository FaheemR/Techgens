import type {
  ApprovalKind,
  ApprovalStatus,
  GoalStatus,
  InitiativeStatus,
  JobStatus,
  Priority,
  WorkItemStatus,
} from "@techgens/core";
import { GATE_LABELS } from "@techgens/core";
import { Bot, Cloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";
import {
  APPROVAL_KIND_TONE,
  APPROVAL_STATUS_TONE,
  GOAL_STATUS_TONE,
  INITIATIVE_STATUS_TONE,
  JOB_STATUS_TONE,
  PRIORITY_TONE,
  WORK_STATUS_LABEL,
  WORK_STATUS_TONE,
  approvalStatusLabel,
  codingStatusMeta,
  departmentStyle,
  statusTone,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const tone = JOB_STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} dot pulse={status === "running"} className={className}>
      {humanize(status)}
    </Badge>
  );
}

export function InitiativeStatusBadge({
  status,
  className,
}: {
  status: InitiativeStatus;
  className?: string;
}) {
  return (
    <Badge
      tone={INITIATIVE_STATUS_TONE[status] ?? "neutral"}
      dot
      pulse={status === "active"}
      className={className}
    >
      {humanize(status)}
    </Badge>
  );
}

export function ApprovalKindBadge({ kind, className }: { kind: ApprovalKind; className?: string }) {
  return (
    <Badge tone={APPROVAL_KIND_TONE[kind] ?? "neutral"} className={className}>
      {GATE_LABELS[kind] ?? humanize(kind)}
    </Badge>
  );
}

export function ApprovalStatusBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  return (
    <Badge tone={APPROVAL_STATUS_TONE[status] ?? "neutral"} dot className={className}>
      {approvalStatusLabel(status)}
    </Badge>
  );
}

export function WorkStatusBadge({ status, className }: { status: WorkItemStatus; className?: string }) {
  return (
    <Badge tone={WORK_STATUS_TONE[status] ?? "neutral"} dot className={className}>
      {WORK_STATUS_LABEL[status] ?? humanize(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? "neutral"} className={cn("font-mono uppercase", className)}>
      {priority}
    </Badge>
  );
}

export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  return (
    <Badge tone={GOAL_STATUS_TONE[status] ?? "neutral"} dot className={className}>
      {humanize(status)}
    </Badge>
  );
}

export function GenericStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone(status)} dot className={className}>
      {humanize(status)}
    </Badge>
  );
}

export function CodingStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = codingStatusMeta(status);
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} className={className}>
      <Bot aria-hidden className="mr-1 inline size-3 align-[-2px]" />
      {meta.label}
    </Badge>
  );
}

export function DepartmentBadge({ department, className }: { department: string; className?: string }) {
  const style = departmentStyle(department);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        style.badge,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

export function ExecutorBadge({
  executor,
  className,
}: {
  executor: "local-session" | "cloud-agent";
  className?: string;
}) {
  if (executor !== "cloud-agent") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent",
        className,
      )}
    >
      <Cloud aria-hidden className="size-3" />
      Copilot cloud agent
    </span>
  );
}
