import type { FakeAgentRuntime, FakeTurnContext } from "@techgens/runtime";

/**
 * Scripted behaviour for every role so Techgens can run end-to-end without spending AI credits (demo mode and the
 * e2e pilot test). Agents act only through their real tools, exactly like Copilot-backed agents would.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const uuidOf = (text: string) => UUID.exec(text)?.[0];

function initiativeTitle(ctx: FakeTurnContext): string {
  return /\*\*Initiative:\*\* (.+?) \(id/.exec(ctx.history[0] ?? "")?.[1] ?? /Initiative: (.+?) \(id/.exec(ctx.history[0] ?? "")?.[1] ?? "the initiative";
}

const stageIs = (ctx: FakeTurnContext, title: string) => (ctx.history[0] ?? "").startsWith(`# Assignment: ${title}`);
const approved = (ctx: FakeTurnContext) => ctx.prompt.includes("The CEO APPROVED") || /was approved/.test(ctx.prompt);
const changesRequested = (ctx: FakeTurnContext) => ctx.prompt.includes("REQUESTED CHANGES");
const rejected = (ctx: FakeTurnContext) => ctx.prompt.includes("The CEO REJECTED");
const delegatedDone = (ctx: FakeTurnContext) => ctx.prompt.startsWith("Your delegated work has finished");

function deriveTitle(directive: string): { title: string; product?: string } {
  const product = /\b(?:[Bb]uild|[Ll]aunch|[Cc]reate|[Ss]hip)\s+([A-Z][\w-]+)/.exec(directive)?.[1];
  const sentence = directive.split(/[.:\n]/)[0]!.trim();
  return { title: (product ? `${product} MVP` : sentence).slice(0, 70), product };
}

export function installDemoScripts(rt: FakeAgentRuntime, options: { paceMs?: number } = {}): FakeAgentRuntime {
  const pace = () => (options.paceMs ? new Promise((r) => setTimeout(r, options.paceMs)) : Promise.resolve());

  async function writeDocs(ctx: FakeTurnContext, docs: Array<{ kind: string; title: string; body: string }>): Promise<string[]> {
    const ids: string[] = [];
    const revision = changesRequested(ctx) ? `\n\n## Revision\nAddressed CEO feedback:\n> ${ctx.prompt.split("\n").slice(2, 4).join(" ").trim()}` : "";
    for (const d of docs) {
      const res = await ctx.callTool("write_document", { kind: d.kind, title: d.title, content: `# ${d.title}\n\n${d.body}${revision}` });
      const id = uuidOf(res);
      if (id) ids.push(id);
      await pace();
    }
    return ids;
  }

  /** Standard gated deliverable: write docs → request approval → complete once approved. */
  async function gated(ctx: FakeTurnContext, gate: string, label: string, docs: () => Array<{ kind: string; title: string; body: string }>, before?: () => Promise<void>) {
    if (approved(ctx)) return void (await ctx.callTool("complete_task", { summary: `${label} approved by the CEO.` }));
    if (rejected(ctx)) return void (await ctx.callTool("complete_task", { summary: `${label} was rejected; stopping.`, outcome: "blocked" }));
    if (before && !changesRequested(ctx)) await before();
    const ids = await writeDocs(ctx, docs());
    await ctx.callTool("request_approval", { kind: gate, title: `${label} — ${initiativeTitle(ctx)}`, summary: `${label} is ready for your review. Key points are summarised at the top of each document.`, documentIds: ids });
  }

  const doc = (kind: string, title: string, body: string) => ({ kind, title, body });
  /** Registers a role script; consultations (read-only tools) get a short expert answer unless the script handles them. */
  const on = (roleId: string, script: (ctx: FakeTurnContext) => Promise<void>, consult = "From my perspective this looks sound; keep scope tight and document assumptions.") =>
    rt.on(roleId, async (ctx) => (ctx.labels.kind === "consult" && roleId !== "chief-of-staff" && roleId !== "business-analyst" && roleId !== "security-engineer" ? ctx.say(consult) : script(ctx)));

  on("chief-of-staff", async (ctx) => {
    if (ctx.labels.kind === "consult") return ctx.say("From the executive side: prioritise the smallest MVP that proves the value hypothesis, within budget.");
    if (ctx.labels.kind === "chat") {
      if (/\b(status|progress|update|where are we)\b/i.test(ctx.prompt)) {
        const status = await ctx.callTool("get_status", {});
        return ctx.say(`Here's where we stand:\n\n${status}`);
      }
      if (ctx.prompt.trim().length < 25) return ctx.say("Understood. Tell me what you'd like the company to build — ideally with a target date and a budget.");
      const { title, product } = deriveTitle(ctx.prompt);
      const budget = Number(/budget(?: of)? (\d+(?:\.\d+)?) credits/i.exec(ctx.prompt)?.[1] ?? NaN);
      await ctx.callTool("create_initiative", { title, summary: ctx.prompt.trim(), ...(product ? { productName: product } : {}), ...(budget > 0 ? { budgetCredits: budget } : {}) });
      return ctx.say(`On it. I opened the initiative **${title}** and started intake — I'll draft the charter and roadmap for your approval.`);
    }
    if (ctx.labels.kind === "routine") {
      const status = await ctx.callTool("get_status", {});
      await ctx.callTool("write_document", { kind: "report", title: `Executive report ${new Date().toISOString().slice(0, 10)}`, content: `# Executive report\n\n${status}` });
      return void (await ctx.callTool("complete_task", { summary: "Report published." }));
    }
    if (stageIs(ctx, "Intake")) {
      const t = initiativeTitle(ctx);
      return gated(
        ctx,
        "vision_roadmap",
        "Vision & roadmap",
        () => [
          doc("charter", `${t} — Charter`, `## Problem\nTarget users struggle with the workflow described in the directive.\n\n## Goals & OKRs\n- O1: Launch an MVP that early adopters use weekly\n  - KR1: 50 active accounts within 4 weeks of launch\n  - KR2: Activation rate ≥ 40%\n\n## Scope\nMVP core flows only. **Non-goals:** enterprise SSO, mobile apps.\n\n## Risks\n- Scope creep (mitigation: strict MVP gate)\n- Budget burn (mitigation: weekly budget review)`),
          doc("roadmap", `${t} — Roadmap`, `| Milestone | Target |\n|---|---|\n| Discovery & PRD approved | Week 1 |\n| Architecture approved | Week 2 |\n| MVP built on staging | Week 4 |\n| Production launch | Week 5 |`),
        ],
        async () => {
          await ctx.callTool("propose_roadmap", { milestones: [{ title: "PRD approved" }, { title: "Architecture approved" }, { title: "MVP on staging" }, { title: "Production launch" }] });
        },
      );
    }
    return void (await ctx.callTool("complete_task", { summary: "Done." }));
  });

  on("business-analyst", async (ctx) => {
    if (ctx.labels.kind === "consult") return ctx.say("Evidence suggests competitors over-serve enterprises; a simple, fast workflow for small teams is the gap.");
    await writeDocs(ctx, [doc("research", `${initiativeTitle(ctx)} — Market research`, "## Executive summary\nThree incumbents dominate; all are complex for small customers.\n\n## Competitors\n| Product | Strength | Weakness |\n|---|---|---|\n| A | Feature depth | Price |\n| B | Integrations | UX |\n\n## Recommendation\nWin on simplicity and speed-to-value. (Labelled: inference.)")]);
    await ctx.callTool("complete_task", { summary: "Market research published with competitor matrix and recommendations." });
  });

  on("product-manager", async (ctx) => {
    if (!stageIs(ctx, "Definition")) return void (await ctx.callTool("complete_task", { summary: "Done." }));
    await gated(
      ctx,
      "spec",
      "Product requirements",
      () => [doc("prd", `${initiativeTitle(ctx)} — PRD`, "## Overview\nMVP for the directive.\n\n## User stories\n1. As a user, I can sign up and create my first item.\n   - Given I'm new, When I sign up, Then I land on an empty dashboard with a guided first step.\n2. As a user, I can list and edit my items.\n\n## Non-functional\n- p95 page load < 1s; WCAG 2.2 AA; data encrypted at rest.\n\n## Release criteria\nAll must-have stories pass e2e tests on staging.")],
      async () => {
        await ctx.callTool("ask_agent", { agent: "business-analyst", question: "Which competitor gap should the MVP target first?" });
      },
    );
  });

  on("ux-designer", async (ctx) => {
    await writeDocs(ctx, [doc("ux_spec", `${initiativeTitle(ctx)} — UX specification`, "## Flows\n1. Sign up → onboarding → dashboard\n\n## Screens\n- Dashboard: header, item list, primary action 'New item'; empty/loading/error states\n\n## Accessibility\nKeyboard paths, focus order, AA contrast.")]);
    await ctx.callTool("complete_task", { summary: "UX specification published." });
  });

  on("software-architect", async (ctx) => {
    if (approved(ctx)) return void (await ctx.callTool("complete_task", { summary: "Architecture approved." }));
    if (rejected(ctx)) return void (await ctx.callTool("complete_task", { summary: "Architecture rejected.", outcome: "blocked" }));
    if (delegatedDone(ctx) || changesRequested(ctx)) {
      if (changesRequested(ctx)) await writeDocs(ctx, [doc("architecture", `${initiativeTitle(ctx)} — Architecture`, "## Revised architecture\nAddressed feedback.")]);
      return void (await ctx.callTool("request_approval", { kind: "architecture", title: `Architecture — ${initiativeTitle(ctx)}`, summary: "Modular monolith on Azure Container Apps; threat model mitigations included." }));
    }
    await writeDocs(ctx, [
      doc("architecture", `${initiativeTitle(ctx)} — Architecture`, "## Components\n- Web/API service (Node.js, TypeScript) on Azure Container Apps\n- PostgreSQL Flexible Server\n\n## Deployment\nazd + Bicep (AVM), staging & production, OIDC from GitHub Actions.\n\n## Well-Architected\nLeast privilege managed identity, Key Vault secrets, App Insights."),
      doc("adr", "ADR-001: Modular monolith", "## Decision\nStart with a modular monolith.\n\n## Consequences\nFaster delivery; split later if needed."),
    ]);
    await ctx.callTool("delegate_task", { assignee: "security-engineer", title: `Threat model for ${initiativeTitle(ctx)}`, instructions: "Produce a STRIDE threat model for the proposed architecture.", expectedOutput: "A threat_model document with prioritised mitigations" });
    ctx.say("Architecture drafted; waiting for the threat model before requesting approval.");
  });

  on("security-engineer", async (ctx) => {
    if (ctx.labels.kind === "consult") return ctx.say("Validate input at the edge, enforce authorisation per resource, keep secrets in Key Vault.");
    await writeDocs(ctx, [doc("threat_model", `${initiativeTitle(ctx)} — Threat model`, "| Threat (STRIDE) | Mitigation |\n|---|---|\n| Spoofing | OIDC + managed identity |\n| Tampering | Signed images, branch protection |\n| Information disclosure | Encryption, no PII in logs |")]);
    await ctx.callTool("complete_task", { summary: "Threat model published with 3 prioritised mitigations." });
  });

  on("engineering-manager", async (ctx) => {
    const t = initiativeTitle(ctx);
    if (stageIs(ctx, "Planning")) {
      const epic = uuidOf(await ctx.callTool("create_work_item", { kind: "epic", title: `${t}: MVP core`, description: "Core MVP capabilities from the PRD." }));
      for (const [title, desc] of [
        ["Health endpoint and service skeleton", "Implement GET /health and structured logging. Acceptance: returns {status:'ok'}; unit test."],
        ["Item API (create/list/edit)", "REST endpoints with validation and tests. Acceptance: CRUD covered by integration tests."],
        ["Dashboard UI with empty state", "Dashboard page per UX spec, accessible, with Playwright test."],
      ] as const) {
        await ctx.callTool("create_work_item", { kind: "task", title, description: desc, parentId: epic, forCodingAgent: true });
        await pace();
      }
      await writeDocs(ctx, [doc("plan", `${t} — Delivery plan`, "1. Skeleton & health\n2. Item API\n3. Dashboard UI\n\nAll tasks are PR-sized and assigned to the Copilot coding agent.")]);
      return void (await ctx.callTool("complete_task", { summary: "Backlog created (1 epic, 3 coding tasks) and mirrored to GitHub issues." }));
    }
    if (stageIs(ctx, "Build")) {
      if (ctx.prompt.includes("All coding tasks are merged")) return void (await ctx.callTool("complete_task", { summary: "All build tasks merged into the integration branch." }));
      const review = await ctx.callTool("list_work_items", { status: "in_review" });
      for (const pr of [...review.matchAll(/\/pull\/(\d+)/g)].map((m) => Number(m[1]))) {
        await ctx.callTool("get_pr_diff", { prNumber: pr });
        await ctx.callTool("review_pull_request", { prNumber: pr, verdict: "approve", body: "Meets the acceptance criteria; tests included." });
        await ctx.callTool("merge_pull_request", { prNumber: pr });
        await pace();
      }
      const ready = await ctx.callTool("list_work_items", { status: "ready", kind: "task" });
      for (const line of ready.split("\n").filter((l) => l.includes("[ready] task"))) {
        const id = uuidOf(line);
        if (id) await ctx.callTool("assign_to_coding_agent", { workItemId: id });
        await pace();
      }
      return ctx.say("Build loop step done: reviewed/merged ready PRs and assigned remaining tasks.");
    }
    if (stageIs(ctx, "Release")) {
      if (approved(ctx)) return void (await ctx.callTool("complete_task", { summary: "Release merged into main." }));
      await ctx.callTool("create_release_pr", { body: "## Release\nMVP: skeleton, item API, dashboard UI.\n\n## Testing\nCI green; verified on staging." });
      return void (await ctx.callTool("request_approval", { kind: "merge_to_main", title: `Release ${t}`, summary: "Release PR is green and verified on staging." }));
    }
    await ctx.callTool("complete_task", { summary: "Done." });
  });

  on("qa-lead", async (ctx) => {
    if (delegatedDone(ctx)) return void (await ctx.callTool("complete_task", { summary: "Verification passed on staging; release notes ready. Recommendation: GO." }));
    await ctx.callTool("get_ci_status", {});
    await ctx.callTool("get_deployments", { environment: "staging" });
    await writeDocs(ctx, [doc("test_plan", `${initiativeTitle(ctx)} — Test plan & verification`, "| Acceptance criterion | Test | Result |\n|---|---|---|\n| Sign up & dashboard | e2e | ✅ |\n| Item CRUD | integration | ✅ |\n\n**Recommendation: GO**")]);
    await ctx.callTool("delegate_task", { assignee: "technical-writer", title: `Release notes for ${initiativeTitle(ctx)}`, instructions: "Write release notes for the MVP release.", expectedOutput: "A release_notes document" });
  });

  on("technical-writer", async (ctx) => {
    await writeDocs(ctx, [doc("release_notes", `${initiativeTitle(ctx)} — Release notes`, "## Highlights\n- First release of the MVP\n\n## New\n- Dashboard\n- Item management\n\n## Known issues\n- None")]);
    await ctx.callTool("complete_task", { summary: "Release notes published." });
  });

  on("devops-engineer", async (ctx) => {
    if (approved(ctx)) return void (await ctx.callTool("complete_task", { summary: "Production deployment approved and rolling out." }));
    await ctx.callTool("get_deployments", { environment: "production" });
    await ctx.callTool("request_approval", { kind: "prod_deploy", title: `Deploy ${initiativeTitle(ctx)} to production`, summary: "Release merged; deploy-production run is waiting. Rollback: shift traffic to the previous revision." });
  });

  on("sre", async (ctx) => {
    await writeDocs(ctx, [doc("runbook", `${initiativeTitle(ctx)} — Runbook`, "## Alerts\n- Availability < 99.5% (5m)\n\n## Rollback\nShift 100% traffic to the previous Container Apps revision.")]);
    await ctx.callTool("complete_task", { summary: "Production healthy; runbook published." });
  });

  rt.on("*", async (ctx) => {
    if (ctx.labels.kind === "consult") return ctx.say("Sounds reasonable; no concerns from my side.");
    if (ctx.toolNames.includes("complete_task")) await ctx.callTool("complete_task", { summary: `Completed: ${ctx.prompt.split("\n")[0]!.slice(0, 120)}` });
  });
  return rt;
}
