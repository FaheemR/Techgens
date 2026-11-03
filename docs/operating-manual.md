# CEO operating manual

You are the only human in the company. Your job: set direction, make the calls only you can make, and keep the
agents within budget. Everything else is delegated.

## Daily loop
1. **Dashboard** — active initiatives and their stage, pending approvals, agent activity, spend vs budget.
2. **Approvals** — work the inbox. Every item shows the documents or PRs under review. Choose:
   * **Approve** — work continues (for releases/deploys Techgens performs the merge/deployment with your identity).
   * **Request changes** — write concrete feedback; the agent revises and resubmits (a new *round*).
   * **Reject** — the initiative pauses until you resume or cancel it.
3. **Directives** — talk to the Chief of Staff: new initiatives, priorities, status questions ("where are we on
   InvoiceLite?"). Good directives state the outcome, the user, the deadline and the budget.

## Setting direction
* **Strategy → Company**: mission, vision, values, and *policies* — the company constitution every agent reads
  (engineering standards, product principles, ways of working). Edits apply to new sessions and to new product repos.
* **Strategy → Goals**: objectives with key results; agents see them in status reports and plans.
* **Products**: one per thing you ship; each gets its own GitHub repository at the planning stage.

## Gates (default on)
| Gate | When | What you check |
|---|---|---|
| Vision & roadmap | end of intake | charter (goals, scope, non-goals, risks), milestones |
| Product spec | end of definition | PRD: stories, acceptance criteria, MVP scope |
| Architecture | end of architecture | design, ADRs, threat model, Azure topology |
| Merge to main | release | release PR, test plan, release notes |
| Production deploy | deployment | change set, rollout and rollback plan |
| Budget overrun | any time | which budget, spend, how many extra credits to grant |
| Decision / escalation | any time | options and the agent's recommendation |

Turn gates off in **Settings → Gate policy** to let them auto-approve (each auto-approval is logged).

## Budgets
Copilot usage is measured in **AI credits**. Defaults: company 3,000/month; each agent has a daily budget from its
role. Add department, product or initiative budgets in **Budget**. At 80 % you get a warning; at 100 % work pauses
and a *budget overrun* approval asks you how many extra credits to grant. Choose cheaper models for routine roles in
**Settings → Models**. Also set a spending limit for Copilot in your GitHub billing settings.

## The org
**Org chart** shows every agent, its manager, model, budget and current activity. You can pause or retire agents,
change models, adjust budgets and hire more agents of a role (e.g. a second backend engineer for parallel coding
work). Edit role prompts via `PUT /api/roles/:id` or in the role files (`packages/agents/roles`).

## Emergencies
* **Pause all agents** (top bar) stops new turns immediately; running turns finish their current step.
* Cancel a job from **Activity**; cancel or pause an initiative from its page.
* **Operations → Incidents**: open an incident and the SRE agent investigates and mitigates.

## Ceremonies
**Operations → Routines**: weekly executive report (on by default), daily standup, sprint review, retrospective,
monthly roadmap review. Each run is a tracked work item; reports land in **Documents**.
