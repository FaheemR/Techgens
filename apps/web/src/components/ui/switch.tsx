"use client";

import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}

export function Switch({ checked, onCheckedChange, label, id, disabled, className, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={aria["aria-describedby"]}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
        // Invisible 28px-tall hit area around the 20px track (WCAG 2.5.8).
        "before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-accent/60 bg-accent/80" : "border-control bg-surface-3 hover:border-subtle",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-3.5 rounded-full shadow transition-transform",
          checked ? "translate-x-[18px] bg-accent-fg" : "translate-x-[3px] bg-slate-300",
        )}
      />
    </button>
  );
}
