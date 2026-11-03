# GitHub prior-art research for Techgens (checked 2026-11-02/03)

Checked 2026-11-02 → 2026-11-03. Stars / licence / last push verified live via the GitHub API unless marked †
(reported by research sub-agents, not re-checked — e.g. the `Azure`, `Azure-Samples` and `microsoft` orgs block API reads via SAML).

## 1. Headline findings
1. **`paperclipai/paperclip` is the closest existing product** — MIT, self-hosted "company of AI agents" (org chart, goals,
   task review/approval stages, budgets with auto-pause, routines, skills, team templates, plugin SDK, web/mobile UI).
   Its GitHub Copilot runtime merged 2026-10-20 but is **only in nightly/canary builds**; Copilot usage is **unpriced**
   (budgets block unpriced usage by default); no Copilot cloud agent, GitHub Projects or Azure delivery. → build-vs-reuse decision (§3).
2. **`bradygaster/squad`** is the most relevant *Copilot-SDK-native* multi-agent team runtime (charters, routing,
   decision log, "Ralph" work-monitor loop).
3. **Reusable content exists for most roles and stage artifacts:** `github/awesome-copilot` personas, `github/spec-kit`
   commands, BMAD-METHOD skills/templates, MetaGPT SOP chains.
4. **Infrastructure choices confirmed:** `pg-boss` (job-dependency workflows, cron, DLQ); official
   `github/copilot-cli/container` Dockerfile; `github/github-mcp-server` toolsets; Azure MCP Server (`microsoft/mcp`,
   documents Copilot SDK configuration and read-only mode); `xyflow` + `shadcn/ui`.
5. **Verified gotchas:** environment *required reviewers* on private repos need GitHub Enterprise; Agent Tasks API and issue
   `agent_assignment` are public preview; Copilot SDK fleet mode is experimental; several popular azd samples are archived;
   many adjacent tools are copyleft/source-available (§8).

## 2. "AI company" and AI dev-team systems
| Repo | Licence · ★ · last push | Stack | Relevance | Take for Techgens |
|---|---|---|---|---|
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT · 110,293 · 2026-11-02 | TS: Express 5, Drizzle, embedded Postgres, React | Very high | Governance / budget / heartbeat patterns, or a platform to build on (§3) |
| [bradygaster/squad](https://github.com/bradygaster/squad) | MIT · 3,321 · 2026-11-02 | TS on `@github/copilot-sdk` | High | Charters, routing rules, decisions log, Ralph loop, issue → `copilot-swe-agent` workflow† |
| [automazeio/ccpm](https://github.com/automazeio/ccpm) | MIT · 8,425 · 2026-10-19 | Shell/MD | High | PRD → epic → GitHub issues as source of truth → parallel agents; standup digest |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT (+ "BMad" trademark†) · 54,898 · 2026-11-02 | MD/Py | High | PRD / architecture / story / retrospective skills; append-only `.memlog.md` decision log† |
| [mubaidr/gem-team](https://github.com/mubaidr/gem-team) | Apache-2.0 · 228 · 2026-10-25 | MD | Medium | Phase-gated orchestrator / planner / reviewer contracts (`gem-orchestrator`) |
| [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) | MIT · ~71k† · 2026-01-21† | Python | Medium | SOP chain (`write_prd` → `design_api` → `project_management` → `write_code` → review); schema-constrained outputs |
| [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | MIT† · ~60k† · active | Python | Low–Med | Flows with `human_feedback` pause/resume + persistence |
| [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) | Apache-2.0† · ~35k† · active | Python | Low | Rewritten (2.0) into a generic graph engine |

## 3. Paperclip deep-dive (verified)
**What it is.** "If OpenClaw is an employee, Paperclip is the company." Node server + React UI (pnpm/turbo monorepo).
Stable releases every 1–2 weeks (latest v2026.1023.0: 200 commits incl. breaking changes); ~3.5k open issues, ~3.2k open PRs.
Adapters: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Pi, Hermes, Grok, Kimi, OpenClaw.

**Copilot support.** PRs #15701/#15703/#15705/#15706 (merged 2026-10-20) add a "GitHub Copilot" runtime: Paperclip Runner
→ ACP → Copilot CLI 1.0.88, authenticated with a *personal* fine-grained PAT with the "Copilot Requests" permission
(org-owned and classic PATs unsupported). **Not in stable v2026.1023.0** (merge commit is 417 commits ahead of the tag;
`doc/connections/github-copilot.md` absent at the tag); available via npm `nightly` (2026.1102.0-nightly.0) and
`canary` (2026.1103.0-canary.4). Usage is attributed to GitHub with USD unknown; since v2026.1023.0, budget policies
treat unpriced usage as "at limit" by default (`block`).

**Governance model worth copying** (MIT):
- *Execution policy per task* — ordered `review` / `approval` stages with agent or human participants; execution state
  `idle | pending | changes_requested | completed`; `issue_execution_decisions` audit table (outcome + required comment).
  Source: `docs/guides/execution-policy.md`.
- *Approvals* — `hire_agent`, `CEO strategy`; pending → approved / rejected / revision_requested → resubmitted.
  Source: `docs/guides/board-operator/approvals.md`.
- *Budgets* — company / agent / project monthly caps; 80 % soft alert, 100 % hard stop + auto-pause; exact ledger with
  reported / estimated / unpriced events. Source: `docs/guides/board-operator/costs-and-budgets.md`.
- *Heartbeats* — DB-backed wake-up queue with coalescing and budget checks; atomic task checkout + execution locks;
  goal ancestry injected into context; routines (cron / webhook / API) that create tracked tasks; company export/import
  with secret scrubbing.

**Plugin SDK** (`doc/plugins/PLUGIN_SPEC.md` §15). Plugins can create/update issues, documents, relations, goals,
routines, skills and managed agents; pause / resume / invoke agents; open agent sessions; register agent tools, scheduled
jobs, webhooks, outbound HTTP, a private DB namespace and UI pages / tabs / widgets. **Forbidden:** approval decisions,
budget override, auth bypass, checkout-lock override, direct DB access. The SDK is described as early; plugins are trusted code.

**GitHub.** Managed GitHub connections on a self-hosted instance need a one-time Paperclip Cloud approval (Cloud hosts the
OAuth callback and webhook inbox). The GitHub review bot is experimental.

**Fit for Techgens.** Covers org chart, task governance, budgets, routines and UI. The Techgens-specific needs —
Copilot-credit budgets, Copilot cloud agent, GitHub Projects sync, stage-gate lifecycle, Azure delivery — would all be
plugins constrained by the capability model, on top of a canary Copilot runtime and a fast-moving core.

## 4. Copilot and GitHub ecosystem
| Repo | Licence · ★ · last push | Relevance | Take |
|---|---|---|---|
| [github/copilot-sdk](https://github.com/github/copilot-sdk) | MIT · 10,655 · 2026-11-03 | Core | Agent runtime. Read `docs/features/` (custom-agents, fleet-mode, hooks, session-limits, usage-and-billing, streaming-events, session-persistence, cloud-sessions) and `docs/setup/` (backend-services, multi-tenancy, github-oauth). Fleet mode is experimental → pin SDK + CLI. "Microsoft Copilot SDK" rename announced 2026-10-28; package names unchanged so far |
| [github/copilot-cli](https://github.com/github/copilot-cli) | Proprietary CLI licence · 11,330 · 2026-11-03 | High | Official `container/` (Dockerfile, entrypoint.sh, smoke_test.py) → base for our runtime image; unmodified redistribution only† → build locally, never publish |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT · 40,723 · 2026-11-02 | High | Role personas (map below); Copilot SDK Node cookbook†; azd / Bicep skills†. Community-authored → review before use |
| [github/spec-kit](https://github.com/github/spec-kit) | MIT · 145,413 · 2026-11-02 | High | `templates/commands/`: constitution, specify, clarify, plan, tasks, analyze, checklist, converge, implement |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | MIT · 34,177 · 2026-11-02 | High | Role-scoped toolsets (issues, projects, pull_requests, repos, actions, code_security, secret_protection, dependabot†) and read-only mode |
| [github/gh-aw](https://github.com/github/gh-aw) | MIT · 5,568 · 2026-11-03 | Medium | Agentic workflows in Actions with "safe outputs" — optional in-repo automations (CI-failure triage, reports); pin versions (past security advisory†) |
| [octokit/octokit.js](https://github.com/octokit/octokit.js), [octokit/app.js](https://github.com/octokit/app.js) | MIT† | High | REST/GraphQL, GitHub App manifest flow, installation tokens, pending-deployment reviews |
| [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol) | Apache-2.0† | Low–Med | Copilot CLI speaks ACP (`--acp`); the SDK uses its own JSON-RPC. Possible future adapter for non-Copilot harnesses |
| Copilot cloud agent APIs ([docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api)) | — | Core | Agent Tasks API `POST /agents/repos/{owner}/{repo}/tasks` (states queued … cancelled) and issue assignment with `agent_assignment {target_repo, base_branch, custom_instructions, custom_agent, model}`; user-to-server tokens only; public preview |
| microsoft/agent-framework | † (SAML-blocked) | Low | Copilot SDK docs: TypeScript apps should use the SDK directly (MAF integration packages are .NET/Python) |

**Persona map — awesome-copilot → Techgens roles** (files verified unless †)
| Techgens role | Start from |
|---|---|
| Chief of Staff | `gem-orchestrator` |
| CPO / Product Manager | `se-product-manager-advisor`, `prd` |
| UX/UI Designer | `se-ux-ui-designer` |
| CTO / Architect | `se-system-architecture-reviewer` |
| Security Engineer | `se-security-reviewer` |
| DevOps Engineer | `devops-expert`, `se-gitops-ci-specialist`, `bicep-plan`, `bicep-implement`, `azure-verified-modules-bicep` |
| SRE | `platform-sre-kubernetes`†, `cloud-saas-outage-triage`† (adapt to Container Apps) |
| QA Lead / Engineer | `qa-subagent`, `playwright-tester` |
| Technical Writer | `se-technical-writer` |

**spec-kit → Techgens lifecycle**
| spec-kit | Techgens |
|---|---|
| constitution | Company policies & engineering standards (→ `.github/copilot-instructions.md`) |
| specify + clarify | PRD with an explicit open-questions loop before the spec gate |
| plan | Architecture, ADRs, NFRs (architecture gate) |
| analyze + checklist | Automated cross-artifact consistency and quality checklists before each gate |
| tasks | Epic / story / task breakdown → GitHub issues and sub-issues |
| implement | Issue assignment to Copilot cloud agent |

## 5. Orchestration infrastructure
| Repo | Licence · ★ | Verdict |
|---|---|---|
| [timgit/pg-boss](https://github.com/timgit/pg-boss) | MIT · 4,119 (active; dashboard-1.13.0 on 2026-10-27) | **Adopt** — job-dependency workflows, cron, retries/backoff, priorities, dead-letter queues, OpenTelemetry |
| [dbos-inc/dbos-transact-ts](https://github.com/dbos-inc/dbos-transact-ts) | MIT · 1,427 | Fallback — in-process durable workflows on Postgres (suits multi-day approval waits) |
| hatchet-dev/hatchet | MIT† | Escalation path if we outgrow pg-boss (Postgres-backed, TS SDK) |
| temporalio/temporal | MIT† | Skip — multi-service server is heavy for local Compose; borrow signal/query ideas |
| inngest/inngest · restatedev/restate | SSPL† · BSL-1.1† | Skip engines (source-available); borrow `waitForEvent` / virtual-object ideas |
| triggerdotdev/trigger.dev | Apache-2.0† | Ideas: human-in-the-loop wait tokens |
| langchain-ai/langgraphjs · mastra-ai/mastra · openai/openai-agents-js | MIT† · Apache-2.0 core† · MIT† | Ideas: interrupt/resume, suspend/resume, handoff vs agent-as-tool. Not adopted (their model layers aren't the Copilot SDK) |

## 6. UI, tracking, memory, observability
| Repo | Licence · ★ | Verdict |
|---|---|---|
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | MIT · 38,879 | Adopt — org chart, work graph |
| shadcn-ui/ui | MIT† | Adopt — dashboard, approvals inbox, kanban |
| [frappe/gantt](https://github.com/frappe/gantt) | MIT · 6,158 (last push 2026-06-18) | Adopt for the roadmap timeline (or a light custom view) |
| makeplane/plane · hcengineering/platform (Huly) · opf/openproject | AGPL-3.0† · EPL-2.0† · GPL-3.0† | Ideas only: cycles, modules, roadmap, triage states |
| operately/operately | Apache core + EE† (API shows NOASSERTION) | Ideas: OKR check-ins |
| BloopAI/vibe-kanban | Apache-2.0† | UX reference only; company reportedly ended commercial operations† |
| MrLesk/Backlog.md · eyaltoledano/claude-task-master | MIT† · MIT + Commons Clause† | Ideas: definition of done, task dependencies / complexity scoring |
| langfuse/langfuse | MIT core + EE (API shows NOASSERTION) · 36,917 | Optional later — self-hosting needs web, worker, Postgres, ClickHouse, Redis, MinIO (verified compose file) |
| Arize-ai/phoenix · AgentOps-AI/agentops | ELv2† · MIT† | Skip |
| OpenTelemetry GenAI semantic conventions | Apache-2.0 | Adopt for span naming alongside the SDK's built-in OpenTelemetry |
| mem0 · letta · graphiti · cognee | Apache-2.0† | Later — Python services needing embeddings beyond Copilot; start with Postgres full-text search + summaries |

## 7. Azure delivery, QA, security, SRE
| Item | Licence · status | How Techgens uses it |
|---|---|---|
| Azure/azure-dev (azd) | MIT† | `azure.yaml` + `infra/`, `azd provision/deploy`, `azd pipeline config` (OIDC) |
| Azure-Samples/azd-starter-bicep | MIT† | Skeleton for the product template |
| Azure/bicep-registry-modules (Azure Verified Modules) | MIT† | Pinned `br/public:avm/res/app/container-app`, `container-registry/registry`, `key-vault/vault`, `consumption/budget`; `avm/ptn/aca-lza/hosting-environment` for a fuller landing zone |
| GitHub Actions | MIT† | `azure/login@v2` (OIDC), `Azure/setup-azd@v2`, `Azure/bicep-deploy@v2`, `github/codeql-action@v4`, `ossf/scorecard-action@v2` — re-verify versions when generating templates |
| Azure MCP Server — [microsoft/mcp](https://github.com/microsoft/mcp) (`servers/Azure.Mcp.Server`) | MIT† · GA† | README documents Copilot CLI + **Copilot SDK** configuration and read-only mode (verified); namespace scoping†; no Cost Management namespace† |
| microsoft/playwright · microsoft/playwright-mcp | Apache-2.0† | QA agent's test runner + browser tool (not a security boundary) |
| HolmesGPT/holmesgpt | Apache-2.0† (CNCF sandbox) | Later — needs its own LLM provider |
| Azure SRE Agent | Managed service, no OSS engine† | Out of scope |
| `@azure/arm-costmanagement` | MIT† | Finance agent (business-departments phase) |
| Archived — avoid | — | `todo-nodejs-mongo(-aca)`†, `Azure-Samples/copilot-sdk-service`†, `Azure-Samples/mcp-container-ts`†, `Azure/azure-mcp`† |

## 8. Licence watch-list
- **Safe to reuse with attribution (MIT / Apache-2.0 / ISC):** Paperclip, squad, ccpm, BMAD (not its trademarks), awesome-copilot
  (community content — review), spec-kit, MetaGPT, pg-boss, DBOS, xyflow, shadcn/ui, frappe-gantt.
- **Ideas only (copyleft / source-available / restricted):** Plane and claude-squad (AGPL-3.0), OpenProject (GPL-3.0), Huly (EPL-2.0),
  gpt-pilot (FSL-1.1-MIT), AutoGPT platform (PolyForm Shield), claude-task-master (Commons Clause), Inngest (SSPL),
  Restate (BSL-1.1), Phoenix (ELv2).
- **Special:** Copilot CLI uses a proprietary licence → build the runtime image locally; never publish it.

## 9. Verified gotchas to design for
- GitHub environment **required reviewers** and wait timers on **private** repos need GitHub Enterprise → create product repos in the enterprise org.
- Agent Tasks API and issue `agent_assignment` are **public preview**; both need user-to-server tokens.
- Copilot SDK **fleet mode** is experimental; pin SDK and CLI versions together.
- Paperclip's Copilot runtime is **nightly/canary only**; its budgets block unpriced (Copilot) usage by default.
- Azure Monitor action groups can't create GitHub issues natively, and a local app can't receive webhooks → poll alerts (relay Function later).
- OIDC federated credentials: one per environment subject (`repo:<org>/<repo>:environment:<name>`).
