"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number | undefined;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "sm",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-[#0a1019] p-0.5",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const index = options.findIndex((o) => o.value === value);
        const next =
          options[(index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
        if (next) {
          onChange(next.value);
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
          buttons[options.indexOf(next)]?.focus();
        }
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors [&_svg]:size-3.5",
              size === "xs" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs sm:text-sm",
              active
                ? "bg-surface-3 text-fg shadow-sm ring-1 ring-border-strong"
                : "text-muted hover:text-fg",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("tabular-nums text-xs", active ? "text-accent" : "text-subtle")}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
