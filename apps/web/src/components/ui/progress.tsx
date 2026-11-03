import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const BAR: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-500",
  accent: "bg-accent",
  violet: "bg-violet-400",
};

/** Progress bar. `value / max` is clamped for display; tone defaults to budget-style thresholds. */
export function Progress({
  value,
  max = 1,
  tone,
  warnAt = 0.8,
  label,
  className,
  size = "md",
}: {
  value: number;
  max?: number;
  tone?: Tone;
  warnAt?: number;
  label: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}) {
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  const resolved: Tone = tone ?? (ratio >= 1 ? "danger" : ratio >= warnAt ? "warning" : "accent");
  const pct = Math.round(Math.min(ratio, 1) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        "meter-track w-full overflow-hidden rounded-full",
        size === "xs" ? "h-1" : size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", BAR[resolved])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
