import { z } from "zod";
import {
  DECISION_TYPES,
  DOCUMENT_KINDS,
  GATE_KINDS_FOR_TOOL,
  LIFECYCLE_STAGES,
  PRIORITIES,
  truncate,
} from "@techgens/core";
import { defineAgentTool, type AgentToolSpec } from "@techgens/runtime";
import type { ToolCaller, ToolServices } from "./types";

type Factory = (c: ToolCaller, s: ToolServices) => AgentToolSpec;

const docKind = z.enum(DOCUMENT_KINDS);

export const collaborationTools: Record<string, Factory> = {
  delegate_task: (c, s) =>
    defineAgentTool({
      name: "delegate_task",
      description:
        "Delegate a piece of work to another agent (by role id such as 'product-manager', or by agent name). The assignee works asynchronously in its own session. You may delegate several tasks; then end your turn — you will be resumed automatically with all results.",
      schema: z.object({
        assignee: z.string().describe("Role id (e.g. 'business-analyst') or agent name"),
        title: z.string().min(3).max(160),
        instructions: z.string().min(10).describe("Context, what to do, constraints"),
        expectedOutput: z
          .string()
          .min(5)
          .describe("What the assignee must deliver (e.g. 'a research document')"),
        priority: z.enum(PRIORITIES).optional(),
        kind: z.enum(["task", "research", "document", "review"]).optional(),
      }),
      handler: async (i) => {
        const r = await s.delegateTask(c, i);
        return `Delegated "${i.title}" to ${r.assigneeName} (work item ${r.workItemId}). End your turn when you have nothing else to do; you will be resumed with the result.`;
      },
    }),

  ask_agent: (c, s) =>
    defineAgentTool({
      name: "ask_agent",
      description:
        "Ask a colleague a quick question and get an immediate answer (consultation, not a work assignment). Use for clarifications, feasibility checks and expert opinions.",
      schema: z.object({ agent: z.string().describe("Role id or agent name"), question: z.string().min(5) }),
      handler: async (i) => {
        const r = await s.askAgent(c, i);
        return `${r.agentName} answered:\n${r.answer}`;
      },
    }),

  report_progress: (c, s) =>
    defineAgentTool({
      name: "report_progress",
      description: "Post a short progress update visible to the CEO and your manager.",
      schema: z.object({
        message: z.string().min(3).max(1000),
        percentComplete: z.number().min(0).max(100).optional(),
      }),
      handler: async (i) => {
        await s.reportProgress(c, i);
        return "Progress recorded.";
      },
    }),

  escalate: (c, s) =>
    defineAgentTool({
      name: "escalate",
      description:
        "Escalate a blocker, risk or decision to the CEO with options and your recommendation. Ends your turn; you will be resumed with the CEO's decision.",
      isTerminal: true,
      schema: z.object({
        issue: z.string().min(10),
        options: z.array(z.string()).min(1).max(5),
        recommendation: z.string().min(5),
        severity: z.enum(["low", "medium", "high"]).default("medium"),
      }),
      handler: async (i) => {
        const r = await s.escalate(c, i);
        return `Escalated to the CEO (approval ${r.approvalId}). Your turn ends now.`;
      },
    }),

  request_approval: (c, s) =>
    defineAgentTool({
      name: "request_approval",
      description:
        "Request a CEO approval gate (vision_roadmap, spec, architecture, merge_to_main, prod_deploy, decision, hire). Reference the documents under review. Ends your turn; you will be resumed with the decision and any feedback.",
      isTerminal: true,
      schema: z.object({
        kind: z.enum(GATE_KINDS_FOR_TOOL as [string, ...string[]]),
        title: z.string().min(3).max(160),
        summary: z
          .string()
          .min(10)
          .describe(
            "Concrete decision brief: outcome, scope/non-goals, success criteria, timeline and credits. Include '## Risk / blast radius' and '## Recommendation' sections with affected users/systems, mitigations, unknowns, reasons and evidence. Never invent verification.",
          ),
        documentIds: z.array(z.string()).default([]),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
      handler: async (i) => {
        const r = await s.requestApproval(c, { ...i, kind: i.kind as never });
        if (r.alreadyApproved)
          return `The CEO already approved this gate for the current stage (approval ${r.approvalId}); it was not requested again. Don't redo the approved work: finish your assignment and call complete_task.`;
        return r.autoApproved
          ? `Approved automatically by the CEO's gate policy (approval ${r.approvalId}).`
          : `Approval ${r.approvalId} requested from the CEO. Your turn ends now.`;
      },
    }),

  complete_task: (c, s) =>
    defineAgentTool({
      name: "complete_task",
      description:
        "Finish your current assignment. Summarise what you produced (documents, decisions, work items) and any follow-ups. Use outcome 'blocked' only if you cannot proceed.",
      isTerminal: true,
      schema: z.object({
        summary: z.string().min(5).max(4000),
        outcome: z.enum(["done", "blocked"]).default("done"),
        followUps: z.array(z.string()).default([]),
      }),
      handler: async (i) => {
        await s.completeTask(c, i);
        return "Assignment completed.";
      },
    }),

  write_document: (c, s) =>
    defineAgentTool({
      name: "write_document",
      description:
        "Create or update a Markdown document (PRD, research, architecture, ADR, plan, runbook…). Pass documentId to publish a new version of an existing document. Documents are linked to your current initiative.",
      schema: z.object({
        title: z.string().min(3).max(200),
        kind: docKind,
        content: z.string().min(20).describe("Full Markdown content"),
        documentId: z.string().optional(),
        changeSummary: z.string().optional(),
      }),
      handler: async (i) => {
        const r = await s.writeDocument(c, i);
        return `Saved "${i.title}" (document ${r.id}, version ${r.version}).`;
      },
    }),

  read_document: (c, s) =>
    defineAgentTool({
      name: "read_document",
      description: "Read a document by id, or the latest document of a kind/title in your initiative.",
      schema: z.object({
        documentId: z.string().optional(),
        title: z.string().optional(),
        kind: docKind.optional(),
      }),
      handler: async (i) => {
        const d = await s.readDocument(c, i);
        if (!d) return { text: "Document not found.", failed: true };
        return `# ${d.title}\n(id ${d.id} · ${d.kind} · v${d.version} · ${d.status})\n\n${truncate(d.content, 24_000)}`;
      },
    }),

  list_documents: (c, s) =>
    defineAgentTool({
      name: "list_documents",
      description:
        "List documents of an initiative (defaults to your current initiative), optionally by kind.",
      schema: z.object({ initiativeId: z.string().optional(), kind: docKind.optional() }),
      handler: async (i) => {
        const docs = await s.listDocuments(c, i);
        if (!docs.length) return "No documents yet.";
        return docs
          .map((d) => `- ${d.title} (id ${d.id} · ${d.kind} · v${d.version} · ${d.status})`)
          .join("\n");
      },
    }),

  search_knowledge: (c, s) =>
    defineAgentTool({
      name: "search_knowledge",
      description: "Full-text search across all company documents (specs, research, decisions, runbooks).",
      schema: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(20).default(8) }),
      handler: async (i) => {
        const hits = await s.searchKnowledge(c, i);
        if (!hits.length) return "No matching documents.";
        return hits.map((h) => `- ${h.title} (id ${h.id} · ${h.kind}): ${h.snippet}`).join("\n");
      },
    }),

  get_status: (c, s) =>
    defineAgentTool({
      name: "get_status",
      description: "Company or initiative status: stages, open work, pending approvals and budget burn.",
      schema: z.object({ initiativeId: z.string().optional() }),
      handler: (i) => s.getStatus(c, i),
    }),

  create_initiative: (c, s) =>
    defineAgentTool({
      name: "create_initiative",
      description:
        "Create an initiative from a CEO directive that asks for new work (never for questions or status requests). This starts the product lifecycle: you will be assigned the intake stage (charter + roadmap) right away. Always set a total budget cap; without one the default cap applies.",
      schema: z.object({
        title: z
          .string()
          .min(3)
          .max(60)
          .describe("Short name (≤ 60 characters), e.g. 'InvoiceLite client portal'"),
        summary: z.string().min(10),
        productName: z
          .string()
          .optional()
          .describe(
            "Product the directive builds or extends (existing name, or a new product). Omit for research/strategy work: no repository stages.",
          ),
        targetDate: z.string().optional().describe("ISO date"),
        budgetCredits: z
          .number()
          .positive()
          .optional()
          .describe(
            "Total AI-credit cap for the whole initiative (convert per-week/month budgets with the timeline)",
          ),
        skipStages: z.array(z.enum(LIFECYCLE_STAGES)).optional(),
      }),
      handler: async (i) => {
        const r = await s.createInitiative(c, i);
        const budget = `${r.budgetCredits} credits${r.defaultBudget ? " (default cap: the directive named no budget — tell the CEO you applied it)" : ""}`;
        return `Initiative created (${r.initiativeId}). Total budget cap: ${budget}. Product: ${r.productName ?? "none (repository stages are skipped)"}. The intake stage has been assigned to you.`;
      },
    }),

  propose_roadmap: (c, s) =>
    defineAgentTool({
      name: "propose_roadmap",
      description: "Set the milestone roadmap of your current initiative (replaces previous proposal).",
      schema: z.object({
        initiativeId: z.string().optional(),
        milestones: z
          .array(
            z.object({
              title: z.string().min(3),
              description: z.string().optional(),
              dueDate: z.string().optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
      handler: async (i) => {
        const r = await s.proposeRoadmap(c, i);
        return `Roadmap saved with ${r.count} milestones.`;
      },
    }),

  record_decision: (c, s) =>
    defineAgentTool({
      name: "record_decision",
      description:
        "Append to the initiative decision log (decisions, scope changes, overrides, assumptions).",
      schema: z.object({
        type: z.enum(DECISION_TYPES).default("decision"),
        summary: z.string().min(5),
        details: z.string().optional(),
      }),
      handler: async (i) => {
        await s.recordDecision(c, i);
        return "Decision recorded.";
      },
    }),

  remember: (c, s) =>
    defineAgentTool({
      name: "remember",
      description:
        "Save a short note to your long-term memory (preferences, lessons learned). Shown in future sessions.",
      schema: z.object({ note: z.string().min(5).max(500) }),
      handler: async (i) => {
        await s.remember(c, i);
        return "Noted.";
      },
    }),
};
