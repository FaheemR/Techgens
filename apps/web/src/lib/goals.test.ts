import { describe, expect, it } from "vitest";
import type { GoalDTO } from "@techgens/core";
import {
  buildObjectiveTree,
  formatGoalValue,
  goalProgress,
  keyResultWarning,
  objectiveProgress,
} from "./goals";

const goal = (patch: Partial<GoalDTO> = {}): GoalDTO => ({
  id: "kr",
  parentId: null,
  productId: null,
  initiativeId: null,
  type: "key_result",
  title: "Retention",
  description: "",
  startValue: 35,
  targetValue: 60,
  currentValue: 35,
  unit: "%",
  dueDate: null,
  status: "on_track",
  ...patch,
});

describe("goal baseline progress", () => {
  it.each([
    { name: "baseline", currentValue: 35, expected: 0 },
    { name: "midpoint", currentValue: 47.5, expected: 0.5 },
    { name: "target", currentValue: 60, expected: 1 },
    { name: "regression", currentValue: 20, expected: 0 },
    { name: "overshoot", currentValue: 85, expected: 2 },
  ])("measures ascending progress at $name", ({ currentValue, expected }) => {
    expect(goalProgress(goal({ currentValue }))).toBe(expected);
  });

  it.each([
    { name: "baseline", currentValue: 60, expected: 0 },
    { name: "midpoint", currentValue: 47.5, expected: 0.5 },
    { name: "target", currentValue: 35, expected: 1 },
    { name: "wrong direction", currentValue: 65, expected: 0 },
    { name: "overshoot", currentValue: 10, expected: 2 },
  ])("measures descending progress at $name", ({ currentValue, expected }) => {
    expect(goalProgress(goal({ startValue: 60, targetValue: 35, currentValue }))).toBe(expected);
  });

  it("uses zero for both null and omitted legacy baselines", () => {
    expect(goalProgress(goal({ startValue: null, targetValue: 60, currentValue: 30 }))).toBe(0.5);
    const { startValue: _baseline, ...legacy } = goal({ targetValue: 60, currentValue: 30 });
    expect(goalProgress(legacy as GoalDTO)).toBe(0.5);
  });

  it("distinguishes a valid zero target from an equal or missing target", () => {
    expect(goalProgress(goal({ startValue: 10, targetValue: 0, currentValue: 5 }))).toBe(0.5);
    for (const patch of [
      { startValue: 0, targetValue: 0 },
      { targetValue: 35 },
      { targetValue: null },
      { currentValue: null },
    ]) {
      expect(goalProgress(goal(patch))).toBeNull();
      expect(goalProgress(goal({ ...patch, status: "achieved" }))).toBe(1);
    }
  });

  it("averages measurable key results with each capped and falls back to the objective", () => {
    const objective = goal({ type: "objective", currentValue: 47.5 });
    expect(
      objectiveProgress(objective, [
        goal({ currentValue: 85 }),
        goal({ currentValue: 35 }),
        goal({ currentValue: null }),
      ]),
    ).toBe(0.5);
    expect(objectiveProgress(objective, [])).toBe(0.5);
    expect(objectiveProgress(objective, [goal({ currentValue: null })])).toBe(0.5);
  });

  it("groups only matching children and preserves orphan key results", () => {
    const objective = goal({ id: "objective", type: "objective" });
    const child = goal({ id: "child", parentId: objective.id, currentValue: 47.5 });
    const orphan = goal({ id: "orphan", parentId: "missing" });
    const unparented = goal({ id: "unparented" });
    expect(buildObjectiveTree([child, orphan, objective, unparented])).toEqual({
      objectives: [{ objective, keyResults: [child], progress: 0.5 }],
      orphans: [orphan, unparented],
    });
  });

  it("warns only when on-track objectives contradict child statuses", () => {
    const children = [
      goal({ status: "off_track" }),
      goal({ status: "off_track" }),
      goal({ status: "at_risk" }),
    ];
    expect(keyResultWarning(goal(), children)).toBe("2 key results off track, 1 at risk");
    expect(keyResultWarning(goal(), [goal({ status: "at_risk" })])).toBe("1 key result at risk");
    expect(keyResultWarning(goal(), [goal({ status: "off_track" })])).toBe("1 key result off track");
    expect(keyResultWarning(goal({ status: "at_risk" }), children)).toBeNull();
    expect(keyResultWarning(goal(), [goal()])).toBeNull();
  });

  it("formats zero fractional currency and absent goal values", () => {
    expect(formatGoalValue(null, "%")).toBe("—");
    expect(formatGoalValue(0, "%")).toBe("0%");
    expect(formatGoalValue(47.5, "%")).toBe("47.5%");
    expect(formatGoalValue(3.125, "$")).toBe("$3.13");
    expect(formatGoalValue(12, "users")).toBe("12 users");
    expect(formatGoalValue(12, null)).toBe("12");
  });
});
