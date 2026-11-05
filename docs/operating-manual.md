# CEO operating manual

You are the only human in the company. Your job: set direction, make the calls only you can make, and keep the
agents within budget. Everything else is delegated.

## Daily loop

1. **Dashboard → Today** — start with **Needs attention**: pending decisions (highlighted after 24 hours),
   paused/blocked initiatives, enabled budgets at their configured warning threshold and unresolved incidents.
   **Review** opens a decision; **Open** goes to the affected work. Company setup is below this queue.
   Expand **Company overview** for initiative progress, jobs, goals, spend and key company events.
   Key events omit tool-call and usage telemetry; the full feed remains in Activity.
2. **Approvals** — choose an item to read its decision brief in a dedicated view. The consequence comes first,
   followed by applicable proposal evidence, risks and the requester's recommendation. Original summaries,
   documents and decision history remain available in expandable sections. Choose:
   - **Approve** — work continues (for releases/deploys Techgens performs the merge/deployment with your identity).
   - **Request changes** — write concrete feedback; the agent revises and resubmits (a new _round_).
   - **Reject** — the initiative pauses with the reason _Rejected at <gate>: <your comment>_. **Resume** restarts that
     stage: its owner proposes a different approach based on your comment and submits a new approval. Or cancel it.
   - Approvals leave the inbox (and their notifications are marked read) as soon as they are decided, auto-approved
     or withdrawn — cancelling an initiative withdraws its open gates. An initiative's paused/blocked notices are
     marked read when you resume, cancel or complete it.
   - After submitting, read the recorded outcome. **Review next** opens another pending decision only when you
     choose it; **Return to queue** shows the inbox and **View recorded decision** opens the saved evidence/history.
     The interface never advances to another approval automatically.
3. **Directives** — talk to the Chief of Staff: new initiatives, priorities, status questions ("where are we on
   InvoiceLite?"). Good directives state the outcome, the user, the deadline and the budget.
   Search conversation titles, rename a conversation or archive it. **Show archived → Restore** brings it back
   with all messages. Archiving only organises chat: it does not stop replies or initiatives. Unique, exact
   initiative names in agent replies link to their initiative; ambiguous duplicate names are left unlinked.

## Reading the interface

The dark theme uses soft slate surfaces and a dusty-blue accent for primary actions and active work.
Muted green means healthy or approved, amber marks attention or waiting, rose marks errors or destructive
actions, and violet marks proposals. Status labels and icons carry the meaning alongside colour.
Keyboard focus and field boundaries remain distinct from decorative card borders.

## Setting direction

- **Strategy → Company**: mission, vision, values, and _policies_ — the company constitution every agent reads
  (engineering standards, product principles, ways of working). Edits apply to new sessions and to new product repos.
- **Strategy → Goals**: objectives with key results; agents see them in status reports and plans.
  Set a KR **Baseline** as well as Current and Target. Progress measures change from the baseline, including
  descending targets. Existing goals retain zero as the assumed baseline until edited; historic baselines cannot
  be inferred from a current value.
- **Products**: one per thing you ship; each gets its own GitHub repository at the planning stage.

The expandable Dashboard setup checklist tracks saved strategy, a GitHub connection and the first sent directive.
Saving strategy does not complete the other steps. Dismissal is separate from progress; **Show setup checklist**
reopens it, including for companies whose previous version silently dismissed it. In demo mode GitHub readiness
means the simulator is ready, not that a real account was connected.

## Gates (default on)

| Gate                  | When                | What you check                                       |
| --------------------- | ------------------- | ---------------------------------------------------- |
| Vision & roadmap      | end of intake       | charter (goals, scope, non-goals, risks), milestones |
| Product spec          | end of definition   | PRD: stories, acceptance criteria, MVP scope         |
| Architecture          | end of architecture | design, ADRs, threat model, Azure topology           |
| Merge to main         | release             | release PR, test plan, release notes                 |
| Production deploy     | deployment          | change set, rollout and rollback plan                |
| Budget overrun        | any time            | which budget, spend, how many extra credits to grant |
| Decision / escalation | any time            | options and the agent's recommendation               |

Turn gates off in **Settings → Gate policy** to let them auto-approve (each auto-approval is logged). Every gate you
switch on or off is recorded in the activity feed and the company decision log ("CEO turned off the Production deploy
gate").

_Merge to main_ approvals carry the release PR (link, title, checks, files and lines changed, head commit), the
release notes and the test plan; _Production deploy_ approvals carry the run link, the commit, staging verification,
the rollback plan and the PRs in the release.
Every gate also has **Risk / blast radius** and **Recommendation** blocks. Vision/roadmap and product proposals
separate outcome, scope, success criteria, budget and timing; other gates show these fields when authored.
Excerpts identify their source and document version, stop at the next heading and are limited to 1,200 characters
per source section. Missing applicable evidence is explicitly called out. Full originals remain accessible;
failing release checks and missing deployment rollback guidance remain visible without opening a disclosure.
These are review aids,
not independent proof of safety or new execution permissions. Budget gates show spend by agent for the affected
budget's window; their suggested grant is a heuristic, not a completion forecast.

## Budgets

Copilot usage is measured in **AI credits**. Defaults: company 3,000/month; each agent has a daily budget from its
role. Add department, product or initiative budgets in **Budget**. At 80 % you get a warning; at 100 % work pauses
and a _budget overrun_ approval asks you how many extra credits to grant. A grant only extends the current window
(today, this week or this month) and expires with it — the budget's limit is unchanged; the amount you type always
wins, approving without one grants the suggested credits, and the decision states what was granted ("Granted 10
credits until 00:00 UTC"). An initiative's budget is one record: editing it on the initiative or on the Budget page
changes the same cap. Initiatives created by the Chief of Staff always get a total budget cap (100 credits when your
directive names none). Choose cheaper models for routine roles in
**Settings → Models**. Also set a spending limit for Copilot in your GitHub billing settings.

## The org

**Org chart** shows every agent, its manager, model, budget and current activity. You can pause or retire agents,
change models, adjust budgets and hire more agents of a role (e.g. a second backend engineer for parallel coding
work). Edit role prompts via `PUT /api/roles/:id` or in the role files (`packages/agents/roles`).

**Retire agent...** keeps history and spending records. Finish or cancel their queued/running/waiting jobs first;
then select an active same-role replacement if they have unfinished work. Retirement and work reassignment happen
together; completed/cancelled work stays attributed to the old agent and no new jobs start. Hire another Chief of
Staff before retiring the last active one. Pausing an agent prevents new turns, but does not interrupt an already
running turn.

## Emergencies

- **Pause all agents** (top bar) stops new turns immediately; running turns finish their current step.
- Cancel a job from **Activity**; cancel or pause an initiative from its page.
- **Operations → Incidents**: open an incident and the SRE agent investigates and mitigates.

## Ceremonies

**Operations → Routines**: weekly executive report (on by default), daily standup, sprint review, retrospective,
monthly roadmap review. Each run is a tracked work item; reports land in **Documents**.
