import { periodStart, type BudgetDTO, type BudgetPeriod, type BudgetScope } from "@techgens/core";
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
  const summaryPeriod = /\(\s*[a-z]+\s*·\s*(day|week|month|total)\b/i.exec(summary)?.[1]?.toLowerCase();
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
  return `Grants ${creditsLabel(extra)}${until}${limit}.`;
}

/** "1 credit", "2.5 credits". */
export function creditsLabel(value: number): string {
  return `${credits(value)} ${value === 1 ? "credit" : "credits"}`;
}

/**
 * Parses the "Extra credits" field exactly as typed: "10", "2.5", ".5", "1,5" (decimal comma) or "1,000" (thousands
 * separator, as the app displays numbers). At most two decimals, so the preview, the request and the toast agree.
 */
export function parseCreditsInput(text: string): { value: number | null; error: string | null } {
  const raw = text.trim().replace(/\s+/g, "");
  if (!raw) return { value: null, error: "Enter how many credits to grant." };
  let normalized = raw;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) normalized = raw.replace(/,/g, "");
  else if (/^\d*,\d+$/.test(raw)) normalized = raw.replace(",", ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    return { value: null, error: "Enter a number of credits, e.g. 10 or 2.5." };
  }
  if (/\.\d{3,}$/.test(normalized)) return { value: null, error: "Use at most two decimals." };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0)
    return { value: null, error: "Enter a positive number of credits." };
  return { value, error: null };
}

const SCOPES: readonly BudgetScope[] = ["company", "department", "agent", "product", "initiative"];
const SCOPE_NOUN: Record<BudgetScope, string> = {
  company: "Company",
  department: "Department",
  agent: "Agent",
  product: "Product",
  initiative: "Initiative",
};
const PERIOD_ADJECTIVE: Record<BudgetPeriod, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  total: "total",
};

/**
 * Who a budget overrun is about, for list rows and headers: "Agent · Grace — daily budget", "Company · daily budget",
 * "Initiative · InvoiceLite MVP — total budget". Uses `payload.scope`/`scopeName`/`period` when available (detail) and
 * falls back to the title ("Grace (…): day budget exceeded") and summary ("(agent · day …)") for list summaries.
 */
export function overrunScopeLabel(approval: {
  title: string;
  summary: string;
  payload?: Record<string, unknown> | undefined;
}): string | null {
  const payload = approval.payload ?? {};
  const fromSummary = /\(\s*([a-z]+)\s*·\s*(day|week|month|total)\b/i.exec(approval.summary);
  const fromTitle = /^(.*?):\s*(day|week|month|total) budget exceeded/i.exec(approval.title);
  const scopeText = (asString(payload.scope) ?? fromSummary?.[1] ?? "").toLowerCase();
  const scope = (SCOPES as readonly string[]).includes(scopeText) ? (scopeText as BudgetScope) : null;
  const period =
    asPeriod(payload.period) ??
    asPeriod(fromSummary?.[2]?.toLowerCase()) ??
    asPeriod(fromTitle?.[2]?.toLowerCase());
  let name = asString(payload.scopeName) ?? fromTitle?.[1]?.trim() ?? null;
  if (!scope && !name) return null;
  // Agent labels read "Grace (Engineering Manager / Tech Lead)"; the name is enough here.
  if (name && scope === "agent") name = name.replace(/\s*\(.*\)\s*$/, "");
  if (name && scope === "department") name = name.replace(/\s+department$/i, "");
  if (name && scope === "company" && /^company$/i.test(name)) name = null;
  const budget = period ? `${PERIOD_ADJECTIVE[period]} budget` : "budget";
  const noun = scope ? SCOPE_NOUN[scope] : null;
  if (noun && name) return `${noun} · ${name} — ${budget}`;
  if (noun) return `${noun} · ${budget}`;
  return `${name} — ${budget}`;
}
