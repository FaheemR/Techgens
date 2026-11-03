import {
  LIFECYCLE_STAGES,
  STAGES,
  GATE_LABELS,
  type InitiativeStatus,
  type LifecycleStage,
  type StageProgress,
} from "@techgens/core";
import { CircleCheck, CircleDashed, CircleDot, Circle, ShieldCheck } from "lucide-react";
import { humanize } from "@/lib/format";
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

/**
 * Stage-gate stepper for an initiative. Sized by its container (not the viewport): one row of 11 steps when there is
 * room (≥ 56rem), otherwise 6 + 5 rows, or 4 per row on very narrow cards — never horizontal scrolling.
 */
export function LifecycleStepper({
  stages,
  className,
}: {
  stages: readonly StageProgress[];
  className?: string;
}) {
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
                    {s.gate ? (
                      <span className="block text-amber-300">CEO gate: {GATE_LABELS[s.gate]}</span>
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
                  aria-label={`${s.title || def?.title}: ${style.label}${s.gate ? `, requires CEO approval (${GATE_LABELS[s.gate]})` : ""}`}
                >
                  <Icon aria-hidden className="size-4" />
                  {s.gate ? (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border border-amber-400/40 bg-[#1b1608]">
                      <ShieldCheck aria-hidden className="size-2.5 text-amber-300" />
                    </span>
                  ) : null}
                </span>
              </Tooltip>
              <span
                className={cn("mt-2 max-w-full break-words text-xs font-medium leading-tight", style.text)}
              >
                {stageShortTitle(s.stage)}
              </span>
              {s.gate ? (
                <span className="mt-0.5 max-w-full break-words text-[10px] leading-tight text-amber-300/90">
                  {GATE_LABELS[s.gate]}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
