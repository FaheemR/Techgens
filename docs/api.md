# Techgens orchestrator API

Base URL: `http://localhost:3000/api/…` through the web app's same-origin proxy (forwards to `ORCHESTRATOR_URL`), or the orchestrator directly at `http://localhost:4000`. All routes are JSON under `/api`.
Response types live in `packages/core/src/api.ts` (`*DTO`). Errors: non-2xx with `ApiErrorBody` `{ error, code? }`.

## System
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/system` | — | `SystemInfo` |
| POST | `/api/system/pause` · `/api/system/resume` | — | `SystemInfo` (global kill switch for all agents) |
| GET | `/api/dashboard` | — | `DashboardDTO` |
| GET | `/api/events?limit=50&before=<seq>&subjectType=&subjectId=` | — | `LiveEvent[]` (newest first) |
| GET | `/api/events/stream?since=<seq>` | — | **SSE** stream; each message `event: <LiveEvent.type>`, `id: <seq>`, `data: LiveEvent` JSON. Ephemeral `agent.message_delta` events carry `data.jobId`, `data.threadId?`, `data.content` |

## Company & strategy
| Method | Path | Body | Response |
|---|---|---|---|
| GET / PUT | `/api/company` | `Partial<CompanyDTO>` | `CompanyDTO` |
| GET | `/api/goals` | — | `GoalDTO[]` |
| POST | `/api/goals` | `{ type, title, description?, parentId?, productId?, targetValue?, currentValue?, unit?, dueDate?, status? }` | `GoalDTO` |
| PATCH / DELETE | `/api/goals/:id` | partial of the above | `GoalDTO` / `204` |
| GET / POST | `/api/products` | `{ name, description?, vision?, repoOwner?, repoName? }` | `ProductDTO[]` / `ProductDTO` |
| GET / PATCH | `/api/products/:id` | partial | `ProductDTO` |
| POST | `/api/products/:id/bootstrap` | `{ createRepo: boolean, private?: boolean }` | `ProductDTO` (creates/bootstraps the GitHub repo from the product template) |
| GET | `/api/products/:id/azure-setup` | — | `AzureSetupDTO` `{ script, variables: per-environment map, steps }` (guidance text when the product has no repo or Azure subscription yet) |

## Initiatives
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/initiatives?status=` | — | `InitiativeSummaryDTO[]` |
| POST | `/api/initiatives` | `{ title, directive, productId?, targetDate?, budgetCredits? }` | `InitiativeDetailDTO` (starts intake with the Chief of Staff) |
| GET / PATCH | `/api/initiatives/:id` | `{ title?, summary?, targetDate?, budgetCredits? }` | `InitiativeDetailDTO` |
| POST | `/api/initiatives/:id/pause` · `/resume` · `/cancel` | — | `InitiativeDetailDTO` |

## Directives chat (CEO ↔ Chief of Staff)
| Method | Path | Body | Response |
|---|---|---|---|
| GET / POST | `/api/chat/threads` | `{ title? }` | `ThreadDTO[]` / `ThreadDTO` |
| GET | `/api/chat/threads/:id/messages` | — | `MessageDTO[]` (oldest first) |
| POST | `/api/chat/threads/:id/messages` | `{ content }` | `{ message: MessageDTO, jobId: string }` — the reply arrives via SSE (`agent.message_delta` with `data.threadId`, then `chat.message`) |

## Organisation
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/org` | — | `OrgDTO` |
| POST | `/api/agents` | `{ roleId, name? }` (hire) | `AgentDTO` |
| GET / PATCH | `/api/agents/:id` | `{ name?, status?, modelOverride?, dailyCreditsOverride? }` | `AgentDetailDTO` / `AgentDTO` |
| PUT | `/api/roles/:id` | `{ prompt?, model?, reasoningEffort?, tools?, budget? }` | `RoleDTO` |

## Work, jobs, documents, decisions
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/work-items?initiativeId=&status=&kind=&assigneeAgentId=&parentId=` | — | `WorkItemDTO[]` |
| POST | `/api/work-items` | `{ title, description, kind?, initiativeId?, assigneeRoleId? }` (CEO task) | `WorkItemDTO` |
| GET / PATCH | `/api/work-items/:id` | `{ status?, priority?, title?, description? }` | `WorkItemDTO & { children: WorkItemDTO[], jobs: JobDTO[] }` / `WorkItemDTO` |
| GET | `/api/jobs?status=&agentId=&limit=` | — | `JobDTO[]` |
| GET | `/api/jobs/:id` | — | `JobDTO & { events: LiveEvent[] }` (transcript) |
| POST | `/api/jobs/:id/cancel` · `/retry` | — | `JobDTO` |
| GET | `/api/documents?initiativeId=&kind=&q=` | — | `DocumentSummaryDTO[]` |
| GET | `/api/documents/:id?version=` | — | `DocumentDTO` |
| GET | `/api/decisions?initiativeId=` | — | `DecisionDTO[]` |

## Approvals (CEO inbox)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/approvals?status=pending` | — | `ApprovalSummaryDTO[]` |
| GET | `/api/approvals/:id` | — | `ApprovalDetailDTO` |
| POST | `/api/approvals/:id/decide` | `DecideApprovalRequest` | `ApprovalDetailDTO` |

## Budget & usage
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/usage/summary?days=30` | — | `UsageSummaryDTO` |
| GET / PUT | `/api/budgets` | `Array<{ scope, scopeId, period, limitCredits, warnPct?, enabled? }>` (upsert) | `BudgetDTO[]` |
| DELETE | `/api/budgets/:id` | — | `204` |

## Operations
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/deployments?productId=` | — | `DeploymentDTO[]` |
| GET / POST | `/api/incidents` | `{ title, productId?, severity?, details? }` | `IncidentDTO[]` / `IncidentDTO` |
| PATCH | `/api/incidents/:id` | `{ status? }` | `IncidentDTO` |
| GET | `/api/routines` | — | `RoutineDTO[]` |
| PATCH | `/api/routines/:id` | `{ enabled?, cron? }` | `RoutineDTO` |
| POST | `/api/routines/:id/run` | — | `{ jobId }` |
| GET | `/api/notifications` | — | `NotificationDTO[]` |
| POST | `/api/notifications/:id/read` · `/api/notifications/read-all` | — | `204` |

## Settings
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/settings` | — | `SettingsDTO` |
| PUT | `/api/settings` | `Partial<Omit<SettingsDTO,"github">>` (+ `mcpServers` entries may include `env`) | `SettingsDTO` |
| GET | `/api/settings/models` | — | `ModelOptionDTO[]` |
| POST | `/api/settings/github/token` | `{ token }` (fine-grained PAT) | `SettingsDTO` |
| DELETE | `/api/settings/github` | — | `SettingsDTO` |
| POST | `/api/settings/github/app` | `{ owner? }` | `{ action: string, manifest: string, state: string }` — the UI auto-submits a form `POST action` with field `manifest` (GitHub App manifest flow) |
| GET | `/api/github/app/callback?code&state` · `/api/github/oauth/callback?code&state` | — | redirects back to the web app `/settings?github=connected` |
