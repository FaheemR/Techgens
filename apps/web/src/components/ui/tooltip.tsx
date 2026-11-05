import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Lightweight CSS tooltip shown on hover and keyboard focus. */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** Horizontal anchoring; use "start"/"end" for triggers near a container edge. */
  align?: "center" | "start" | "end";
  className?: string;
}) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })
    : children;
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {child}
      <span
        role="tooltip"
        id={id}
        className={cn(
          // Hidden tooltips take no layout space, so they can't widen their container or the page.
          "pointer-events-none absolute z-50 hidden w-max max-w-64 rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-xs font-normal leading-snug text-fg shadow-lg",
          "group-focus-within/tooltip:block group-hover/tooltip:block",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "center" ? "left-1/2 -translate-x-1/2" : align === "start" ? "left-0" : "right-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
