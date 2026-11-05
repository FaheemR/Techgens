import type { ApprovalDetailDTO } from "@techgens/core";

function readAuthored(approval: ApprovalDetailDTO, names: string[]) {
  const sources = [
    { title: "Request summary", content: approval.summary },
    ...approval.documents.map((doc) => ({ title: `${doc.title} (v${doc.version})`, content: doc.content })),
  ];
  const section = (content: string, names: string[]) => {
    const lines = content.split("\n");
    const start = lines.findIndex((line) => {
      const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]?.toLowerCase();
      return heading && names.includes(heading);
    });
    if (start < 0) return null;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^#{1,6}\s/.test(line));
    const text = rest
      .slice(0, end < 0 ? undefined : end)
      .join("\n")
      .trim();
    return text ? text.slice(0, 1200) : null;
  };
  return sources.flatMap((source) => {
    const content = section(source.content, names);
    return content ? [{ source: source.title, content }] : [];
  });
}

/** Returns only authored evidence; absence must never look like a low-risk or approval recommendation. */
export function approvalBrief(approval: ApprovalDetailDTO) {
  const read = (names: string[]) => readAuthored(approval, names);
  const payloadText = (key: string) => {
    const value = approval.payload[key];
    return typeof value === "string" && value.trim()
      ? [{ source: "Request evidence / review guidance", content: value.trim() }]
      : [];
  };
  return {
    scope: read(["scope", "overview", "problem", "goals & okrs", "success criteria", "release criteria"]),
    risks: [
      ...payloadText("risk"),
      ...read(["risks", "risk", "risk / blast radius", "risks & mitigations", "blast radius"]),
    ],
    recommendations: [...payloadText("recommendation"), ...read(["recommendation"])],
  };
}

export function approvalMemo(approval: ApprovalDetailDTO) {
  const brief = approvalBrief(approval);
  return {
    outcome: readAuthored(approval, ["outcome", "objective", "goal"]),
    scope: readAuthored(approval, ["scope", "overview", "problem", "goals & okrs"]),
    success: readAuthored(approval, ["success criteria", "acceptance criteria", "release criteria"]),
    budget: readAuthored(approval, ["budget", "budget & timeline", "budget and timeline", "cost", "spend"]),
    timing: readAuthored(approval, ["timeline", "timing", "schedule", "milestones"]),
    risks: brief.risks,
    recommendations: brief.recommendations,
  };
}
