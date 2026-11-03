import type { GoalDTO } from "@techgens/core";
import { TriangleAlert } from "lucide-react";
import { keyResultWarning } from "@/lib/goals";
import { cn } from "@/lib/utils";

/** Visible when an objective says "On track" while some of its key results don't. */
export function KeyResultWarning({
  objective,
  keyResults,
  className,
}: {
  objective: GoalDTO;
  keyResults: readonly GoalDTO[];
  className?: string;
}) {
  const warning = keyResultWarning(objective, keyResults);
  if (!warning) return null;
  return (
    <p className={cn("mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-300", className)}>
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        {warning}
        <span className="font-normal text-amber-200/80"> — the objective is still marked on track</span>
      </span>
    </p>
  );
}
