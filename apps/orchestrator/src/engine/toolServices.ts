import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  DEFAULT_INITIATIVE_BUDGET_CREDITS,
  DomainError,
  approvalHeadline,
  STAGES,
  formatCredits,
  truncate,
} from "@techgens/core";
import { buildSystemPrompt } from "@techgens/agents";
import { buildAgentTools, type ToolCaller, type ToolServices } from "@techgens/tools";
import { schema } from "@techgens/db";
import type { Techgens } from "../app";
import { roleDefinition } from "../services/org";
import { delegationBrief } from "./prompts";
import type { JobEngine } from "./jobs";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const CONSULT_TOOLS = [
  "read_document",
  "list_documents",
  "search_knowledge",
  "get_status",
  "list_work_items",
] as const;

export function createToolServices(app: Techgens, engine: JobEngine): ToolServices {
  const services: ToolServices = {
    async delegateTask(c, i) {
      const settings = await app.settings.all();
      if (c.depth + 1 > settings.maxDelegationDepth) {
        throw new DomainError(
          `Delegation depth limit (${settings.maxDelegationDepth}) reached. Do the work yourself, ask_agent for input, or escalate.`,
        );
      }
      const target = await app.org.resolveAgent(i.assignee, { excludeAgentId: c.agentId });
      const { role: targetRole } = await app.org.agentWithRole(target.id);
      if (targetRole.definition.executor === "cloud-agent") {
        throw new DomainError(
          `${target.name} is a Copilot coding agent: create a task with create_work_item (forCodingAgent: true) and use assign_to_coding_agent.`,
        );
      }
      const job = await engine.getJob(c.jobId);
      const [{ n }] = (await app.db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.jobs)
        .where(eq(schema.jobs.parentJobId, c.jobId))) as [{ n: number }];
      if (n >= settings.maxFanOut)
        throw new DomainError(
          `You already delegated ${n} tasks for this assignment (limit ${settings.maxFanOut}). Wait for results or consolidate.`,
        );
      const ancestors = await engine.ancestors(job);
      if (ancestors.some((a) => a.agentId === target.id)) {
        throw new DomainError(
          `${target.name} assigned this work to you (directly or indirectly). Don't delegate upward — use ask_agent for questions or escalate.`,
        );
      }
      const chain = [job, ...ancestors];
      const items = await Promise.all(
        chain.map((j) => (j.workItemId ? app.work.get(j.workItemId).catch(() => null) : null)),
      );
      if (items.some((w) => w && normalize(w.title) === normalize(i.title) && w.kind !== "stage")) {
        throw new DomainError(
          "Loop detected: this task is already being worked on further up the chain. Do it yourself or escalate.",
        );
      }
      const initiative = c.initiativeId ? await app.lifecycle.get(c.initiativeId) : null;
      const parentItem = c.workItemId ? await app.work.get(c.workItemId).catch(() => null) : null;
      const { role: callerRole } = await app.org.agentWithRole(c.agentId);
      const item = await app.work.create({
        kind: i.kind ?? "task",
        title: i.title,
        description: `${i.instructions}\n\n**Expected output:** ${i.expectedOutput}`,
        parentId: c.workItemId,
        initiativeId: c.initiativeId,
        productId: initiative?.productId ?? null,
        assigneeAgentId: target.id,
        createdByAgentId: c.agentId,
        status: "in_progress",
        priority: i.priority ?? "p2",
      });
      const child = await engine.createJob({
        agentId: target.id,
        workItemId: item.id,
        initiativeId: c.initiativeId,
        parentJobId: c.jobId,
        depth: c.depth + 1,
        prompt: delegationBrief({
          managerName: c.agentName,
          managerTitle: callerRole.title,
          title: i.title,
          instructions: i.instructions,
          expectedOutput: i.expectedOutput,
          initiative,
          parentTitle: parentItem?.title ?? null,
        }),
      });
      engine.turnState(c.jobId).delegatedJobIds.push(child.id);
      return { workItemId: item.id, jobId: child.id, assigneeName: target.name };
    },

    async askAgent(c, i) {
      const target = await app.org.resolveAgent(i.agent, { excludeAgentId: c.agentId });
      const { role } = await app.org.agentWithRole(target.id);
      const company = await app.company.get();
      const team = await app.org.teamContext(target);
      const consultCaller: ToolCaller = { ...c, agentId: target.id, agentName: target.name, roleId: role.id };
      const productId = c.initiativeId
        ? ((await app.lifecycle.get(c.initiativeId).catch(() => null))?.productId ?? null)
        : null;
      const systemPrompt = `${buildSystemPrompt({ company: { ...company }, role: roleDefinition(role), agentName: target.name, ...team })}\n\n## Consultation\n${c.agentName} is consulting you. Answer directly and concisely from your expertise and the company documents. Do not start new work.`;
      const session = await app.runtime.createSession(
        {
          systemPrompt,
          model: await app.org.effectiveModel(target, role),
          tools: buildAgentTools([...CONSULT_TOOLS], consultCaller, services),
          maxAiCredits: Math.max(2, role.definition.budget.perJobCredits / 3),
          labels: { agentId: target.id, roleId: role.id, jobId: c.jobId, kind: "consult" },
        },
        (e) => {
          if (e.type === "usage") {
            void app.budget.recordUsage({
              jobId: c.jobId,
              agentId: target.id,
              roleId: role.id,
              department: role.department,
              initiativeId: c.initiativeId,
              productId,
              model: e.model,
              nanoAiu: e.nanoAiu,
              premiumRequests: e.premiumRequests,
              inputTokens: e.inputTokens,
              outputTokens: e.outputTokens,
            });
          }
        },
      );
      try {
        const res = await session.run(`${c.agentName} asks: ${i.question}`, { timeoutMs: 5 * 60_000 });
        const answer = res.finalMessage || "(no answer)";
        await app.bus.emit({
          type: "agent.message",
          actorType: "agent",
          actorId: target.id,
          subjectType: "job",
          subjectId: c.jobId,
          summary: `${target.name} answered ${c.agentName}: ${truncate(answer, 120)}`,
          data: { jobId: c.jobId, question: i.question, content: truncate(answer, 4000), consult: true },
        });
        return { answer, agentName: target.name };
      } finally {
        await session.close().catch(() => undefined);
      }
    },

    async reportProgress(c, i) {
      if (c.workItemId) {
        const item = await app.work.get(c.workItemId);
        await app.db
          .update(schema.workItems)
          .set({
            metadata: { ...item.metadata, progress: i.message, percentComplete: i.percentComplete ?? null },
          })
          .where(eq(schema.workItems.id, item.id));
      }
      await app.bus.emit({
        type: "agent.message",
        actorType: "agent",
        actorId: c.agentId,
        subjectType: "job",
        subjectId: c.jobId,
        summary: `${c.agentName}: ${truncate(i.message, 160)}`,
        data: {
          jobId: c.jobId,
          progress: true,
          percentComplete: i.percentComplete ?? null,
          content: i.message,
        },
      });
    },

    async escalate(c, i) {
      const summary = [
        `**Issue (${i.severity}):** ${i.issue}`,
        "",
        "**Options:**",
        ...i.options.map((o, n) => `${n + 1}. ${o}`),
        "",
        `**Recommendation:** ${i.recommendation}`,
      ].join("\n");
      const { approval } = await app.approvals.request({
        kind: "decision",
        title: `Escalation from ${c.agentName}: ${truncate(i.issue, 90)}`,
        summary,
        initiativeId: c.initiativeId,
        workItemId: c.workItemId,
        jobId: c.jobId,
        requestedByAgentId: c.agentId,
        payload: { options: i.options, severity: i.severity },
      });
      engine.turnState(c.jobId).awaitingApprovalId = approval.id;
      return { approvalId: approval.id };
    },

    async requestApproval(c, i) {
      const ini = c.initiativeId ? await app.lifecycle.get(c.initiativeId) : null;
      const docs = await Promise.all(i.documentIds.map((id) => app.docs.get(id).catch(() => null)));
      const missing = i.documentIds.filter((_, n) => !docs[n]);
      if (missing.length)
        throw new DomainError(
          `Unknown document id(s): ${missing.join(", ")}. Use list_documents to find the right ids.`,
        );
      let documentIds = i.documentIds;
      if (!documentIds.length && ini) {
        const kinds = STAGES[ini.stage].deliverables as string[];
        documentIds = (await app.docs.list({ initiativeId: ini.id }))
          .filter((d) => kinds.includes(d.kind))
          .map((d) => d.id);
      }
      const payload: Record<string, unknown> = {
        ...(i.payload ?? {}),
        ...(ini && STAGES[ini.stage].gate === i.kind ? { stage: ini.stage } : {}),
      };
      if (i.kind === "merge_to_main") {
        payload.prNumber ??= ini?.metadata.releasePrNumber;
        if (!payload.prNumber)
          throw new DomainError("Open the release pull request first (create_release_pr).");
      }
      if (i.kind === "prod_deploy") {
        payload.runId ??= ini ? await app.delivery.findWaitingProductionRun(ini) : undefined;
        if (!payload.runId)
          throw new DomainError(
            "No production deployment is waiting for approval yet. Check get_deployments and try again once the deploy-production run is waiting.",
          );
      }
      if (i.kind === "hire" && typeof payload.roleId !== "string")
        throw new DomainError("Hire requests need payload.roleId (and optionally payload.name).");
      if (ini) {
        // Merge/deploy gates carry GitHub facts (PR, checks, diff size, staging run…) and the release documents as evidence.
        const evidence = await app.delivery.gateEvidence(i.kind, ini, payload);
        Object.assign(payload, evidence.payload);
        documentIds = [...new Set([...documentIds, ...evidence.documentIds])];
      }
      const { approval, autoApproved } = await app.approvals.request({
        kind: i.kind,
        title: i.title,
        summary: i.summary,
        initiativeId: c.initiativeId,
        workItemId: c.workItemId,
        jobId: c.jobId,
        documentIds,
        payload,
        requestedByAgentId: c.agentId,
      });
      engine.turnState(c.jobId).awaitingApprovalId = approval.id;
      return { approvalId: approval.id, autoApproved };
    },

    async completeTask(c, i) {
      engine.turnState(c.jobId).completed = i;
    },

    async writeDocument(c, i) {
      const ini = c.initiativeId ? await app.lifecycle.get(c.initiativeId) : null;
      const { doc, version } = await app.docs.write(
        {
          agentId: c.agentId,
          initiativeId: c.initiativeId,
          productId: ini?.productId ?? null,
          workItemId: c.workItemId,
        },
        i,
      );
      return { id: doc.id, version };
    },

    async readDocument(c, i) {
      const doc =
        (await app.docs.find({ ...i, initiativeId: c.initiativeId })) ??
        (i.title || i.kind ? await app.docs.find({ title: i.title, kind: i.kind }) : null);
      return doc
        ? {
            id: doc.id,
            title: doc.title,
            kind: doc.kind,
            version: doc.currentVersion,
            status: doc.status,
            content: doc.content,
          }
        : null;
    },

    async listDocuments(c, i) {
      const docs = await app.docs.list({
        initiativeId: i.initiativeId ?? c.initiativeId ?? undefined,
        kind: i.kind,
      });
      return docs.map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        status: d.status,
        version: d.currentVersion,
        updatedAt: d.updatedAt.toISOString(),
      }));
    },

    async searchKnowledge(_c, i) {
      return app.docs.search(i.query, i.limit);
    },

    async getStatus(c, i) {
      return statusReport(app, i.initiativeId ?? null);
    },

    async createInitiative(c, i) {
      const job = await engine.getJob(c.jobId);
      // Every agent-created initiative is capped; a product is only attached when the directive names or implies one.
      const budgetCredits = i.budgetCredits ?? DEFAULT_INITIATIVE_BUDGET_CREDITS;
      const ini = await app.lifecycle.create({
        title: i.title,
        directive: job.kind === "chat" ? job.prompt : i.summary,
        summary: i.summary,
        productName: i.productName,
        createProduct: false,
        targetDate: i.targetDate ?? null,
        budgetCredits,
        skipStages: i.skipStages,
        createdByAgentId: c.agentId,
      });
      const product = ini.productId ? await app.company.getProduct(ini.productId) : null;
      return {
        initiativeId: ini.id,
        budgetCredits,
        defaultBudget: i.budgetCredits === undefined,
        productName: product?.name ?? null,
      };
    },

    async proposeRoadmap(c, i) {
      const id = i.initiativeId ?? c.initiativeId;
      if (!id) throw new DomainError("No initiative in context: pass initiativeId.");
      return { count: await app.lifecycle.setRoadmap(id, i.milestones) };
    },

    async createWorkItem(c, i) {
      const ini = c.initiativeId ? await app.lifecycle.get(c.initiativeId) : null;
      if (i.parentId) await app.work.get(i.parentId);
      const assignee = i.assignee ? await app.org.resolveAgent(i.assignee) : null;
      const item = await app.work.create({
        kind: i.kind,
        title: i.title,
        description: i.description,
        parentId: i.parentId ?? null,
        initiativeId: c.initiativeId,
        productId: ini?.productId ?? null,
        priority: i.priority ?? "p2",
        forCodingAgent: i.forCodingAgent ?? false,
        dependsOn: i.dependsOn ?? [],
        assigneeAgentId: assignee?.id ?? null,
        createdByAgentId: c.agentId,
        status: "ready",
      });
      const synced = await app.github.syncWorkItemToIssue(item.id);
      return { id: item.id, githubUrl: synced?.githubUrl ?? null };
    },

    async updateWorkItem(c, i) {
      const patch: Record<string, unknown> = {};
      if (i.status) patch.status = i.status;
      if (i.description) patch.description = i.description;
      if (i.priority) patch.priority = i.priority;
      if (i.assignee) patch.assigneeAgentId = (await app.org.resolveAgent(i.assignee)).id;
      await app.work.update(i.id, patch, { agentId: c.agentId });
    },

    async listWorkItems(c, i) {
      const items = await app.work.list({
        initiativeId: i.initiativeId ?? c.initiativeId ?? undefined,
        status: i.status,
        kind: i.kind,
        parentId: i.parentId,
      });
      const dtos = await app.work.dtos(items.filter((w) => w.kind !== "chat"));
      return dtos.map((w) => ({
        id: w.id,
        kind: w.kind,
        title: w.title,
        status: w.status,
        priority: w.priority,
        assignee: w.assigneeName,
        githubUrl: w.githubUrl,
        prUrl: w.prUrl,
        codingStatus: w.codingStatus,
      }));
    },

    async recordDecision(c, i) {
      const [row] = await app.db
        .insert(schema.decisions)
        .values({
          initiativeId: c.initiativeId,
          type: i.type,
          summary: i.summary,
          details: i.details ?? "",
          actorType: "agent",
          actorAgentId: c.agentId,
        })
        .returning();
      await app.bus.emit({
        type: "decision.recorded",
        actorType: "agent",
        actorId: c.agentId,
        subjectType: "initiative",
        subjectId: c.initiativeId,
        summary: `${c.agentName}: ${i.summary}`,
        data: { decisionId: row!.id, type: i.type },
      });
    },

    async remember(c, i) {
      await app.db.insert(schema.memories).values({ agentId: c.agentId, content: i.note });
      const rows = await app.db
        .select({ id: schema.memories.id })
        .from(schema.memories)
        .where(eq(schema.memories.agentId, c.agentId))
        .orderBy(asc(schema.memories.createdAt));
      if (rows.length > 50)
        await app.db.delete(schema.memories).where(
          inArray(
            schema.memories.id,
            rows.slice(0, rows.length - 50).map((r) => r.id),
          ),
        );
    },

    assignToCodingAgent: (c, i) => app.delivery.assignToCodingAgent(c, i),
    getPrStatus: (c, i) => app.delivery.prStatusText(c, i),
    getPrDiff: (c, i) => app.delivery.prDiff(c, i),
    reviewPullRequest: (c, i) => app.delivery.review(c, i),
    mergePullRequest: (c, i) => app.delivery.mergeToIntegration(c, i),
    createReleasePr: (c, i) => app.delivery.createReleasePr(c, i),
    getDeployments: (c, i) => app.delivery.deploymentsText(c, i),
    getCiStatus: (c, i) => app.delivery.ciStatusText(c, i),
  };
  return services;
}

async function statusReport(app: Techgens, initiativeId: string | null): Promise<string> {
  if (initiativeId) {
    const d = await app.lifecycle.detail(initiativeId);
    const items = await app.work.list({ initiativeId });
    const open = items.filter((w) => w.kind !== "stage" && w.status !== "done" && w.status !== "cancelled");
    return [
      `# ${d.title} — ${d.status}${d.statusReason ? ` (${d.statusReason})` : ""}, stage ${d.stage}`,
      `Stages: ${d.stages.map((s) => `${s.stage}:${s.state}`).join(", ")}`,
      `Work items: ${d.workItems.done}/${d.workItems.total} done, ${d.workItems.inProgress} in progress, ${d.workItems.blocked} blocked`,
      `Spend: ${formatCredits(d.spentCredits)}${d.budgetCredits ? ` of ${d.budgetCredits}` : ""} credits`,
      `Pending approvals: ${
        d.approvals
          .filter((a) => a.status === "pending")
          .map((a) => approvalHeadline(a.kind, a.title))
          .join("; ") || "none"
      }`,
      `Milestones: ${d.milestones.map((m) => `${m.title}${m.dueDate ? ` (${m.dueDate.slice(0, 10)})` : ""}`).join("; ") || "none"}`,
      `Documents: ${d.documents.map((x) => `${x.title} [${x.kind}, ${x.status}]`).join("; ") || "none"}`,
      `Open work: ${
        open
          .slice(0, 25)
          .map(
            (w) =>
              `${w.kind} "${w.title}" (${w.status}${w.codingStatus !== "unassigned" ? `, ${w.codingStatus}` : ""})`,
          )
          .join("; ") || "none"
      }`,
    ].join("\n");
  }
  const inis = await app.lifecycle.summaries(await app.lifecycle.list());
  const pending = await app.approvals.summaries(await app.approvals.list("pending"));
  const usage = await app.budget.summary(7);
  const jobs = await app.db
    .select({ status: schema.jobs.status, n: sql<number>`count(*)::int` })
    .from(schema.jobs)
    .where(inArray(schema.jobs.status, ["queued", "running", "waiting"]))
    .groupBy(schema.jobs.status);
  const products = await app.company.listProducts();
  return [
    "# Company status",
    `Products: ${products.map((p) => p.name).join("; ") || "none yet"}`,
    ...(inis.length
      ? inis.map(
          (x) =>
            `- ${x.title} (id ${x.id}): ${x.status}${x.statusReason ? ` (${x.statusReason})` : ""}, stage ${x.stage}, work ${x.workItems.done}/${x.workItems.total}, spent ${formatCredits(x.spentCredits)}${x.budgetCredits ? ` of ${formatCredits(x.budgetCredits)}` : ""} credits`,
        )
      : ["- No initiatives yet."]),
    `Pending CEO approvals: ${pending.map((a) => approvalHeadline(a.kind, a.title)).join("; ") || "none"}`,
    `Agent jobs: ${jobs.map((j) => `${j.n} ${j.status}`).join(", ") || "idle"}`,
    `AI credits: today ${formatCredits(usage.todayCredits)}, this month ${formatCredits(usage.monthCredits)}`,
  ].join("\n");
}

export { statusReport };
