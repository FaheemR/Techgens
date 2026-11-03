import { DEFAULT_INITIATIVE_BUDGET_CREDITS } from "@techgens/core";

/**
 * How the demo Chief of Staff reads a CEO chat message (the Copilot-backed agent follows the same rules from its role
 * prompt): questions get an answer, directives become initiatives with a short title and an explicit total budget cap.
 */

const QUESTION_START = /^(?:what|how|why|when|where|who|which|is|are|can|could|should|does|did|status)\b/i;
/** "Do/show/list" are also imperatives ("Do a competitive analysis…", "List the risks… and propose mitigations"). */
const ASKING_IMPERATIVE =
  /^(?:do\s+(?:we|you|i|they|our)\b|show\s+me\b|(?:show|list)\s+(?:(?:all|the|our|my|open|pending|active|current)\s+)*(?:initiatives?|approvals?|agents?|budgets?|spend|costs?|incidents?|deployments?|tasks?|work(?:\s+items?)?|goals?|okrs?|products?|documents?|jobs?)\b)/i;
const STATUS_REQUEST =
  /^(?:(?:please\s+)?(?:give|send|tell)\s+me\b|brief\s+me\b|any\s+(?:news|updates?)\b|where\s+are\s+we\b)|\b(?:status|progress)\s+(?:report|update)\b/i;

/** Questions and status requests are answered directly; they never create work. */
export function isQuestion(message: string): boolean {
  const text = message.trim();
  return (
    text.endsWith("?") ||
    QUESTION_START.test(text) ||
    ASKING_IMPERATIVE.test(text) ||
    STATUS_REQUEST.test(text)
  );
}

const LEAD_IN =
  /^(?:please|kindly|let's|lets|we need to|we should|i want (?:you )?to|i'd like (?:you )?to)\s+/i;
const BUILD_VERB = /^(?:build|launch|create|ship|develop|make|add|extend|improve|redesign|rebuild)\b/i;
/** A capitalised name right after the leading build verb: "Build InvoiceLite: …". */
const NAMED_PRODUCT = /^(?:[Bb]uild|[Ll]aunch|[Cc]reate|[Ss]hip|[Dd]evelop)\s+([A-Z][\w-]+)/;
const NOT_A_NAME = /^(?:A|An|The|Our|My|It|This|That|CEO|MVP)$/;
/** A CamelCase name the directive builds for: "… a client portal for InvoiceLite …" (well-known vendors excluded). */
const REFERENCED_PRODUCT = /\b(?:for|to|in|into|on|of)\s+([A-Z][a-z0-9]+[A-Z][\w-]*)/g;
const VENDORS = new Set([
  "GitHub",
  "GitLab",
  "LinkedIn",
  "YouTube",
  "PayPal",
  "WordPress",
  "HubSpot",
  "QuickBooks",
  "JavaScript",
  "TypeScript",
  "PostgreSQL",
  "OpenAI",
  "ChatGPT",
  "SendGrid",
  "DocuSign",
  "MailChimp",
  "WhatsApp",
  "TikTok",
  "iPhone",
  "DevOps",
]);
const CLAUSE_BREAK = /[:;.!?\n]|,|\s[—–-]\s|\s(?:so|that|which|because|where|while|and then)\s/;
const TRAILING_DETAILS =
  /\s+(?:(?:in|within|over|by|before)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[\s-]*(?:days?|weeks?|months?)|with\s+(?:a\s+)?budget\b.*|(?:on|by|before)\s+\d{4}-\d{2}-\d{2})$/i;
const TRAILING_FILLER =
  /\s+(?:a|an|the|and|or|but|so|that|to|for|of|with|in|on|at|by|from|into|via|as|per|which|who|whether|if|than|our|their|its|we|you|they|it|is|are|be|will|should|can|could|would)$/i;
/** Words a long clause can be cut before without losing its meaning: "Research the market | and recommend …". */
const PHRASE_BREAK = /^(?:and|with|for|to|in|on|by|using|via|including|across)$/i;

export const MAX_TITLE_LENGTH = 60;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive mention of `name` in `text`. */
const mentions = (text: string, name: string) =>
  new RegExp(`(?:^|\\W)${escapeRegExp(name)}(?:\\W|$)`, "i").test(text);

/**
 * Fits a clause into `max` characters without cutting mid-sentence where possible: the longest prefix (≥ 3 words) that
 * ends before a phrase break ("and", "with", "for", …); otherwise a word-boundary cut. Never ends on a preposition,
 * article, conjunction or pronoun.
 */
export function shortenTitle(text: string, max = MAX_TITLE_LENGTH): string {
  let title = text.replace(/\s+/g, " ").trim();
  if (title.length > max) {
    const words = title.split(" ");
    let phrase = "";
    let cut = "";
    for (let i = 0; i < words.length; i++) {
      const next = `${cut} ${words[i]}`.trim();
      if (next.length > max) break;
      cut = next;
      if (i >= 2 && PHRASE_BREAK.test(words[i + 1] ?? "")) phrase = cut;
    }
    title = phrase || cut || words[0]!.slice(0, max);
  }
  while (TRAILING_FILLER.test(title)) title = title.replace(TRAILING_FILLER, "");
  return capitalize(title);
}

export interface DirectiveTitle {
  /** ≤ 60 characters, from the directive's first clause; never cut mid-word or on a preposition. */
  title: string;
  /** Product the directive builds or extends; undefined when it implies none (research, strategy, …). */
  product?: string;
  /** True when `product` is one of `existingProducts`. */
  existingProduct: boolean;
}

/** Initiative title and the product it belongs to (an existing product it mentions, a named or an implied new one). */
export function deriveTitle(directive: string, existingProducts: readonly string[] = []): DirectiveTitle {
  const text = directive.trim().replace(LEAD_IN, "");
  const existing = existingProducts.find((p) => mentions(text, p));
  const named = NAMED_PRODUCT.exec(text)?.[1];
  if (named && !NOT_A_NAME.test(named)) {
    const match = existingProducts.find((p) => p.toLowerCase() === named.toLowerCase());
    return {
      title: shortenTitle(`${match ?? named} MVP`),
      product: match ?? named,
      existingProduct: Boolean(match),
    };
  }
  let clause = (text.split(CLAUSE_BREAK)[0] ?? text).trim();
  // Timeline and budget details belong in the charter, not the name ("… MVP in 8 weeks with a budget of …").
  while (TRAILING_DETAILS.test(clause)) clause = clause.replace(TRAILING_DETAILS, "").trim();
  clause ||= text;
  const title = shortenTitle(clause);
  if (existing) return { title, product: existing, existingProduct: true };
  const referenced = [...text.matchAll(REFERENCED_PRODUCT)]
    .map((m) => m[1]!)
    .find((name) => !VENDORS.has(name));
  if (referenced) return { title, product: referenced, existingProduct: false };
  if (!BUILD_VERB.test(text)) return { title, existingProduct: false };
  // A new product is implied by the build directive: name it after what is built ("Pet-sitting marketplace").
  const implied = title
    .replace(BUILD_VERB, "")
    .replace(/^\s*(?:a|an|the|our|my|new)\s+/i, "")
    .replace(/\s+(?:MVP|v\d+)$/i, "")
    .trim();
  return { title, product: implied ? capitalize(implied) : title, existingProduct: false };
}

type Unit = "day" | "week" | "month";
const UNIT_DAYS: Record<Unit, number> = { day: 1, week: 7, month: 30 };
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

function unitOf(word: string | undefined): Unit | null {
  const w = (word ?? "").toLowerCase();
  if (w.startsWith("da")) return "day";
  if (w.startsWith("w")) return "week";
  if (w.startsWith("mo")) return "month";
  return null;
}

const credits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export interface ParsedBudget {
  /** Total cap for the initiative, in AI credits. */
  credits: number;
  /** One sentence for the CEO stating how the cap was set. */
  explanation: string;
}

/**
 * Total budget cap from a directive. A rate ("400 credits/week") is multiplied by the timeline ("MVP in 6 weeks"); a
 * rate without a timeline becomes the total and the reply says so; no budget at all gets the default cap.
 */
export function parseBudget(
  directive: string,
  defaultCredits = DEFAULT_INITIATIVE_BUDGET_CREDITS,
): ParsedBudget {
  const amount =
    /(\d[\d,]*(?:\.\d+)?)\s*(?:ai\s+)?credits?\b(?:\s*(?:\/|per|a|an|each|every)\s*(day|week|month|wk|mo)\b|\s+(daily|weekly|monthly)\b)?/i.exec(
      directive,
    );
  const leadingRate =
    /\b(daily|weekly|monthly)\s+(?:budget|cap|spend)\b[^.\d]{0,20}(\d[\d,]*(?:\.\d+)?)\s*(?:ai\s+)?credits?\b/i.exec(
      directive,
    );
  const value = Number((leadingRate?.[2] ?? amount?.[1] ?? "").replace(/,/g, ""));
  if (!(value > 0)) {
    return {
      credits: defaultCredits,
      explanation: `No budget was given, so I set a total budget cap of ${credits(defaultCredits)} credits (the default) — tell me if you want a different cap.`,
    };
  }
  const rate = unitOf(leadingRate?.[1] ?? amount?.[2] ?? amount?.[3]);
  if (!rate) return { credits: value, explanation: `I set a total budget cap of ${credits(value)} credits.` };
  const duration =
    /\b(?:in|within|over|for)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[\s-]*(day|week|month)s?\b/i.exec(
      directive,
    ) ?? /\b(\d+)-(day|week|month)\b/i.exec(directive);
  const count = duration ? Number(NUMBER_WORDS[duration[1]!.toLowerCase()] ?? duration[1]) : NaN;
  const span = unitOf(duration?.[2]);
  if (!span || !(count > 0)) {
    return {
      credits: value,
      explanation: `I set a total budget cap of ${credits(value)} credits: you gave ${credits(value)} credits per ${rate} but no timeline, so I applied it as the total — tell me the duration and I'll raise the cap.`,
    };
  }
  const total = Math.round((value * count * UNIT_DAYS[span]) / UNIT_DAYS[rate]);
  return {
    credits: total,
    explanation: `I set a total budget cap of ${credits(total)} credits (${credits(value)} credits per ${rate} × ${count} ${span}${count === 1 ? "" : "s"}).`,
  };
}
