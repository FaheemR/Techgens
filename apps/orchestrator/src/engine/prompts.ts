import { STAGES, formatCredits, truncate, type LifecycleStage } from "@techgens/core";
import type { Document, Initiative, Milestone, Product } from "@techgens/db";

export interface StageBriefInput {
  initiative: Initiative;
  stage: LifecycleStage;
  product: Product | null;
  documents: Document[];
  milestones: Milestone[];
  feedback?: string;
}

function docList(docs: Document[]): string {
  if (!docs.length) return "- (none yet)";
  return docs.map((d) => `- ${d.title} — ${d.kind}, v${d.currentVersion}, ${d.status} (id ${d.id})`).join("\n");
}

export function stageBrief(input: StageBriefInput): string {
  const { initiative: ini, product } = input;
  const def = STAGES[input.stage];
  const lines = [
    `# Assignment: ${def.title}`,
    "",
    `**Initiative:** ${ini.title} (id ${ini.id})`,
    `**CEO directive:** ${ini.directive}`,
  ];
  if (ini.summary) lines.push(`**Initiative summary:** ${truncate(ini.summary, 1500)}`);
  lines.push(
    `**Product:** ${product ? `${product.name}${product.repoOwner ? ` — repository ${product.repoOwner}/${product.repoName} (integration branch \`${product.integrationBranch}\`, default branch \`${product.defaultBranch}\`)` : " — no repository yet"}` : "none"}`,
  );
  if (ini.targetDate) lines.push(`**Target date:** ${ini.targetDate.toISOString().slice(0, 10)}`);
  if (ini.budgetCredits) lines.push(`**Initiative budget:** ${formatCredits(ini.budgetCredits)} AI credits`);
  lines.push("", "## What to do", def.instructions);
  if (def.gate) lines.push("", `This stage ends with the CEO gate **${def.gate}**. Reference the relevant document ids when requesting approval.`);
  if (input.milestones.length) {
    lines.push("", "## Roadmap", ...input.milestones.map((m) => `- ${m.title}${m.dueDate ? ` (due ${m.dueDate.toISOString().slice(0, 10)})` : ""} — ${m.status}`));
  }
  lines.push("", "## Documents in this initiative", docList(input.documents));
  if (input.feedback) lines.push("", "## CEO feedback to address", input.feedback);
  lines.push("", "When the stage work is finished, call complete_task with a concise summary.");
  return lines.join("\n");
}

export function delegationBrief(input: {
  managerName: string;
  managerTitle: string;
  title: string;
  instructions: string;
  expectedOutput: string;
  initiative: Initiative | null;
  parentTitle: string | null;
}): string {
  const lines = [
    `# Assignment from ${input.managerName} (${input.managerTitle}): ${input.title}`,
    "",
    input.instructions,
    "",
    "## Expected output",
    input.expectedOutput,
    "",
    "## Context",
  ];
  if (input.initiative) {
    lines.push(`- Initiative: ${input.initiative.title} (id ${input.initiative.id}, stage ${input.initiative.stage})`);
    lines.push(`- CEO directive: ${truncate(input.initiative.directive, 800)}`);
  }
  if (input.parentTitle) lines.push(`- Part of: ${input.parentTitle}`);
  lines.push("", "Use list_documents/read_document for existing specs. Call complete_task when done.");
  return lines.join("\n");
}

export function chatBrief(content: string): string {
  return content;
}

export const NUDGE_MESSAGE =
  "Your turn ended without finishing the assignment. If the work is complete, call complete_task with a summary. If you delegated work or are waiting on something, say so briefly and end your turn. Otherwise continue with the next step.";
