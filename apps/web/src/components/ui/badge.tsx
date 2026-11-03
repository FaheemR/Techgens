import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { TONE_BADGE, TONE_DOT, type Tone } from "@/lib/labels";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  size?: "sm" | "md";
}

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  size = "sm",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px] leading-4" : "px-2.5 py-1 text-xs",
        TONE_BADGE[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span className="relative flex size-1.5 shrink-0">
          {pulse ? (
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping-brief",
                TONE_DOT[tone],
              )}
            />
          ) : null}
          <span className={cn("relative inline-flex size-1.5 rounded-full", TONE_DOT[tone])} />
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function CountBadge({
  count,
  tone = "warning",
  max = 99,
  className,
}: {
  count: number;
  tone?: Tone;
  /** Larger counts render as "{max}+". */
  max?: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        tone === "danger"
          ? "bg-danger text-white"
          : tone === "accent"
            ? "bg-accent text-accent-fg"
            : "bg-amber-400 text-amber-950",
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
