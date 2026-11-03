import { describe, expect, it } from "vitest";
import { evaluateBudget, periodStart, creditsToNano, nanoToCredits } from "./budget";
import { nextStage, STAGES, LIFECYCLE_STAGES, isGateEnabled } from "./lifecycle";
import { fillTemplate, slugify } from "./util";

describe("lifecycle", () => {
  it("walks every stage in order", () => {
    const seen: string[] = ["intake"];
    let s = nextStage("intake");
    while (s) {
      seen.push(s);
      s = nextStage(s);
    }
    expect(seen).toEqual([...LIFECYCLE_STAGES]);
  });

  it("skips repo stages when there is no repository, and explicit skips", () => {
    expect(nextStage("architecture", { hasRepo: false })).toBeNull();
    expect(nextStage("discovery", { skip: ["definition", "design"] })).toBe("architecture");
  });

  it("gates the expected stages", () => {
    const gated = LIFECYCLE_STAGES.filter((s) => STAGES[s].gate).map((s) => STAGES[s].gate);
    expect(gated).toEqual(["vision_roadmap", "spec", "architecture", "merge_to_main", "prod_deploy"]);
  });

  it("defaults all gates on and honours policy overrides", () => {
    expect(isGateEnabled(undefined, "spec")).toBe(true);
    expect(isGateEnabled({ spec: false }, "spec")).toBe(false);
  });
});

describe("budget", () => {
  it("converts nano-AIU", () => {
    expect(nanoToCredits(creditsToNano(2.5))).toBe(2.5);
  });

  it("evaluates thresholds", () => {
    expect(evaluateBudget(creditsToNano(5), 10).state).toBe("ok");
    expect(evaluateBudget(creditsToNano(8), 10).state).toBe("warn");
    expect(evaluateBudget(creditsToNano(10), 10).state).toBe("exceeded");
    expect(evaluateBudget(0, 0).state).toBe("ok");
  });

  it("computes UTC period starts", () => {
    const now = new Date("2026-11-05T15:30:00Z"); // Thursday
    expect(periodStart("day", now).toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(periodStart("week", now).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(periodStart("month", now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("util", () => {
  it("fills templates and slugifies", () => {
    expect(fillTemplate("Hi {{name}} {{missing}}", { name: "Ada" })).toBe("Hi Ada {{missing}}");
    expect(slugify("  InvoiceLite: MVP!  ")).toBe("invoicelite-mvp");
  });
});
