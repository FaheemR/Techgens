import type { GoalDTO } from "@techgens/core";

/** Progress of a key result (current / target), or null when not measurable. */
export function goalProgress(goal: GoalDTO): number | null {
  if (goal.targetValue === null || goal.targetValue === 0 || goal.currentValue === null) {
    return goal.status === "achieved" ? 1 : null;
  }
  return Math.max(0, goal.currentValue / goal.targetValue);
}

/** Objective progress: mean of its key results (each capped at 100%), falling back to its own values. */
export function objectiveProgress(objective: GoalDTO, keyResults: readonly GoalDTO[]): number | null {
  const values = keyResults.map(goalProgress).filter((v): v is number => v !== null);
  if (values.length > 0) return values.reduce((sum, v) => sum + Math.min(v, 1), 0) / values.length;
  return goalProgress(objective);
}

export interface ObjectiveTree {
  objective: GoalDTO;
  keyResults: GoalDTO[];
  progress: number | null;
}

/** Groups goals into objectives with nested key results. Orphan key results get a synthetic group. */
export function buildObjectiveTree(goals: readonly GoalDTO[]): {
  objectives: ObjectiveTree[];
  orphans: GoalDTO[];
} {
  const objectives = goals.filter((g) => g.type === "objective");
  const ids = new Set(objectives.map((o) => o.id));
  const tree = objectives.map((objective) => {
    const keyResults = goals.filter((g) => g.type === "key_result" && g.parentId === objective.id);
    return { objective, keyResults, progress: objectiveProgress(objective, keyResults) };
  });
  const orphans = goals.filter((g) => g.type === "key_result" && (!g.parentId || !ids.has(g.parentId)));
  return { objectives: tree, orphans };
}

export function formatGoalValue(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  if (!unit) return n;
  if (unit === "%") return `${n}%`;
  if (unit === "$" || unit === "€" || unit === "£") return `${unit}${n}`;
  return `${n} ${unit}`;
}
