import type { WorkItemDTO } from "@techgens/core";
import { CircleDot, GitPullRequest } from "lucide-react";
import { WORK_KIND_ICON } from "@/lib/labels";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

export function WorkKindIcon({ kind, className }: { kind: WorkItemDTO["kind"]; className?: string }) {
  const Icon = WORK_KIND_ICON[kind] ?? CircleDot;
  return (
    <span title={humanize(kind)} className={cn("inline-flex", className)}>
      <Icon aria-hidden className="size-3.5 text-subtle" />
      <span className="sr-only">{humanize(kind)}</span>
    </span>
  );
}

/** GitHub issue / pull request links for a work item. */
export function GithubLinks({ item, className }: { item: WorkItemDTO; className?: string }) {
  if (!item.githubUrl && !item.prUrl) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2 text-xs", className)}>
      {item.githubUrl ? (
        <a
          href={item.githubUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded text-muted hover:text-accent"
          title="GitHub issue"
        >
          <CircleDot aria-hidden className="size-3" />
          {item.githubIssueNumber ? `#${item.githubIssueNumber}` : "Issue"}
        </a>
      ) : null}
      {item.prUrl ? (
        <a
          href={item.prUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded text-muted hover:text-accent"
          title="Pull request"
        >
          <GitPullRequest aria-hidden className="size-3" />
          {item.prNumber ? `PR #${item.prNumber}` : "PR"}
        </a>
      ) : null}
    </span>
  );
}
