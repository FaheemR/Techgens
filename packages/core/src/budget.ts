import type { BudgetPeriod } from "./domain";

/** Copilot reports usage in nano AI units; 1 AI credit = 1e9 nano-AIU (per Copilot SDK usage docs). */
export const NANO_AIU_PER_CREDIT = 1_000_000_000;

export function nanoToCredits(nanoAiu: number): number {
  return nanoAiu / NANO_AIU_PER_CREDIT;
}

export function creditsToNano(credits: number): number {
  return Math.round(credits * NANO_AIU_PER_CREDIT);
}

export type BudgetState = "ok" | "warn" | "exceeded";

export interface BudgetEvaluation {
  state: BudgetState;
  spentCredits: number;
  limitCredits: number;
  /** 0..n (can exceed 1). */
  ratio: number;
}

export function evaluateBudget(spentNanoAiu: number, limitCredits: number, warnPct = 80): BudgetEvaluation {
  const spentCredits = nanoToCredits(spentNanoAiu);
  if (limitCredits <= 0) {
    return { state: spentCredits > 0 ? "exceeded" : "ok", spentCredits, limitCredits, ratio: spentCredits > 0 ? Infinity : 0 };
  }
  const ratio = spentCredits / limitCredits;
  const state: BudgetState = ratio >= 1 ? "exceeded" : ratio * 100 >= warnPct ? "warn" : "ok";
  return { state, spentCredits, limitCredits, ratio };
}

/** Start of the accounting window (UTC) containing `now`. `total` windows start at the epoch. */
export function periodStart(period: BudgetPeriod, now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (period) {
    case "day":
      return d;
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7; // Monday-based weeks
      d.setUTCDate(d.getUTCDate() - dow);
      return d;
    }
    case "month":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "total":
      return new Date(0);
  }
}

export function formatCredits(credits: number): string {
  if (credits === 0) return "0";
  if (Math.abs(credits) < 0.01) return credits.toFixed(4);
  if (Math.abs(credits) < 10) return credits.toFixed(2);
  return credits.toFixed(1);
}
