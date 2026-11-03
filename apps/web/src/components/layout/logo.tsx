import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a gradient referenced from a hidden (display: none) copy would not render.
  const gradientId = `tg-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="#0b1522"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
      />
      <path
        d="M9 10.5h14M16 10.5v12"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="23" cy="21.5" r="2.2" fill="#22d3ee" />
      <circle cx="9" cy="21.5" r="1.4" fill="#6366f1" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className={cn("leading-none", collapsed && "sr-only")}>
        <div className="text-[15px] font-semibold tracking-tight text-fg">Techgens</div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
          Command Center
        </div>
      </div>
    </div>
  );
}
