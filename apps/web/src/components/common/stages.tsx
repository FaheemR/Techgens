import Link from "next/link";
import {
  LIFECYCLE_STAGES,
  STAGES,
  GATE_LABELS,
  type ApprovalSummaryDTO,
  type InitiativeStatus,
  type LifecycleStage,
  type StageProgress,
} from "@techgens/core";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  Circle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from "lucide-react";
import { formatDate, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export function stageShortTitle(stage: LifecycleStage): string {
  const title = STAGES[stage]?.title ?? humanize(stage);
  return title.split(":")[0]?.trim() ?? title;
}

export function stageIndexOf(stage: LifecycleStage): number {
  return Math.max(0, LIFECYCLE_STAGES.indexOf(stage));
}

/** Compact 11-segment lifecycle progress bar for initiative summaries. */
export function StageBar({
  stage,
  status,
  waitingOnCeo = false,
  className,
}: {
  stage: LifecycleStage;
  status: InitiativeStatus;
  waitingOnCeo?: boolean;
  className?: string;
}) {
  const current = stageIndexOf(stage);
  const completed = status === "completed";
  return (
    <div
      role="img"
      aria-label={`Lifecycle stage ${current + 1} of ${LIFECYCLE_STAGES.length}: ${STAGES[stage]?.title ?? stage}${waitingOnCeo ? " (awaiting CEO approval)" : ""}`}
      className={cn("flex items-center gap-[3px]", status === "cancelled" && "opacity-40", className)}
    >
      {LIFECYCLE_STAGES.map((s, i) => {
        const state = completed || i < current ? "done" : i === current ? "active" : "pending";
        return (
          <span
            key={s}
            title={STAGES[s].title}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              state === "done" && "bg-accent/60",
              state === "active" &&
                (waitingOnCeo ? "bg-amber-400" : status === "paused" ? "bg-amber-400/70" : "bg-accent"),
              state === "pending" && "meter-track",
            )}
          />
        );
      })}
    </div>
  );
}

const STATE_STYLES: Record<
  StageProgress["state"],
  { icon: typeof Circle; ring: string; text: string; label: string }
> = {
  done: {
    icon: CircleCheck,
    ring: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    text: "text-fg",
    label: "Done",
  },
  active: {
    icon: CircleDot,
    ring: "border-accent/60 bg-accent/15 text-accent shadow-[0_0_18px_-4px_rgba(34,211,238,0.7)]",
    text: "text-fg",
    label: "In progress",
  },
  pending: {
    icon: Circle,
    ring: "border-border-strong bg-surface-2 text-subtle",
    text: "text-muted",
    label: "Not started",
  },
  skipped: {
    icon: CircleDashed,
    ring: "border-border bg-transparent text-subtle/70",
    text: "text-subtle line-through",
    label: "Skipped",
  },
};

export type GateState =
  "approved" | "waiting" | "revision" | "rejected" | "withdrawn" | "upcoming" | "skipped";

const GATE_STYLES: Record<GateState, { icon: LucideIcon; badge: string; text: string; label: string }> = {
  approved: {
    icon: ShieldCheck,
    badge: "border-emerald-400/50 bg-[#06190f] text-emerald-300",
    text: "text-emerald-300/90",
    label: "Approved",
  },
  waiting: {
    icon: ShieldAlert,
    badge: "border-amber-400/60 bg-[#1b1608] text-amber-300 motion-safe:animate-pulse",
    text: "text-amber-300",
    label: "Waiting on you",
  },
  revision: {
    icon: ShieldAlert,
    badge: "border-sky-400/50 bg-[#071824] text-sky-300",
    text: "text-sky-300/90",
    label: "In revision",
  },
  rejected: {
    icon: ShieldX,
    badge: "border-rose-400/50 bg-[#1d0a10] text-rose-300",
    text: "text-rose-300/90",
    label: "Rejected",
  },
  withdrawn: {
    icon: Shield,
    badge: "border-border bg-surface text-subtle/70",
    text: "text-subtle/70",
    label: "Withdrawn",
  },
  upcoming: {
    icon: Shield,
    badge: "border-border-strong bg-surface text-subtle",
    text: "text-subtle",
    label: "Upcoming gate",
  },
  skipped: {
    icon: Shield,
    badge: "border-border bg-surface text-subtle/70",
    text: "text-subtle/70",
    label: "Gate skipped",
  },
};

/** Derives a gate's state from the stage progress and the initiative's approvals (newest first or unsorted). */
export function gateStateFor(
  stage: StageProgress,
  approvals: readonly ApprovalSummaryDTO[] | undefined,
): { state: GateState; approval?: ApprovalSummaryDTO } | null {
  if (!stage.gate) return null;
  const ofKind = (approvals ?? [])
    .filter((a) => a.kind === stage.gate)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = ofKind[0];
  if (latest?.status === "pending") return { state: "waiting", approval: latest };
  if (stage.state === "done") {
    const approved = ofKind.find((a) => a.status === "approved");
    return approved ? { state: "approved", approval: approved } : { state: "approved" };
  }
  if (stage.state === "skipped") return { state: "skipped" };
  if (latest?.status === "rejected") return { state: "rejected", approval: latest };
  if (latest?.status === "changes_requested") return { state: "revision", approval: latest };
  if (latest?.status === "cancelled") return { state: "withdrawn", approval: latest };
  if (latest?.status === "approved") return { state: "approved", approval: latest };
  return { state: "upcoming" };
}

function gateDetail(gate: { state: GateState; approval?: ApprovalSummaryDTO }): string {
  const label = GATE_STYLES[gate.state].label;
  const decidedAt = gate.approval?.decidedAt;
  return gate.state === "approved" && decidedAt ? `${label} · ${formatDate(decidedAt)}` : label;
}

/**
 * Stage-gate stepper for an initiative. Sized by its container (not the viewport): one row of 11 steps when there is
 * room (≥ 56rem), otherwise 6 + 5 rows, or 4 per row on very narrow cards — never horizontal scrolling.
 */
export function LifecycleStepper({
  stages,
  approvals,
  className,
}: {
  stages: readonly StageProgress[];
  /** The initiative's approvals, used to show whether each CEO gate is approved, waiting or upcoming. */
  approvals?: readonly ApprovalSummaryDTO[];
  className?: string;
}) {
  const gates = stages.map((s) => gateStateFor(s, approvals));
  const present = new Set<GateState>(gates.flatMap((g) => (g ? [g.state] : [])));
  const legend = (["approved", "waiting", "revision", "rejected", "withdrawn", "upcoming"] as const).filter(
    (state) => present.has(state),
  );
  return (
    <div className={cn("@container", className)}>
      <ol
        className="grid grid-cols-4 gap-y-5 @lg:grid-cols-6 @4xl:grid-cols-11"
        aria-label="Lifecycle stages"
      >
        {stages.map((s, i) => {
          const style = STATE_STYLES[s.state] ?? STATE_STYLES.pending;
          const Icon = style.icon;
          const def = STAGES[s.stage];
          const next = stages[i + 1];
          const gate = gates[i];
          const gateStyle = gate ? GATE_STYLES[gate.state] : null;
          const GateIcon = gateStyle?.icon ?? ShieldCheck;
          const gateLabel = s.gate ? GATE_LABELS[s.gate] : "";
          // Connectors join steps in the same row, so hide them at each layout's row end.
          const connectorVisibility = cn(
            i % 4 === 3 ? "hidden" : "block",
            i % 6 === 5 ? "@lg:hidden" : "@lg:block",
            "@4xl:block",
          );
          return (
            <li
              key={s.stage}
              className="relative flex min-w-0 flex-col items-center px-1 text-center"
              aria-current={s.state === "active" ? "step" : undefined}
            >
              {next ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[17px] right-[calc(-50%+22px)] left-[calc(50%+22px)] h-0.5 rounded-full",
                    s.state === "done" && (next.state === "done" || next.state === "active")
                      ? "bg-emerald-400/50"
                      : "bg-border-strong",
                    connectorVisibility,
                  )}
                />
              ) : null}
              <Tooltip
                align={i === 0 ? "start" : next ? "center" : "end"}
                content={
                  <span className="block text-left">
                    <span className="block font-medium">{s.title || def?.title}</span>
                    {def ? <span className="block text-muted">Owner: {humanize(def.ownerRole)}</span> : null}
                    {gate && gateStyle ? (
                      <span className={cn("block", gateStyle.text)}>
                        CEO gate: {gateLabel} — {gateDetail(gate)}
                      </span>
                    ) : null}
                    <span className="block text-muted">{style.label}</span>
                  </span>
                }
              >
                <span
                  tabIndex={0}
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-full border",
                    style.ring,
                  )}
                  aria-label={`${s.title || def?.title}: ${style.label}${gate ? `. CEO gate ${gateLabel}: ${gateDetail(gate)}` : ""}`}
                >
                  <Icon aria-hidden className="size-4" />
                  {gate && gateStyle ? (
                    <span
                      className={cn(
                        "absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border",
                        gateStyle.badge,
                      )}
                    >
                      <GateIcon aria-hidden className="size-2.5" />
                    </span>
                  ) : null}
                </span>
              </Tooltip>
              <span
                className={cn("mt-2 max-w-full break-words text-xs font-medium leading-tight", style.text)}
              >
                {stageShortTitle(s.stage)}
              </span>
              {gate && gateStyle ? (
                gate.state === "waiting" && gate.approval ? (
                  <Link
                    href={`/approvals?id=${gate.approval.id}`}
                    className={cn(
                      "mt-0.5 max-w-full break-words text-[11px] font-medium leading-tight underline-offset-2 hover:underline",
                      gateStyle.text,
                    )}
                  >
                    {gateLabel} · Review
                    <span className="sr-only"> (waiting on you)</span>
                  </Link>
                ) : (
                  <span
                    className={cn("mt-0.5 max-w-full break-words text-[11px] leading-tight", gateStyle.text)}
                  >
                    {gateLabel}
                    <span className="sr-only"> — {gateDetail(gate)}</span>
                  </span>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
      {legend.length > 0 ? (
        <ul
          aria-label="Gate legend"
          className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted"
        >
          {legend.map((state) => {
            const legendStyle = GATE_STYLES[state];
            const LegendIcon = legendStyle.icon;
            return (
              <li key={state} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    legendStyle.badge.replace("motion-safe:animate-pulse", ""),
                  )}
                >
                  <LegendIcon className="size-2.5" />
                </span>
                {state === "upcoming" ? "Upcoming CEO gate" : legendStyle.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
