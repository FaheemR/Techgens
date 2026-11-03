# Authoring roles

Roles are Markdown files in `packages/agents/roles/` with YAML frontmatter; the body is the persona prompt. They are
loaded and validated at startup (`roleFrontmatterSchema` in `packages/core/src/roles.ts`) and synced to the `roles`
table. Roles edited through the API (`PUT /api/roles/:id`) are marked `customized` and are no longer overwritten.

```markdown
---
id: data-analyst                # kebab-case, unique
title: Data Analyst
department: product             # executive|product|design|engineering|qa|devops|security|docs|marketing|sales|support|finance|legal|hr
reportsTo: cpo                  # role id; exactly one root (chief-of-staff)
description: One line used for routing and the org chart.
responsibilities: [Define metrics, Build dashboards]
tools: [write_document, read_document, search_knowledge, ask_agent, complete_task]
builtinTools: [web_fetch]       # optional; only web_fetch is permitted
executor: local-session         # or cloud-agent (implemented via Copilot cloud agent + .github/agents/<id>.agent.md)
model: gpt-5.4                  # optional; default = runtime default, overridable per role in Settings
reasoningEffort: medium         # optional
headcount: 1                    # agents staffed at first start
budget: { dailyCredits: 40, perJobCredits: 15 }
names: [Dana]
source: Adapted from … (licence)  # attribution when adapting third-party prompts
---
You are the Data Analyst. …
```

Guidelines
* Every local-session role needs `complete_task`. Managers need `delegate_task`; gate owners need `request_approval`.
* Keep personas specific: deliverable structure, definition of done, quality bar, when to escalate.
* The engine adds company context, the team roster, operating rules (tools, untrusted input, budget) and memories —
  don't repeat those in the persona.
* `cloud-agent` roles are rendered into product repositories as Copilot custom agents and used in
  `assign_to_coding_agent` (`custom_agent`).
* Run `pnpm test` — `packages/agents/test` validates every role file and the reporting tree.
