import type { ApprovalDetailDTO } from "@techgens/core";
import { MarkdownView } from "@/components/common/markdown";
import { approvalMemo } from "@/lib/approval-brief";

export function DecisionBrief({ approval }: { approval: ApprovalDetailDTO }) {
  const brief = approvalMemo(approval);
  const proposal = approval.kind === "vision_roadmap" || approval.kind === "spec";
  const blocks = [
    ...(proposal || brief.outcome.length
      ? [
          {
            title: "Outcome",
            entries: brief.outcome,
            missing: "No explicit outcome supplied. Check the original request or ask the team to clarify.",
          },
        ]
      : []),
    ...(proposal || brief.scope.length
      ? [
          {
            title: "Scope",
            entries: brief.scope,
            missing: "No scope supplied. Ask what is included and excluded before approving.",
          },
        ]
      : []),
    ...(proposal || brief.success.length
      ? [
          {
            title: "Success criteria",
            entries: brief.success,
            missing:
              "No explicit success criteria supplied. Check the supporting evidence or request clarification.",
          },
        ]
      : []),
    ...(proposal || brief.budget.length
      ? [
          {
            title: "Budget",
            entries: brief.budget,
            missing: "Not supplied in this request. Do not assume approval defines a spending limit.",
          },
        ]
      : []),
    ...(proposal || brief.timing.length
      ? [
          {
            title: "Timing",
            entries: brief.timing,
            missing: "No delivery timing supplied in this request.",
          },
        ]
      : []),
    {
      title: "Risk / blast radius",
      entries: brief.risks,
      missing: "Not provided. Ask who or what is affected, what could go wrong and how it is mitigated.",
    },
    {
      title: "Recommendation",
      entries: brief.recommendations,
      missing:
        "No explicit requester recommendation supplied. Review the evidence or request changes; missing evidence is not an approval signal.",
    },
  ];
  return (
    <section aria-label="Decision brief" className="max-w-[70ch] divide-y divide-border">
      {blocks.map((block) => {
        const first = block.entries[0];
        return (
          <div key={block.title} className="py-5 first:pt-0">
            <h3 className="mb-3 text-lg font-semibold">{block.title}</h3>
            {first ? (
              <>
                <p className="mb-2 text-sm text-subtle">Source: {first.source}</p>
                <MarkdownView content={first.content} className="decision-prose" headingOffset={2} />
                {block.entries.length > 1 ? (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm text-accent">
                      Other source excerpts ({block.entries.length - 1})
                    </summary>
                    {block.entries.slice(1).map((entry, index) => (
                      <div key={`${entry.source}-${index}`} className="mt-4">
                        <p className="mb-2 text-sm text-subtle">Source: {entry.source}</p>
                        <MarkdownView content={entry.content} className="decision-prose" headingOffset={2} />
                      </div>
                    ))}
                  </details>
                ) : null}
              </>
            ) : (
              <p className="text-base leading-relaxed text-amber-200">{block.missing}</p>
            )}
          </div>
        );
      })}
      <p className="py-4 text-sm leading-relaxed text-muted">
        These are source excerpts, limited to 1,200 characters per section. Read the full request and source
        documents below for context. Authored claims are not proof of safety and do not change gate policy or
        authorise execution.
      </p>
    </section>
  );
}
