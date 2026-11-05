import type { ReactNode } from "react";
import type { ApprovalKind } from "@techgens/core";
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  FileDiff,
  GitCommitHorizontal,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { MarkdownView } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { credits, formatDateTime, humanize, relativeTime } from "@/lib/format";
import { humanizeKey } from "@/lib/labels";
import { asNumber, asString, cn, isRecord, isUrl } from "@/lib/utils";
import { formatWindowEnd, overrunScopeLabel } from "./budget-grant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys that hold identifiers: shown verbatim (never number-formatted) and folded into "Technical details". */
function isIdKey(key: string): boolean {
  return /(?:^id|Id|Ids|ID|IDs|_id|_ids)$/.test(key);
}

/** Keys like prNumber/issueNumber: shown as "#123", never as "1,003". */
function isNumberKey(key: string): boolean {
  return /Number$/.test(key);
}

function isUuidish(value: unknown): boolean {
  if (typeof value === "string") return UUID.test(value);
  return (
    Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && UUID.test(v))
  );
}

function hashNumber(value: unknown): string {
  return typeof value === "number" || typeof value === "string" ? `#${String(value).replace(/^#/, "")}` : "";
}

const LINK_LABELS: Record<string, string> = {
  prUrl: "View pull request",
  pullRequestUrl: "View pull request",
  releasePrUrl: "View release PR",
  runUrl: "View workflow run",
  workflowRunUrl: "View workflow run",
  deploymentUrl: "View deployment",
  environmentUrl: "Open environment",
  previewUrl: "Open preview",
  stagingUrl: "Open staging",
  productionUrl: "Open production",
  dashboardUrl: "Open monitoring dashboard",
  monitoringUrl: "Open monitoring dashboard",
  issueUrl: "View issue",
  repoUrl: "View repository",
  url: "Open link",
};

const FIELD_LABELS: Record<string, string> = {
  releasePrNumber: "Release PR",
  prNumber: "Pull request",
  pullRequestNumber: "Pull request",
  issueNumber: "Issue",
  runNumber: "Workflow run",
  sha: "Commit",
  commitSha: "Commit",
  runId: "Workflow run ID",
};

/** Payload key → label that keeps acronyms: "releasePrNumber" → "Release PR", "commitSha" → "Commit SHA". */
function labelFor(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // A number key names the thing it numbers ("#8" is shown as the value).
  if (/.Number$/.test(key)) return humanizeKey(key.replace(/Number$/, ""));
  if (/.Url$/.test(key)) return humanizeKey(key.replace(/Url$/, ""));
  return humanizeKey(key);
}

/** The number key shown on a link: "releasePrUrl" → "releasePrNumber", "runUrl" → "runNumber"/"runId". */
function numberKeyFor(urlKey: string, payload: Record<string, unknown>): string | null {
  const base = urlKey.replace(/Url$/, "");
  const candidates =
    urlKey === "runUrl" || urlKey === "workflowRunUrl"
      ? ["runNumber", "runId"]
      : urlKey === "prUrl" || urlKey === "pullRequestUrl"
        ? ["prNumber", "pullRequestNumber"]
        : [`${base}Number`];
  return (
    candidates.find(
      (k) => typeof payload[k] === "number" || (typeof payload[k] === "string" && payload[k]),
    ) ?? null
  );
}

function linkLabel(key: string, payload: Record<string, unknown>): string {
  const base = LINK_LABELS[key] ?? `Open ${labelFor(key).replace(/^\w/, (c) => c.toLowerCase())}`;
  const numberKey = numberKeyFor(key, payload);
  return numberKey ? `${base} ${hashNumber(payload[numberKey])}` : base;
}

type CheckState = "pass" | "fail" | "pending" | "neutral";

interface Check {
  name: string;
  state: CheckState;
}

const PASSED = ["success", "succeeded", "passed", "pass", "ok", "green"];
const FAILED = [
  "failure",
  "failed",
  "fail",
  "error",
  "errored",
  "timed_out",
  "cancelled",
  "action_required",
  "red",
];
const NEUTRAL = ["neutral", "skipped", "stale"];

function readChecks(value: unknown): Check[] | null {
  if (!Array.isArray(value)) return null;
  const checks: Check[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      checks.push({ name: item, state: "pending" });
      continue;
    }
    if (!isRecord(item)) return null;
    const name = asString(item.name) ?? asString(item.context) ?? "Check";
    const raw = (
      asString(item.conclusion) ??
      asString(item.state) ??
      asString(item.status) ??
      "pending"
    ).toLowerCase();
    const state: CheckState = PASSED.includes(raw)
      ? "pass"
      : FAILED.includes(raw)
        ? "fail"
        : NEUTRAL.includes(raw)
          ? "neutral"
          : "pending";
    checks.push({ name, state });
  }
  return checks;
}

const CHECK_STYLE: Record<CheckState, { icon: typeof CircleCheck; className: string; label: string }> = {
  pass: {
    icon: CircleCheck,
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    label: "passed",
  },
  fail: { icon: CircleX, className: "border-rose-400/40 bg-rose-400/10 text-rose-200", label: "failed" },
  pending: {
    icon: CircleDashed,
    className: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    label: "pending",
  },
  neutral: { icon: CircleDashed, className: "border-white/10 bg-white/5 text-slate-300", label: "skipped" },
};

function ChecksList({ checks }: { checks: Check[] }) {
  const failing = checks.filter((c) => c.state === "fail").length;
  const pending = checks.filter((c) => c.state === "pending").length;
  const summary =
    checks.length === 0
      ? "No checks reported"
      : failing > 0
        ? `${failing} of ${checks.length} checks failing`
        : pending > 0
          ? `${pending} of ${checks.length} checks not finished`
          : `All ${checks.length} checks passed`;
  return (
    <div>
      <p
        className={cn(
          "mb-1.5 font-medium",
          checks.length === 0 || pending > 0
            ? "text-amber-200"
            : failing > 0
              ? "text-rose-200"
              : "text-emerald-200",
        )}
      >
        {summary}
      </p>
      {checks.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Checks">
          {checks.map((check, i) => {
            const style = CHECK_STYLE[check.state];
            const Icon = style.icon;
            return (
              <li
                key={`${check.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                  style.className,
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {check.name}
                <span className="sr-only">: {style.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-subtle">{title}</p>
      <div className="text-sm text-fg">{children}</div>
    </div>
  );
}

function renderValue(key: string, value: unknown): ReactNode {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (isNumberKey(key)) return hashNumber(value);
    if (/credits$/i.test(key)) return `${credits(value)} credits`;
    return value.toLocaleString();
  }
  if (typeof value === "string") {
    if (isNumberKey(key)) return hashNumber(value);
    if (/(?:At|Date)$/.test(key) && Number.isFinite(Date.parse(value))) return formatDateTime(value);
    if (value.includes("\n") || value.length > 160)
      return <MarkdownView content={value} compact headingOffset={3} />;
    return value;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) {
    if (value.length === 0) return "—";
    if (value.length > 3 || value.some((v) => String(v).length > 40)) {
      return (
        <ul className="list-disc space-y-0.5 pl-4">
          {value.map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>
      );
    }
    return value.join(", ");
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-code p-2 font-mono text-xs text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function technicalValue(value: unknown): string {
  if (typeof value === "number") return hashNumber(value);
  if (Array.isArray(value)) return value.map((v) => (isRecord(v) ? JSON.stringify(v) : String(v))).join("\n");
  if (isRecord(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

/** Keys rendered by the dedicated evidence blocks (not repeated in the generic list). */
const HANDLED = new Set([
  "prTitle",
  "prNumber",
  "pullRequestNumber",
  "checks",
  "filesChanged",
  "additions",
  "deletions",
  "commitSha",
  "sha",
  "releaseNotes",
  "rollback",
  "changes",
  "environment",
  "version",
  "stagingVerified",
  "scopeName",
  "period",
  "limitCredits",
  "spentCredits",
  "windowEndsAt",
  "suggestedExtraCredits",
  "grantedCredits",
  "grantedExtraCredits",
  "stagingEvidence",
  "runNumber",
]);

/** Bookkeeping keys a CEO doesn't need up front. */
const TECHNICAL = new Set(["stage", "scope"]);

/**
 * Renders an approval's payload as decision evidence: links (pull request, workflow run), checks as pass/fail
 * chips, diff size, release notes, rollback plan, change set and budget facts. Raw identifiers are folded into a
 * closed "Technical details" disclosure; unknown keys still render as a readable key/value list.
 */
export function PayloadDetails({ kind, payload }: { kind: ApprovalKind; payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(
    ([key, v]) =>
      !["risk", "recommendation", "spendByAgent"].includes(key) &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !(isRecord(v) && Object.keys(v).length === 0),
  );
  if (entries.length === 0) return null;

  const links = entries.filter(([, v]) => isUrl(v)) as Array<[string, string]>;
  const linked = new Set(links.map(([k]) => k));
  // "#8" is part of "View release PR #8"; don't repeat it as a field.
  const onLinks = new Set(
    links.map(([k]) => numberKeyFor(k, payload)).filter((k): k is string => k !== null),
  );
  const hasRunLink = linked.has("runUrl") || linked.has("workflowRunUrl");
  const hasPrLink = linked.has("prUrl") || linked.has("pullRequestUrl") || linked.has("releasePrUrl");
  // A numeric workflow run id reads as a run number ("Workflow run #1003"), shown on the link or in the release block.
  const runNumber =
    asNumber(payload.runNumber) ?? (typeof payload.runId === "number" ? payload.runId : undefined);
  const technical = entries.filter(
    ([k, v]) =>
      !isUrl(v) &&
      !HANDLED.has(k) &&
      !(k === "runId" && typeof v === "number") &&
      (isIdKey(k) || TECHNICAL.has(k) || isUuidish(v)),
  );
  const technicalKeys = new Set(technical.map(([k]) => k));
  const rest = entries.filter(
    ([k, v]) =>
      !isUrl(v) &&
      !technicalKeys.has(k) &&
      !HANDLED.has(k) &&
      !onLinks.has(k) &&
      !(k === "runId" && typeof v === "number"),
  );

  const prTitle = asString(payload.prTitle);
  const prNumber = payload.prNumber ?? payload.pullRequestNumber;
  const checks = readChecks(payload.checks);
  const additions = asNumber(payload.additions);
  const deletions = asNumber(payload.deletions);
  const filesChanged = asNumber(payload.filesChanged);
  const sha = asString(payload.commitSha) ?? asString(payload.sha);
  const releaseNotes = asString(payload.releaseNotes);
  const rollback = asString(payload.rollback);
  const changes = Array.isArray(payload.changes)
    ? payload.changes.filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : typeof payload.changes === "string" && payload.changes.trim()
      ? [payload.changes]
      : [];
  const environment = asString(payload.environment);
  const version =
    asString(payload.version) ?? (typeof payload.version === "number" ? String(payload.version) : undefined);
  const stagingVerified = typeof payload.stagingVerified === "boolean" ? payload.stagingVerified : undefined;
  const stagingEvidence = asString(payload.stagingEvidence);
  const limit = asNumber(payload.limitCredits);
  const grantedBefore = asNumber(payload.grantedCredits) ?? 0;
  const grantedNow = asNumber(payload.grantedExtraCredits);
  const spent = asNumber(payload.spentCredits);
  const suggested = asNumber(payload.suggestedExtraCredits);
  const scopeName = asString(payload.scopeName);
  const period = asString(payload.period);
  const windowEndsAt = asString(payload.windowEndsAt);

  const blocks: ReactNode[] = [];
  if (Array.isArray(payload.spendByAgent)) {
    const spenders = payload.spendByAgent.filter(isRecord);
    blocks.push(
      <Block key="spenders" title="Spend by agent (this budget window)">
        {spenders.length ? (
          <ul className="space-y-1">
            {spenders.map((row, index) => (
              <li key={index}>
                {asString(row.agentName) ?? "Unattributed usage"}:{" "}
                {asNumber(row.credits) === undefined
                  ? "Spend not reported"
                  : `${credits(asNumber(row.credits)!)} credits`}
              </li>
            ))}
          </ul>
        ) : (
          <p>No attributed usage recorded in this window.</p>
        )}
      </Block>,
    );
  }
  if (prTitle || (prNumber !== undefined && prNumber !== null && !hasPrLink)) {
    blocks.push(
      <Block key="pr" title="Pull request">
        {prNumber !== undefined && prNumber !== null ? (
          <span className="mr-1.5 font-mono text-muted">{hashNumber(prNumber)}</span>
        ) : null}
        {prTitle ?? "Release pull request"}
      </Block>,
    );
  }
  if (checks) {
    blocks.push(
      <Block key="checks" title="Required checks">
        <ChecksList checks={checks} />
      </Block>,
    );
  }
  if (additions !== undefined || deletions !== undefined || filesChanged !== undefined) {
    blocks.push(
      <Block key="diff" title="Change size">
        <span className="inline-flex flex-wrap items-center gap-x-1.5 tabular-nums">
          <FileDiff aria-hidden className="size-4 text-subtle" />
          {additions !== undefined ? (
            <span className="text-emerald-300">+{additions.toLocaleString()}</span>
          ) : null}
          {deletions !== undefined ? (
            <span className="text-rose-300">−{deletions.toLocaleString()}</span>
          ) : null}
          {filesChanged !== undefined ? (
            <span className="text-muted">
              in {filesChanged.toLocaleString()} {filesChanged === 1 ? "file" : "files"}
            </span>
          ) : null}
        </span>
      </Block>,
    );
  }
  if (
    environment ||
    version ||
    sha ||
    stagingVerified !== undefined ||
    stagingEvidence ||
    (runNumber !== undefined && !hasRunLink)
  ) {
    blocks.push(
      <Block
        key="release"
        title={
          environment || version || stagingVerified !== undefined ? "Release" : sha ? "Commit" : "Release"
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          {environment ? <Badge tone="neutral">{humanize(environment)}</Badge> : null}
          {version ? <span>Version {version}</span> : null}
          {sha ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted" title={sha}>
              <GitCommitHorizontal aria-hidden className="size-3.5" />
              <span className="sr-only">Commit </span>
              {sha.slice(0, 7)}
            </span>
          ) : null}
          {runNumber !== undefined && !hasRunLink ? (
            <span className="text-muted">Workflow run {hashNumber(runNumber)}</span>
          ) : null}
          {stagingVerified === true ? (
            <Badge tone="success">
              <ShieldCheck aria-hidden className="mr-1 inline size-3 align-[-2px]" />
              Verified on staging
            </Badge>
          ) : stagingVerified === false ? (
            <Badge tone="warning">
              <TriangleAlert aria-hidden className="mr-1 inline size-3 align-[-2px]" />
              Not verified on staging
            </Badge>
          ) : null}
        </span>
        {stagingEvidence ? <p className="mt-1.5 text-muted">Staging: {stagingEvidence}</p> : null}
      </Block>,
    );
  }
  if (changes.length > 0) {
    blocks.push(
      <Block key="changes" title="Change set">
        <ul className="list-disc space-y-0.5 pl-4">
          {changes.map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
      </Block>,
    );
  }
  if (releaseNotes) {
    blocks.push(
      <Block key="notes" title="Release notes">
        <MarkdownView content={releaseNotes} compact headingOffset={3} />
      </Block>,
    );
  }
  if (rollback) {
    blocks.push(
      <Block key="rollback" title="Rollback plan">
        <MarkdownView content={rollback} compact headingOffset={3} />
      </Block>,
    );
  }
  if (
    limit !== undefined ||
    spent !== undefined ||
    suggested !== undefined ||
    scopeName !== undefined ||
    (period !== undefined && kind === "budget_overrun")
  ) {
    blocks.push(
      <Block key="budget" title="Spend">
        <p>
          {spent !== undefined ? `Spent ${credits(spent)}` : "Budget"}
          {limit !== undefined ? ` of ${credits(limit + grantedBefore)} credits` : ""}
          {grantedBefore > 0 ? ` (incl. ${credits(grantedBefore)} granted earlier)` : ""}
          {scopeName || period ? (
            <span className="text-muted">
              {" "}
              ·{" "}
              {overrunScopeLabel({ title: "", summary: "", payload }) ??
                [scopeName, period ? `${period} budget` : null].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </p>
        {windowEndsAt && Number.isFinite(Date.parse(windowEndsAt)) ? (
          <p className="text-muted">
            Window resets {formatWindowEnd(new Date(windowEndsAt))} · {relativeTime(windowEndsAt)}
          </p>
        ) : null}
        {grantedNow !== undefined ? (
          <p className="text-emerald-200">Granted: {credits(grantedNow)} credits for this window</p>
        ) : suggested !== undefined ? (
          <p className="text-muted">Suggested grant: {credits(suggested)} credits</p>
        ) : null}
      </Block>,
    );
  }

  return (
    <div className="space-y-3">
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/15"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              {linkLabel(key, payload)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      ) : null}
      {blocks.length > 0 ? (
        <div className="divide-y divide-border/60 rounded-lg border border-border">{blocks}</div>
      ) : null}
      {rest.length > 0 ? (
        <dl className="divide-y divide-border/60 rounded-lg border border-border text-sm">
          {rest.map(([key, value]) => (
            <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted">{labelFor(key)}</dt>
              <dd className="min-w-0 break-words text-fg">{renderValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {technical.length > 0 ? (
        <details className="group rounded-lg border border-border text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
            Technical details
          </summary>
          <dl className="divide-y divide-border/60 border-t border-border">
            {technical.map(([key, value]) => (
              <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-subtle">{labelFor(key)}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-all font-mono text-xs text-muted">
                  {technicalValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
