# Architecture

## Components

| Component | Tech | Responsibility |
|---|---|---|
| **Command Center** (`apps/web`) | Next.js 16, React 19, Tailwind 4, TanStack Query, React Flow | CEO UI: dashboard, directives chat, approvals inbox, org chart, work board, documents, strategy, budget, operations, settings. Live updates over SSE. |
| **Orchestrator** (`apps/orchestrator`) | Fastify 5, Drizzle, pg-boss 12, Copilot SDK | Domain services, job engine, agent tools, delivery monitor, REST/SSE API. |
| **PostgreSQL** | 17 | All state: company, org, initiatives, work graph, jobs, approvals, documents (versioned, full-text indexed), events, usage ledger, budgets, encrypted secrets, pg-boss queues. |
| **Copilot runtime** | Copilot CLI (bundled with the SDK, or `ghcr.io/github/copilot-cli` over TCP) | Runs agent sessions with the CEO's Copilot entitlement. |
| **GitHub** | REST/GraphQL via Octokit | Product repos, issues/sub-issues, Copilot cloud agent assignment, PR reviews/merges, environments, workflow runs. |
| **Azure** | azd + Bicep (Azure Verified Modules) via GitHub Actions + OIDC | Hosts the products the agents build (Container Apps, ACR, Key Vault, App Insights). |

## Packages

`core` (domain vocabulary, lifecycle, budgets, API DTOs) · `db` (schema + migrations) · `agents` (role files, prompt
builder, custom-agent renderer, default policies) · `runtime` (AgentRuntime interface, Copilot SDK adapter, scripted
fake) · `tools` (agent tool schemas) · `github` (port, Octokit adapter, in-memory simulator, App helpers) ·
`repo-template` (product repository bootstrap) · `azure` (OIDC setup script generator).

## The job engine

Every unit of agent work is a **job** (`jobs` table) for one agent, usually attached to a **work item**.
pg-boss only dispatches job ids; all state lives in Techgens tables, so restarts are safe (running jobs are re-queued).

```
queued ──claim──▶ running ──turn ends──┬─ complete_task ─────────────▶ succeeded ─▶ resume parent / advance lifecycle
   ▲                                    ├─ request_approval/escalate ──▶ waiting(approval) ─CEO decides─┐
   │                                    ├─ delegated children open ────▶ waiting(children) ─all done────┤
   │                                    ├─ coding agents working ──────▶ waiting(external) ─PR updates──┤
   │                                    └─ nothing → nudge once → succeed with last message             │
   └──────────────────────────────── resume(message) ◀──────────────────────────────────────────────────┘
```

* **Sessions**: one Copilot SDK session per job (`systemMessage` = company context + role persona + team + operating
  rules + memories). Resumes reuse the same session (persisted by the runtime), so agents keep their context for days.
  Chat threads with the Chief of Staff keep one session per thread.
* **Tools**: only Techgens tools (`availableTools: custom:*`, plus `web_fetch` for research roles) and role allowlists.
  `complete_task`, `request_approval` and `escalate` are *terminal* tools that end the turn.
* **Delegation**: `delegate_task` creates a child work item + job (depth + 1). The parent waits and is resumed with all
  children's results. Guardrails: max depth (default 4), max fan-out (8), no delegating up the chain, loop detection,
  coding work must go through `assign_to_coding_agent`.
* **Consultation**: `ask_agent` runs a short read-only session for the colleague and returns the answer inline.
* **Budgets**: every `assistant.usage` event (nano-AIU → AI credits) is written to `usage_ledger` with
  agent/role/department/initiative. Before each turn the engine checks company, department, agent, initiative and
  product budgets; at 80 % a warning event is emitted, at 100 % the job waits on a `budget_overrun` approval. Each job
  also has a per-session `sessionLimits.maxAiCredits` cap from the role.
* **Concurrency**: one running assignment per agent (chat is exempt); global worker concurrency is configurable.
* **Kill switches**: global pause, per-agent pause/retire, per-initiative pause/cancel, per-job cancel (aborts the
  live session and cascades to children).

## Lifecycle and gates

`intake → discovery → definition → design → architecture → planning → build → verification → release → deployment →
operate`. Each stage creates a stage work item and a job for the owner role (`STAGES` in `packages/core`). Gated
stages (`vision_roadmap`, `spec`, `architecture`, `merge_to_main`, `prod_deploy`) are **enforced by the engine**: an
owner can request approval itself, and if it finishes without one the engine files the gate. CEO decisions resume the
waiting job (`approved` / `changes_requested` with feedback / `rejected` → initiative paused). Gates can be switched
off in Settings (auto-approved and logged).

Side effects executed with the CEO's identity after approval: approved specs/architecture are published to the repo
`docs/`; `merge_to_main` merges the release PR; `prod_deploy` approves the waiting GitHub environment deployment.

## Delivery

* **Planning** bootstraps the product repository (if missing): template files, `develop` branch, labels, `staging` and
  `production` environments (CEO as required reviewer), branch protection with required checks.
* Work items of kind epic/story/task/bug are mirrored as GitHub issues (stories/tasks become sub-issues).
* **Build**: `assign_to_coding_agent` assigns the issue to `copilot-swe-agent` with an `agent_assignment`
  (`base_branch: develop`, `custom_agent: backend-engineer|frontend-engineer|qa-engineer`, custom instructions,
  optional model). The **delivery monitor** (every 60 s) tracks linked PRs (draft/`[WIP]` → ready → merged), and
  resumes the engineering manager to review (`review_pull_request`, as the GitHub App bot when configured) and merge
  into `develop` when CI is green. `request_changes` reviews mention `@copilot` so the cloud agent iterates.
* Merges to `develop` deploy to staging; the release PR into `main` deploys to production after the environment
  approval — which the CEO grants inside Techgens.

## Identity

* **PAT mode**: one fine-grained token owned by the CEO (Copilot Requests permission + repo permissions) powers both the
  Copilot SDK and GitHub calls; agent comments show the agent's name in the body.
* **GitHub App mode** (manifest flow): user-to-server token (auto-refreshed) for the Copilot SDK, Copilot assignment and
  CEO-authorised actions; installation token so agent reviews/issues are authored by `<app>[bot]`.

## Observability

Every state change is an `events` row (ordered by `seq`) streamed over SSE (`/api/events/stream`, resumable with
`Last-Event-ID`). Token deltas are streamed but not persisted. Job transcripts = events for `subject_type=job`.
