import { periodStart, type BudgetDTO, type BudgetPeriod } from "@techgens/core";
import { credits } from "@/lib/format";
import { asNumber, asString } from "@/lib/utils";

const PERIODS: readonly BudgetPeriod[] = ["day", "week", "month", "total"];

export interface OverrunFacts {
  budgetId: string | null;
  scopeName: string | null;
  period: BudgetPeriod | null;
  /** Effective limit for the current window (live budget when available, else the payload snapshot). */
  limitCredits: number | null;
  spentCredits: number | null;
  windowEndsAt: Date | null;
  suggestedExtraCredits: number | null;
}

function asPeriod(value: unknown): BudgetPeriod | null {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value)
    ? (value as BudgetPeriod)
    : null;
}

/** End of the accounting window that contains `now` (UTC), or null for lifetime ("total") budgets. */
export function windowEnd(period: BudgetPeriod, now: Date = new Date()): Date | null {
  const start = periodStart(period, now);
  switch (period) {
    case "day":
      return new Date(start.getTime() + 24 * 60 * 60 * 1000);
    case "week":
      return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    case "total":
      return null;
  }
}

/**
 * Reads a budget-overrun approval defensively: the richer payload (scopeName, period, limitCredits, spentCredits,
 * windowEndsAt, suggestedExtraCredits) when present, otherwise the live budget and the summary text.
 */
export function readOverrun(
  payload: Record<string, unknown>,
  summary: string,
  budget: BudgetDTO | undefined,
  now: Date = new Date(),
): OverrunFacts {
  const fromSummary = (pattern: RegExp) => {
    const match = pattern.exec(summary);
    return match?.[1] !== undefined ? asNumber(match[1]) : undefined;
  };
  const summaryPeriod = /\(\s*[a-z]+\s*·\s*(day|week|month|total)\s*\)/i.exec(summary)?.[1]?.toLowerCase();
  const period = asPeriod(payload.period) ?? budget?.period ?? asPeriod(summaryPeriod);
  const explicitEnd = asString(payload.windowEndsAt);
  const parsedEnd = explicitEnd ? new Date(explicitEnd) : null;
  return {
    budgetId: asString(payload.budgetId) ?? budget?.id ?? null,
    scopeName: asString(payload.scopeName) ?? budget?.scopeLabel ?? null,
    period,
    limitCredits:
      (budget ? budget.limitCredits + (budget.grantedCredits ?? 0) : undefined) ??
      (asNumber(payload.limitCredits) !== undefined
        ? asNumber(payload.limitCredits)! + (asNumber(payload.grantedCredits) ?? 0)
        : undefined) ??
      fromSummary(/of\s+([\d.]+)\s+(?:AI\s+)?credits/i) ??
      null,
    spentCredits:
      budget?.spentCredits ?? asNumber(payload.spentCredits) ?? fromSummary(/spent\s+([\d.]+)/i) ?? null,
    windowEndsAt:
      parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : period ? windowEnd(period, now) : null,
    suggestedExtraCredits:
      asNumber(payload.suggestedExtraCredits) ??
      asNumber(payload.suggestedCredits) ??
      fromSummary(/suggested:?\s*([\d.]+)/i) ??
      null,
  };
}

/** "00:00 UTC" when the window ends within a day, otherwise "Mon, Nov 10, 00:00 UTC". */
export function formatWindowEnd(end: Date, now: Date = new Date()): string {
  const time = end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (end.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) return `${time} UTC`;
  const day = end.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day}, ${time} UTC`;
}

const WINDOW_NAME: Record<BudgetPeriod, string> = {
  day: "today's limit",
  week: "this week's limit",
  month: "this month's limit",
  total: "the total limit",
};

/** Live consequence of a grant: "Grants 10 credits until 00:00 UTC; today's limit becomes 10.07." */
export function grantConsequence(extra: number, facts: OverrunFacts, now: Date = new Date()): string {
  const until = facts.windowEndsAt ? ` until ${formatWindowEnd(facts.windowEndsAt, now)}` : "";
  const limit =
    facts.limitCredits !== null
      ? `; ${facts.period ? WINDOW_NAME[facts.period] : "the limit"} becomes ${credits(facts.limitCredits + extra)}`
      : "";
  return `Grants ${credits(extra)} credits${until}${limit}.`;
}
