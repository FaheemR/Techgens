import { describe, expect, it } from "vitest";
import type { ApprovalDetailDTO, DocumentDTO } from "@techgens/core";
import { approvalBrief, approvalMemo } from "./approval-brief";

const approval = (patch: Partial<ApprovalDetailDTO> = {}): ApprovalDetailDTO => ({
  id: "approval",
  kind: "merge_to_main",
  status: "pending",
  title: "Release",
  summary: "",
  initiativeId: null,
  initiativeTitle: null,
  requestedBy: "Morgan",
  round: 1,
  createdAt: "2026-11-04T12:00:00Z",
  decidedAt: null,
  decisionComment: null,
  payload: {},
  documents: [],
  decisions: [],
  ...patch,
});

describe("approval memo authored evidence", () => {
  const entry = (content: string, source = "Request summary") => [{ source, content }];
  const absent = {
    outcome: [],
    scope: [],
    success: [],
    budget: [],
    timing: [],
    risks: [],
    recommendations: [],
  };

  it("keeps outcome scope success budget timing risks and recommendation distinct", () => {
    expect(
      approvalMemo(
        approval({
          summary:
            "# Outcome\nReduce review delays.\n## Scope\nReceipt capture only.\n## Success criteria\n95% extraction accuracy.\n## Budget\n450 credits maximum.\n## Timeline\nFriday delivery.\n## Risks\nMigration needs backup.\n## Recommendation\nReview backup first.\n## Notes\nNever include this.",
        }),
      ),
    ).toEqual({
      outcome: entry("Reduce review delays."),
      scope: entry("Receipt capture only."),
      success: entry("95% extraction accuracy."),
      budget: entry("450 credits maximum."),
      timing: entry("Friday delivery."),
      risks: entry("Migration needs backup."),
      recommendations: entry("Review backup first."),
    });
  });

  it.each([
    ["outcome", ["outcome", "objective", "goal"]],
    ["scope", ["scope", "overview", "problem", "goals & okrs"]],
    ["success", ["success criteria", "acceptance criteria", "release criteria"]],
    ["budget", ["budget", "budget & timeline", "budget and timeline", "cost", "spend"]],
    ["timing", ["timeline", "timing", "schedule", "milestones"]],
    ["risks", ["risks", "risk", "risk / blast radius", "risks & mitigations", "blast radius"]],
    ["recommendations", ["recommendation"]],
  ] as const)(
    "recognizes %s aliases and mixed-case headings without adjacent section leakage",
    (field, aliases) => {
      for (const alias of aliases) {
        expect(
          approvalMemo(
            approval({
              summary: `### ${alias.toUpperCase()} ###\nAuthored ${alias}.\n###### Unrelated\nDo not include.`,
            }),
          ),
          alias,
        ).toEqual({ ...absent, [field]: entry(`Authored ${alias}.`) });
      }
    },
  );

  it("preserves summary and document version attribution in source order", () => {
    expect(
      approvalMemo(
        approval({
          summary: "# Outcome\nSummary outcome.",
          documents: [
            document("# Goal\nVersion three outcome."),
            { ...document("# Objective\nVersion four outcome."), id: "doc-4", version: 4 },
          ],
        }),
      ),
    ).toEqual({
      ...absent,
      outcome: [
        ...entry("Summary outcome."),
        ...entry("Version three outcome.", "Release review (v3)"),
        ...entry("Version four outcome.", "Release review (v4)"),
      ],
    });
  });

  it("leaves empty unsupported and unstructured evidence absent despite green checks", () => {
    for (const value of [undefined, null, false, 0, [], { text: "Approve" }, "", " \n "]) {
      expect(
        approvalMemo(
          approval({
            summary:
              "# Outcome\n \n## Scope\n\n## Success criteria\n\n## Budget\n\n## Timing\n\n## Risks\n\n## Recommendation\n ",
            payload: {
              outcome: value,
              scope: value,
              success: value,
              budget: value,
              timing: value,
              risk: value,
              recommendation: value,
              checks: [{ name: "test", conclusion: "success" }],
              stagingVerified: true,
            },
            documents: [
              document("All checks green. Low risk. Deliver Friday for 20 credits. Recommend approval."),
            ],
          }),
        ),
      ).toEqual(absent);
    }
  });

  it("uses only supported string risk and recommendation payload guidance", () => {
    expect(
      approvalMemo(
        approval({
          payload: {
            outcome: "Invented outcome",
            scope: "Invented scope",
            success: "Invented success",
            budget: "100",
            timing: "Tomorrow",
            risk: "  Authored risk. \n",
            recommendation: "  Request review. ",
          },
        }),
      ),
    ).toEqual({
      ...absent,
      risks: entry("Authored risk.", "Request evidence / review guidance"),
      recommendations: entry("Request review.", "Request evidence / review guidance"),
    });
  });

  it.each([1199, 1200, 1201])("preserves the exact authored excerpt boundary at %i characters", (length) => {
    const text = `${"x".repeat(length - 1)}Z`;
    expect(
      approvalMemo(
        approval({
          documents: [document(`# Outcome\n  ${text}  \n## Scope\nOnly scope.`)],
        }),
      ),
    ).toEqual({
      ...absent,
      outcome: entry(text.slice(0, 1200), "Release review (v3)"),
      scope: entry("Only scope.", "Release review (v3)"),
    });
  });
});
const document = (content: string): DocumentDTO =>
  ({
    id: "doc",
    title: "Release review",
    version: 3,
    content,
  }) as DocumentDTO;

describe("approval brief authored evidence", () => {
  it("extracts supplied scope risks and recommendations with exact source attribution", () => {
    expect(
      approvalBrief(
        approval({
          summary:
            "# Scope\nReceipt capture only.\n## Risks\nMigration may need rollback.\n## Recommendation\nReview migration first.\n## Notes\nNot risk evidence.",
          payload: { risk: "  Production schema change.  ", recommendation: "  Defer until reviewed. " },
          documents: [
            document(
              "## Overview\nTwo API routes.\n## Risk / blast radius\nReceipt users only.\n## Recommendation\nShip after backup.\n## Tests\nGreen.",
            ),
          ],
        }),
      ),
    ).toEqual({
      scope: [
        { source: "Request summary", content: "Receipt capture only." },
        { source: "Release review (v3)", content: "Two API routes." },
      ],
      risks: [
        { source: "Request evidence / review guidance", content: "Production schema change." },
        { source: "Request summary", content: "Migration may need rollback." },
        { source: "Release review (v3)", content: "Receipt users only." },
      ],
      recommendations: [
        { source: "Request evidence / review guidance", content: "Defer until reviewed." },
        { source: "Request summary", content: "Review migration first." },
        { source: "Release review (v3)", content: "Ship after backup." },
      ],
    });
  });

  it("does not infer low risk or approval from green checks staging or unstructured prose", () => {
    expect(
      approvalBrief(
        approval({
          summary: "All checks passed. Risks are low. Recommend approval.",
          payload: {
            checks: [{ name: "test", conclusion: "success" }],
            stagingVerified: true,
            risk: 0,
            recommendation: true,
          },
          documents: [document("# Test results\nAll tests passed.\n# Risky changes\nNone claimed.")],
        }),
      ),
    ).toEqual({ scope: [], risks: [], recommendations: [] });
  });

  it("treats blank headings whitespace and non-string payload as absent evidence", () => {
    expect(
      approvalBrief(
        approval({
          summary: "# Scope\n \n# Risks\n\n# Recommendation\n ",
          payload: { risk: " \n ", recommendation: { approve: true } },
        }),
      ),
    ).toEqual({ scope: [], risks: [], recommendations: [] });
  });

  it("matches heading aliases case-insensitively without leaking the next section", () => {
    expect(
      approvalBrief(
        approval({
          summary:
            "### SUCCESS CRITERIA ###\n95% receipt extraction.\n# RISKS & MITIGATIONS\nBack up first.\n# Other\nDo not include.",
          documents: [document("# Blast radius\nBilling only.\n# Other\nUnrelated.")],
        }),
      ),
    ).toEqual({
      scope: [{ source: "Request summary", content: "95% receipt extraction." }],
      risks: [
        { source: "Request summary", content: "Back up first." },
        { source: "Release review (v3)", content: "Billing only." },
      ],
      recommendations: [],
    });
  });

  it("bounds authored document excerpts without replacing the evidence", () => {
    const content = "x".repeat(1201);
    const brief = approvalBrief(approval({ documents: [document(`# Risks\n${content}`)] }));
    expect(brief.risks).toEqual([{ source: "Release review (v3)", content: "x".repeat(1200) }]);
    expect(brief.scope).toEqual([]);
    expect(brief.recommendations).toEqual([]);
  });
});
