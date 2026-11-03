import { ExternalLink } from "lucide-react";
import { humanize } from "@/lib/format";
import { isRecord, isUrl } from "@/lib/utils";

const LINK_LABELS: Record<string, string> = {
  prUrl: "Pull request",
  pullRequestUrl: "Pull request",
  releasePrUrl: "Release pull request",
  runUrl: "Deployment run",
  workflowRunUrl: "Workflow run",
  deploymentUrl: "Deployment",
  environmentUrl: "Environment",
  previewUrl: "Preview",
  stagingUrl: "Staging",
  productionUrl: "Production",
  issueUrl: "Issue",
  repoUrl: "Repository",
  url: "Link",
};

const FIELD_LABELS: Record<string, string> = {
  prNumber: "PR number",
  pullRequestNumber: "PR number",
  sha: "Commit",
  runId: "Run ID",
};

function labelFor(key: string): string {
  if (LINK_LABELS[key]) return LINK_LABELS[key];
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return humanize(
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/ url$/i, "")
      .toLowerCase(),
  );
}

function renderValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string")
    return isUrl(value) ? (
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-accent hover:underline"
      >
        {value}
      </a>
    ) : (
      value
    );
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number"))
    return value.join(", ");
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-[#060a10] p-2 font-mono text-xs text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Renders an approval's payload: prominent links (PRs, deployment runs) and a key/value table for the rest. */
export function PayloadDetails({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  const links = entries.filter(([, v]) => isUrl(v)) as Array<[string, string]>;
  const prNumber = payload.prNumber ?? payload.pullRequestNumber;
  const hasPrLink = links.some(([key]) => key === "prUrl" || key === "pullRequestUrl");
  const rest = entries.filter(
    ([k, v]) =>
      !isUrl(v) &&
      !(isRecord(v) && Object.keys(v).length === 0) &&
      // The PR number is already shown on the pull request link.
      !(hasPrLink && (k === "prNumber" || k === "pullRequestNumber")),
  );

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
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-accent/15"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              {labelFor(key)}
              {(key === "prUrl" || key === "pullRequestUrl") &&
              (typeof prNumber === "number" || typeof prNumber === "string")
                ? ` #${prNumber}`
                : ""}
            </a>
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <dl className="divide-y divide-border/60 rounded-lg border border-border text-sm">
          {rest.map(([key, value]) => (
            <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted">{labelFor(key)}</dt>
              <dd className="min-w-0 break-words text-fg">{renderValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
