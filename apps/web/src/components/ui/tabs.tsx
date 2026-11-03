"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number | undefined;
}

export function Tabs({
  tabs,
  value,
  onChange,
  idBase,
  label,
  className,
  variant = "underline",
}: {
  tabs: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  idBase: string;
  label: string;
  className?: string;
  variant?: "underline" | "pills";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === value);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) {
      onChange(tab.id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "flex max-w-full items-center overflow-x-auto",
        variant === "underline"
          ? "gap-1 border-b border-border"
          : "gap-1 rounded-lg border border-border bg-[#0a1019] p-1",
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-3 py-2.5",
                    selected
                      ? "border-accent text-fg"
                      : "border-transparent text-muted hover:border-border-strong hover:text-fg",
                  )
                : cn(
                    "rounded-md px-3 py-1.5",
                    selected ? "bg-surface-3 text-fg ring-1 ring-border-strong" : "text-muted hover:text-fg",
                  ),
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  selected ? "bg-accent/15 text-accent" : "bg-white/5 text-subtle",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  id,
  children,
  className,
}: {
  idBase: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${id}`}
      aria-labelledby={`${idBase}-tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}
