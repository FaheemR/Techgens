# Techgens Command Center: UX re-test of the fix build

| | |
|---|---|
| **Build re-tested** | Production build at `http://localhost:3100` (API `127.0.0.1:4100`, same-origin `/api`), demo mode, web v0.1.0. Fix commits `23684e4…af74e1a` (branch `ux-fixes`). |
| **Baseline** | [original review](../README.md) (3 Nov 2026, `:3000` build): findings F01–F37 and the original scorecard |
| **Date / evaluator** | 3 Nov 2026 · same senior UX evaluator |
| **Method** | Re-ran every F01–F37 repro, prioritising Critical/High items and everything claimed fixed. Ran a full gate cycle on a new directive: vision gate (request changes, then round 2), PRD, architecture, merge to main, production deploy, completed. Also tested: reject, pause and resume; cancel and withdraw; gate-off confirmation; three budget overruns (company day, initiative total, agent day) with grants; chat while blocked and while paused. Measurements: scripted contrast (computed colours, alpha-composited), iframe reflow (17 routes × 390/768 px, and 320 px for the routes that previously failed), dialog focus, headings, ARIA, and phone layouts. The source was read only to suggest root causes. |
| **Data created** | Directive "Build RentRoll… 150 credits/week" became **RentRoll MVP**, completed through every gate. Two more initiatives were created and then cancelled (onboarding, referral). InvoiceLite now waits at *Merge to main*, and the client portal at *Architecture*. |
| **Restored** | Gate policy is all on (verified via API). Limits and models per role are unchanged, and agents are not paused. The temporary company daily budget was deleted. Grace's budget is back to 120, InvoiceLite to 400 and the portal to 1200. The decision log still records three one-off grants: Grace +0.5 (expires at 00:00 UTC), InvoiceLite +10 and portal +2. |

Screenshots are in this folder: `NN-*.webp` are re-test evidence and `N*-*.webp` are new issues.

---

## 1. Verdict

**The fix build is a substantial, real improvement.** All eight High findings are fixed, and they were fixed well. Rejecting a gate now pauses the initiative with your reason and a clear Resume path. Cancelling an initiative withdraws its gate. Turning off an oversight gate needs a confirmation that spells out the consequence, and the change is audited. The chat tells the truth about blocked and paused work. Questions no longer create work. Budget grants show their real effect before you commit. On accessibility, reflow, non-text contrast, live regions, headings and form semantics now pass.

The one Critical finding, F01, is about half fixed. Merge-to-main and production-deploy approvals now carry real evidence: PR and run links, required checks, change size, a "Verified on staging" proof, a rollback plan, and a "What you're approving" line. They still lack a risk and recommendation section, and the vision and PRD gates remain generic.

The most important *new* problem is **N1: after a budget grant, an already-approved gate is requested again**. This undermines the gate model the product is built on.

| Status | Count | Items |
|---|:-:|---|
| **Fixed** | **19** | F02, F03, F04, F05, F06, F07, F08, F09, F10, F13, F14, F15, F17, F22, F23, F24, F29, F30, F32 |
| **Partially fixed** | **13** | F01, F11, F12, F16, F18, F21, F25, F26, F27, F31, F33, F34, F36 |
| **Not fixed** | **5** | F19, F20, F28, F35, F37 |
| **Regressed** | **0** | none |

**Claims compared with my verification:**
- Claimed fixed: 25 items. I confirmed 19. Six are only partial: F11, F12, F16, F26, F27 and F31.
- Claimed partially fixed: 7 items. I confirmed all 7 as partial.
- Not addressed: 5 items. I confirmed all 5 are still open.

**By original severity:**

| Original severity | Fixed | Partially fixed | Not fixed |
|---|:-:|:-:|:-:|
| Critical (1) | 0 | 1 (F01) | 0 |
| High (8) | 8 | 0 | 0 |
| Medium (20) | 9 | 8 | 3 |
| Low (8) | 2 | 4 | 2 |

**New issues: 13 in total.** One is High (N1), four are Medium (N2–N5) and eight are Low (N6–N13). Two were introduced by the fixes themselves, both Low: N11 and N12. The others existed before but only showed up during this deeper re-test, or come from legacy data.

**UX maturity: 3 → 3.5 / 5** ("defined", now approaching "CEO-grade").

---

## 2. Re-test results F01–F37

| ID | Sev. (orig.) | Status | Evidence | Note |
|---|---|---|---|---|
| F01 | Critical | **Partially fixed** | [13](13-merge-gate-evidence.webp), [13b](13b-merge-gate-evidence-full.webp), [14](14-deploy-gate-evidence.webp), [14b](14b-deploy-gate-details.webp), [17](17-budget-overrun-gate.webp) | **Merge to main** now shows: "What you're approving: Merging the release PR #8 into main. Required checks must be green."; a *View pull request #8* link; "All 2 checks passed" with chips (ci / build-and-test, codeql / analyze); change size +19 / −0 in 7 files; the commit; change set #5–#7; and release notes. **Deploy** shows links to workflow run #1003 and the release PR, a "Verified on staging" chip, the change set, a rollback plan and staging evidence. **Budget** shows spend vs limit, when the window resets and a suggested grant. IDs are moved into a collapsed *Technical details*. **Still missing:** there is no *Risk / blast radius* or *Recommendation* block on any gate. Vision and PRD summaries are still the generic "…is ready for your review. Key points are summarised at the top of each document.". Budget gates have no spend breakdown. A raw label "Release pr number" remains. The remaining problem is now **Medium**. |
| F02 | High | **Fixed** | [05](05-reject-dialog.webp), [06](06-after-reject-next-item.webp), [07](07-initiative-rejected-paused.webp), [08](08-initiative-resumed-new-proposal.webp) | The confirmation is titled "Reject vision & roadmap?" and opens with focus on *Go back*. The initiative then shows **Paused**, with the banner "Paused after your rejection — Rejected at Vision & roadmap: ⟨comment⟩" and two actions: *Resume (ask for a new proposal)* and *Cancel initiative…*. Resume restarted the stage, and the revised proposal's summary quotes the feedback. The initiative is no longer counted as active. |
| F03 | High | **Fixed** | [21](21-cancelled-initiative-withdrawn.webp), [22](22-approvals-withdrawn.webp) | The cancel dialog says "Its pending approval is withdrawn", with *Keep initiative* focused. The approval moves to **Withdrawn**, with the banner "Withdrawn — the initiative was cancelled". Nothing says "waiting on you" on a cancelled page any more. |
| F04 | High | **Fixed** | [10](10-gate-off-confirm.webp), [11](11-gate-off-toast.webp), [12](12-approvals-architecture-gate-off-chip.webp) | The dialog asks "Turn off the Production deploy gate? Agents will deploy to production without asking you", with focus on *Keep asking me*. Afterwards: a toast, an *Auto-approved* badge, a "1 gate off → Settings" chip on Approvals and Settings, and a decision-log entry "CEO turned off the Production deploy gate". Minor: the toast has no *Undo*. |
| F05 | High | **Fixed** | [18](18-chat-blocked-by-budget.webp), [19](19-chat-paused.webp) | While blocked, the chat shows "Morgan **waiting on you** — Waiting for your budget decision … [Review →]" and the composer reads "The Chief of Staff is waiting for your decision". While paused, it shows "Agents are paused — this reply continues when you resume [Resume agents]". There is no "thinking · 45s" any more. |
| F06 | High | **Fixed** | [02](02-chat-question-answered.webp), [03](03-chat-after-send-new-thread.webp) | "What is our total spend so far?" was answered without creating any work. "150 credits/week … 6 weeks" became a **900-credit total**, and the reply explained the conversion. With no budget given, the reply explained a default cap of 100. Titles are short ("RentRoll MVP"). An existing product was matched, and new products are announced. Low-severity leftovers: there is still no proposal or confirmation card before work is created, and "target 3 weeks" did not set a target date. |
| F07 | High | **Fixed** | [27](27-approvals-390.webp), [28](28-org-390.webp), §4.2 | All **17 routes** at 390 px and 768 px have no page-level horizontal overflow (before: six pages failed at 390 px and one at 768 px). The 8 routes that failed before also pass at **320 px**. |
| F08 | High | **Fixed** | [17](17-budget-overrun-gate.webp), [15](15-budget.webp) | *Extra credits* is **prefilled with the suggested 10**, with a live hint: "Grants 10 credits until 00:00 UTC; today's limit becomes 10.16". The only actions are *Reject* and *Grant credits*. The header reads "Company-wide · Budget guard", with no link to an unrelated initiative. The Budget table now shows "+ 10 granted until Nov 4, 12:00 AM" instead of folding the grant into the limit. There is still no top-spenders view (tracked under F01). See also N5. |
| F09 | High | **Fixed** | §4.1 | Input border `#5a6c87` against its fill measures **3.57:1** (was 1.32). The off-switch border is **3.54:1**; the track alone is 1.18, but the border carries the boundary. Progress and stage tracks have a 1 px inset ring at **3.54:1** (was 1.15). |
| F10 | Medium | **Fixed** | §4.1 | The bell badge is white on `#e11d48`: **4.70:1** (was 3.75). That passes, but only just. |
| F11 | Medium | **Partially fixed** | §4.3 | **Now correct:** the first field gets focus in New initiative, New task, Report incident, New objective, Add budget, Edit budget and Edit schedule; confirmations focus the *safe* action; after an invalid submit, focus moves to the first invalid field; after a decision, focus moves to the next item's heading. **Still on "Close dialog":** *Edit initiative* (no `data-autofocus`), *Hire agent*, and the *Remove this budget?* confirmation. |
| F12 | Medium | **Partially fixed** | §4.3 | The comment is now read with `FormData` at submit time, and 4 of 4 controlled first-click tests (enter a comment, submit immediately) worked. However, earlier in the session two first clicks with no instrumentation, *Reject* at 12:31 and *Request changes* at 12:33, right after the item was auto-selected, did nothing visible: no error and no dialog. That may be a test-tool timing artefact, so I can't call it proven. Keep the e2e test and the re-mount investigation from the original recommendation. Related: N5. |
| F13 | Medium | **Fixed** | DOM check | The shell has persistent `aria-live` polite and assertive regions. Decision toasts are announced, e.g. "Rejected — the team has your reason. Next: …". |
| F14 | Medium | **Fixed** | Heading scan | Each page has exactly one H1 and no skipped levels. Checked on Documents viewer, Approvals detail, Directives, Dashboard, Budget and Initiative detail. Agent markdown is shifted down to the correct heading level. |
| F15 | Medium | **Fixed** | [24](24-completed-initiative-stepper.webp), [07](07-initiative-rejected-paused.webp) | Passed gates show a green check-shield labelled *Approved*. The waiting gate shows amber *Waiting on you*. Rejected is red, upcoming is muted, and the legend includes withdrawn. |
| F16 | Medium | **Partially fixed** | [25](25-initiatives-list.webp), [31](31-goals.webp), [20](20-initiative-overrun.webp) | Work counts now agree across the card, the tab and the detail page (17/17). **Still wrong:** the objective shows "On track" while one of its KRs is "At risk" (no roll-up). The initiative budget on cards differs from the limit actually enforced (N3). |
| F17 | Medium | **Fixed** | [15](15-budget.webp), [25](25-initiatives-list.webp), [14b](14b-deploy-gate-details.webp) | Numbers read "3,000", "< 0.01" and "900 cr · total", with no ".0" suffixes and units used consistently. Run IDs are no longer formatted as quantities. |
| F18 | Medium | **Partially fixed** | [02](02-chat-question-answered.webp), contrast scan | IDs are hidden on gate briefs. **Still showing internals:** a chat status reply listed **6 UUIDs**; the Activity filter and feed show event codes (`work_item.updated`, `usage.recorded`); usage reads "< 0.01 credits on fake-standard"; and the "Release pr number" label remains. |
| F19 | Medium | **Not fixed** | [30](30-dashboard-full.webp), [16](16-dashboard-during-overrun.webp) | There is still no "Needs attention" view. During the overrun tests, blocked or paused initiatives and budget blocks surfaced only through the bell and chat. The right column is still a telemetry feed. |
| F20 | Medium | **Not fixed** | — | There is still no way to retire or remove an agent. *Pause agent* still doesn't explain what happens to in-flight work. |
| F21 | Medium | **Partially fixed** | [29](29-work-board.webp) | *Done* is collapsed to 10 cards plus "Show all 60", and stage cards carry an initiative chip. **Still missing:** an edge fade or scroll hint (the board's `scrollWidth` is 1788 vs 1136 visible at 1440 px, so *In review* and *Done* are off-screen), a *Move to…* menu, and undo after a drop. |
| F22 | Medium | **Fixed** | [05](05-reject-dialog.webp), [21](21-cancelled-initiative-withdrawn.webp) | The buttons now read "Cancel initiative…" / "Keep initiative" and "Reject vision & roadmap" / "Go back". |
| F23 | Medium | **Fixed** | DOM check | Required controls have `aria-required="true"`, and `aria-describedby` points to the hint and, when shown, the error. |
| F24 | Medium | **Fixed** | [26](26-not-found-initiative.webp) | The not-found page reads "This initiative doesn't exist or was removed…" with *Back to initiatives*. Documents and jobs use the same pattern, and the useless *Retry* is gone. A malformed `?status=` still shows a raw error (N7). |
| F25 | Medium | **Partially fixed** | [27](27-approvals-390.webp), [28](28-org-390.webp) | On phones the decision bar is compact: a one-line comment field and three buttons on one row, with a short "Changes" label. Org opens in *Directory* view on phones. The **Demo badge is still hidden below 640 px**. Laptops at 1280×720 have a related problem (N13). |
| F26 | Medium | **Partially fixed** | [09](09-round2-detail.webp) | Comment placeholders now fit each gate kind, list titles no longer repeat the kind, and the empty states are better. **Still open:** the *Changes requested* filter is empty in practice (and its empty state says "Nothing in revision", so label and copy disagree). Round 2's "Revision" section still only quotes the CEO comment, with no v1→v2 diff. Notification bodies still repeat the kind. |
| F27 | Medium | **Partially fixed** | [23](23-notifications.webp), [N12](N12-approvals-filter-overflow-1280.webp) | Notifications for decided approvals are now marked read automatically. But the bell shows **8 unread while only 2 approvals are pending**, because stale "blocked" and "paused" notices for since-cancelled or resumed initiatives stay unread. The bell still doesn't show an actionable count. |
| F28 | Medium | **Not fixed** | [02](02-chat-question-answered.webp) | Initiative names in chat replies are plain text, not links. Threads still can't be renamed, deleted or searched. |
| F29 | Medium | **Fixed** | [33](33-operations.webp) | The *production* environment badge is now blue and *staging* neutral; rose now marks only danger and rejection. |
| F30 | Low | **Fixed** | Tab titles | Detail pages now have specific titles, e.g. "RentRoll MVP · Initiatives · Techgens" and "(2) Approvals · Techgens". |
| F31 | Low | **Partially fixed** | DOM check | Switch names no longer flip with state ("Require approval: Production deploy", "Enforce Company daily budget"), and row actions include the period. **The value-chip remove buttons are still 16×16 px.** |
| F32 | Low | **Fixed** | CSS check | A `prefers-reduced-motion` rule turns off the ping and pulse animations. |
| F33 | Low | **Partially fixed** | [32](32-settings.webp) | *Orchestrator* now shows "Same origin (/api)". **Still open:** Models per role lists 22 identical "Role default" rows, and the page mixes save models (gates save automatically, limits need *Save limits*). |
| F34 | Low | **Partially fixed** | [24](24-completed-initiative-stepper.webp) | The directive is shown only once, and the budget shows its period ("900 cr · total"). Milestones still have **no due dates** and never progress (N4). *Key facts* still repeats the header. |
| F35 | Low | **Not fixed** | Documents list | Long document titles are still truncated with no way to see the full title (the legacy client-portal initiative). Short initiative names (F06) make this less frequent. |
| F36 | Low | **Partially fixed** | Computed styles on `/` | No 10 px text remains, but 11 px is used **34 times** on the dashboard. KPI values (20 px) are now clearly below the H1 (24 px). |
| F37 | Low | **Not fixed** | [31](31-goals.webp) | KR progress still ignores the baseline, and onboarding still has no progress indicator. |

---

## 3. New issues

| ID | Severity | Page / flow | Issue and evidence | Origin | Recommendation | Effort |
|---|---|---|---|---|---|:-:|
| **N1** | **High (3)** | Approvals ↔ lifecycle after a budget grant | **An already-approved gate is requested again.** InvoiceLite's PRD gate was approved at 12:41:28 (`d7acd706`). The step after approval then hit the initiative budget. After *Grant credits*, the stage job restarted and a **new PRD gate** arrived at 12:43:07 (`af3654cb`, labelled "Round 1", with PRD v2). The CEO has to approve the same gate twice, the stage's credits are spent twice, and the history reads as if the first approval never happened. [N1](N1-prd-gate-re-requested-after-budget.webp) | Existing behaviour, newly seen. Budget-overrun approval calls `resume(job, null)` when the job has no session (`engine/jobs.ts`, unchanged since `5159de0`), which restarts the stage from the beginning. | Make gate requests idempotent on the server: if `request_approval` is called for an initiative and gate kind already approved in the current stage run, return the existing decision instead of opening a new item. Resume budget-blocked jobs from their last checkpoint ("approved, continue to complete") rather than restarting the stage. Add an e2e test: approve the PRD, trigger an overrun, grant, and assert no second PRD gate appears. | M |
| **N2** | Medium (2) | Initiative → Edit | The *Budget* field in Edit initiative has `step={10}`, so 125 or 0.5 are rejected by the browser's own bubble ("…nearest valid values are 120 and 130"). *New initiative* accepts any value (`step="any"`). [N2](N2-edit-initiative-budget-step10.webp) | Existing behaviour, newly seen (`edit-initiative-dialog.tsx:100`) | Use `step="any"` (or 0.01) and app-level validation with the same inline error style as other forms. | S |
| **N3** | Medium (2) | Initiatives ↔ Budget | **An initiative's budget is stored in two places.** Cards and detail show the initiative's own budget field, e.g. "0.03 / 400". Enforcement uses the Budget-table limit: the overrun read "Spent 0.02 of 0.02" while the card still said 400. One-off grants appear only on the Budget page. [20](20-initiative-overrun.webp), [17](17-budget-overrun-gate.webp), [15](15-budget.webp) | Existing behaviour, newly seen | Keep one budget record per initiative. Cards and detail should show the enforced limit plus active grants ("400 + 10 granted"), and editing in either place should update the same record. This also closes the budget part of F16. | M |
| **N4** | Medium (2) | Initiative → Roadmap | **Milestones never progress.** RentRoll is *Completed*, but all four milestones still say "Planned · No due date". This tells the CEO that nothing was delivered. [24](24-completed-initiative-stepper.webp) | Existing behaviour, newly seen | Derive milestone status from the stages and work items (Planned → In progress → Done), set due dates from the parsed timeline ("6 weeks"), or hide milestones until they carry data. | M |
| **N5** | Medium (2), *watch item, unconfirmed* | Approvals → budget grant | In 1 of 3 grant runs, the recorded grant (**10**, the suggested amount) differed from what the field and hint showed ("1" / "Grants 1 credits"). In the other two runs the request body matched the typed value (`{"extraCredits":0.5}`, `2`). The backend silently falls back to the suggested amount when `extraCredits` is missing (`services/approvals.ts` ~l.141). That would explain the mismatch if the form read failed, which would be the same family as F12. | Unknown | Make the server require an explicit amount for grants (no silent default). Show the granted amount in the toast and the history ("Granted 10 credits until 00:00 UTC"). Add e2e tests that type, paste and select-all-then-type an amount and check the request body. | S |
| N6 | Low (1) | Org → agent sheet → Hire | Pressing Escape in the nested *Hire* dialog also closes the agent sheet underneath, so one keypress dismisses two layers. | Unknown | Let only the top-most layer handle `cancel`/Escape (stop propagation, or a dialog stack). | S |
| N7 | Low (1) | Approvals | An invalid `?status=` value shows a raw API error in the list card, clipped: "status: Invalid option: expected one of …". This is now easier to hit because the visible label *Withdrawn* maps to the URL value `cancelled`, so `withdrawn` fails. | Existing pattern | Validate URL parameters on the client, accept label slugs (`withdrawn` → `cancelled`), and fall back to *Pending* with a short notice. | S |
| N8 | Low (1) | Approvals list | An agent-scoped overrun (Grace's daily budget) is labelled **"Company-wide"**, because that is the fallback text when there is no initiative. | Existing behaviour (`approvals-view.tsx` fallback) | Label by budget scope, e.g. "Agent · Grace — daily budget". | S |
| N9 | Low (1) | Work board | Stage items of legacy cancelled initiatives (PayrollPal, Quick check, TimesheetPro) still show *In progress*. The new reject → pause → cancel path closes items correctly. | Legacy data | Run a one-off migration to close items of cancelled initiatives (commit `7c42151` may cover this; verify once deployed), and hide cancelled initiatives' items by default. | S |
| N10 | Low (1) | Operations → incidents | The incident metadata reads "**Ceo** · opened 1h ago" (`humanize("ceo")`). | Existing behaviour | Map actor IDs to display names ("CEO (you)", agent names). | S |
| N11 | Low (1) | Approvals → after a decision | Focus correctly moves to the next item's H2 (`tabindex=-1`), but nothing shows where it went, so sighted keyboard users lose their place. | **Introduced by the F11 fix** | Show a visible focus style on headings focused by the app (e.g. a 2 px accent outline that fades after ~2 s), or briefly highlight the next item's card. | S |
| N12 | Low (1) | Approvals → status filter | The status filter (now 6 options, including *Withdrawn*) is too wide for its container: 501 px of content in 492 px at 1280 px, so *All* is cut off and the subtitle wraps; 450 in 356 px at 390 px, so *Withdrawn* and *All* are hidden. It scrolls sideways with no visual cue. [N12](N12-approvals-filter-overflow-1280.webp) | **Introduced by the F03 fix** (the added filter) | Put the filter on its own row under the title below about 1366 px. On phones use a select, or a scroll-snap row with an edge fade. Consider folding *Changes requested* into *Pending*, which F26 also suggests. | S |
| N13 | Low (1) | Approvals at 1280×720 (laptop) | The sticky decision bar takes about 200 px (28 % of the viewport), leaving about 290 px to read the brief. The compact mode exists only on phones. [N12](N12-approvals-filter-overflow-1280.webp) | Existing behaviour (desktop) | Use the compact decision bar when the viewport is under about 800 px tall: a one-line comment field that expands on focus and an inline hint. | S |

---

## 4. Accessibility re-measurement

### 4.1 Contrast (WCAG 1.4.3 / 1.4.11)

Method: same as the baseline. Colours come from `getComputedStyle`, with backgrounds alpha-composited through the ancestor chain via a canvas, and the WCAG 2.x relative-luminance formula.

**Text scan:** 12 routes (/, /chat, /approvals, /initiatives, /org, /work, /activity, /documents, /strategy, /budget, /operations, /settings), 343 distinct foreground/background/size combinations, **0 failures**.

| Control flagged in the baseline | Before | After | Required | Result |
|---|:-:|:-:|:-:|:-:|
| Input border vs input fill | 1.32:1 (`#1e2a3b` on `#0a1019`) | **3.57:1** (`#5a6c87`) | 3:1 | **Pass** |
| Off switch: border (track) | 1.70:1 (1.17:1) | **3.54:1** (1.18:1) | 3:1 | **Pass** (border marks the edge; the thumb still shows state) |
| Progress and stage-bar track | 1.15:1 | **3.54:1** (1 px inset ring) | 3:1 | **Pass** |
| Notification count badge (11 px, white on rose) | 3.75:1 (`#ff2056`) | **4.70:1** (`#e11d48`) | 4.5:1 | **Pass** (thin margin; lowest text pair in the product) |
| Timestamp on the selected approval row (11 px) | 4.89:1 | **4.84:1** (`#7d8ca3` on `#0e212c`) | 4.5:1 | Pass (thin margin) |
| Timestamp in the selected chat thread | — | 4.66:1 | 4.5:1 | Pass (thin margin) |
| Settings section label "Account" (11 px) | — | 5.14:1 | 4.5:1 | Pass |
| Subtle text on cards and the decision bar (KPI labels, meta, hints) | 5.55:1 | 5.21–5.59:1 | 4.5:1 | Pass |

### 4.2 Reflow (WCAG 1.4.10) and responsive layouts

| Width | Scope | Before | After |
|---|---|---|---|
| 390 px | 17 routes | 6 pages overflowed (e.g. Initiatives 567 px, Budget 656 px, Activity 785 px) | **0 overflowing pages** |
| 768 px | 17 routes | Activity 861 px | **0** |
| 320 px | the 8 routes that failed before | not tested | **0** |
| Components | Approvals status filter (N12); Work board at 1440 px is 1788 px wide vs 1136 px visible, with no scroll cue (F21) | — | These scroll inside themselves, so they are allowed, but nothing tells the user they scroll |

On phones (390×844): the Approvals decision bar is compact ([27](27-approvals-390.webp)), Org opens in Directory view ([28](28-org-390.webp)), and the Demo badge is still hidden (F25). On a 1280×720 laptop, the decision bar takes 28 % of the height (N13).

### 4.3 Keyboard and focus

| Check | Result |
|---|---|
| Initial focus: forms (7) | ✅ First field: New initiative, New task, Report incident, New objective, Add budget, Edit budget, Edit schedule |
| Initial focus: confirmations (3) | ✅ Safe action: *Go back* (Reject), *Keep initiative* (Cancel), *Keep asking me* (gate off) |
| Initial focus: remaining (3) | ❌ "Close dialog": *Edit initiative*, *Hire agent*, *Remove this budget?* (F11) |
| Focus trap and Escape | ✅ Native modal `<dialog>`; ❌ in the nested Hire dialog, Escape closes two layers (N6) |
| Invalid submit | ✅ Focus moves to the first invalid field; errors are linked via `aria-describedby` (F23) |
| Approvals decision | ✅ An empty *Request changes* or *Reject* moves focus to the comment field and shows the error. ✅ After a decision, the result is announced in the live region and focus moves to the next item's heading; ⚠️ that heading has no visible focus indicator (N11). |
| Submitting on first click | ✅ 4/4 controlled tests; ⚠️ 2 unexplained no-ops without instrumentation (F12) |
| Live regions | ✅ Persistent polite and assertive regions (F13) |
| Headings | ✅ One H1 per page, no skipped levels (F14) |
| Motion | ✅ `prefers-reduced-motion` respected (F32) |
| Target size | ⚠️ Value-chip remove buttons are 16×16 px; they pass 2.5.8 only through the spacing exception (F31) |

---

## 5. Updated scorecard

| Dimension | Before | After | Δ | Rationale for the change |
|---|:-:|:-:|:-:|---|
| H1 Visibility of system status | 3 | **4** | +1 | Initiatives now show rejected → paused with the reason; cancelled gates show as withdrawn; the chat says "waiting on you" or "paused" honestly; the gate stepper is readable. Still: the bell counts stale notices (8 shown vs 2 pending), milestones never move (N4), and there is no attention view (F19). |
| H2 Match with the real world | 3 | **3** | 0 | Numbers and gate briefs are humanised, but chat status still shows UUIDs, Activity shows event codes, and "fake-standard", "Release pr number" and "Ceo" remain. |
| H3 User control and freedom | 3 | **4** | +1 | Resume after a rejection, clear cancel and keep choices, gate-off confirmation, and pause banners with a Resume button. There is still no undo for gate toggles or board moves, and no way to retire an agent. |
| H4 Consistency and standards | 3 | **3** | 0 | Visual and colour semantics, number formats and switch names are now consistent. Behaviour still diverges: the initiative budget lives in two places (N3), Settings mixes save models (F33), objectives don't roll up from KRs (F16), and the two budget fields validate differently (N2). |
| H5 Error prevention | 2 | **4** | +2 | Every cited failure is fixed: gates can't be turned off without a confirmation, questions don't create work, a default cap applies, grants are prefilled with their effect previewed, and cancelling withdraws the gate. It drops back to 3 if N5 is confirmed. |
| H6 Recognition rather than recall | 4 | **4** | 0 | Initiative chips on board cards and names in Approvals help. Chat names aren't links (F28), and document titles are truncated (F35). |
| H7 Flexibility and efficiency | 3 | **3** | 0 | Auto-advance with focus handling and a collapsed Done column. There are still no triage shortcuts, bulk actions or *Move to…*. |
| H8 Aesthetic and minimalist design | 4 | **4** | 0 | Cleaner gate briefs with Technical details folded away. The dashboard feed is still noisy and Key facts still duplicates the header. |
| H9 Help users recover from errors | 3 | **4** | +1 | Friendly not-found pages with a way back, focus on the first invalid field, and a rejection reason with a clear resume path. A raw API error remains for bad URL parameters (N7), and the step validation uses the browser's bubble (N2). |
| H10 Help and documentation | 2 | **3** | +1 | "What you're approving" lines, consequence wording and explained defaults now help at the moment of decision. There is still no glossary or help entry point (credits, gates, stages). |
| **Accessibility** | 3 | **4** | +1 | Reflow (1.4.10), non-text contrast (1.4.11), badge contrast (1.4.3), live regions (4.1.3), headings and required fields (1.3.1), reduced motion and titles all pass now. Left: 3 dialogs with the wrong initial focus, N11, small chip targets, and N12. |
| **Visual design** | 4 | **4** | 0 | Gate states and environment colours are now meaningful. There is still heavy use of 11 px text, the dashboard columns are unbalanced, and the board has no scroll cue. |
| **Responsiveness** | 2 | **4** | +2 | Zero overflow at 320, 390 and 768 px, a compact phone decision bar, and Org opens in Directory view. Left: the Demo badge is hidden on phones, the filter row overflows (N12), and the laptop decision bar is tall (N13). |
| **Content and trust** | 2 | **3** | +1 | Merge and deploy evidence, consequence wording, short titles and readable errors. Vision and PRD briefs are still generic, there is no risk or recommendation section, internals still leak (F18), and Round 2 just echoes the comment. |
| Mean of H1–H10 | 3.0 | **3.6** | +0.6 | |
| **UX maturity** | **3** | **3.5** | +0.5 | Moving from "defined" toward "CEO-grade". N1, the rest of F01, a single budget source (N3) and an attention view (F19) stand between this build and a 4. |

---

## 6. Remaining priorities (in order)

1. **N1:** make gates idempotent, and resume budget-blocked jobs without restarting the stage. Add the e2e test.
2. **F01 (remaining work):** add *Risk / blast radius* and a *Recommendation* to every gate; write real Vision and PRD summaries; add a spend breakdown to budget gates; humanise "Release pr number".
3. **N3 + F16:** keep one budget record per initiative (limit plus grants) shown everywhere, and roll objective status up from its KRs.
4. **F19:** add a "Needs attention" card to the Dashboard (paused or rejected initiatives, budget blocks, stale gates). The data is already available via the pause reasons and waiting states.
5. **F27:** make the bell count only actionable items, and close blocked or paused notices automatically once the state clears.
6. **N5 + F12:** require an explicit grant amount on the server, and add e2e tests for the decision bar and the grant amount.
7. **F18 / F28:** remove UUIDs from chat replies, link initiative names in chat, and humanise Activity event codes.
8. **Quick fixes:** initial focus for the remaining 3 dialogs (F11), `step="any"` (N2), N6–N12, 24 px chip targets (F31), and showing the Demo badge on phones (F25).

### Keep: these changes worked well
- Reject → **Paused with your reason** → *Resume (ask for a new proposal)*: a clear recovery path.
- Confirmation dialogs that **state the consequence** ("Agents will deploy to production without asking you") and focus the safe choice.
- The merge and deploy **evidence layout**: "What you're approving", check chips, links, and Technical details folded away.
- The **live effect preview** on budget grants, and the "+ 10 granted until …" display in the Budget table.
- An honest chat ("waiting on you", "paused"), and the **Withdrawn** status for gates of cancelled initiatives.
- Not-found pages with a way back; one H1 per page; persistent live regions.

---

## Appendix: screenshot index

| File | Shows |
|---|---|
| `01-dashboard`, [30-dashboard-full](30-dashboard-full.webp), [16-dashboard-during-overrun](16-dashboard-during-overrun.webp) | Dashboard (F19 still open) |
| [02-chat-question-answered](02-chat-question-answered.webp), [03-chat-after-send-new-thread](03-chat-after-send-new-thread.webp) | F06: a question answered without creating work; a new directive and its thread |
| `04-approvals-vision` → [09-round2-detail](09-round2-detail.webp) | Vision gate, reject confirmation, auto-advance, paused initiative, resume and new proposal, Round 2 |
| [10-gate-off-confirm](10-gate-off-confirm.webp), [11-gate-off-toast](11-gate-off-toast.webp), [12-approvals-architecture-gate-off-chip](12-approvals-architecture-gate-off-chip.webp) | F04: confirmation, toast, auto-approved badge and "gate off" chip |
| `13*`, `14*` | F01: merge-to-main and production-deploy evidence |
| [15-budget](15-budget.webp), [17-budget-overrun-gate](17-budget-overrun-gate.webp), [20-initiative-overrun](20-initiative-overrun.webp) | F08 / N3: grant flow, grants shown in the Budget table, budget stored in two places |
| [18-chat-blocked-by-budget](18-chat-blocked-by-budget.webp), [19-chat-paused](19-chat-paused.webp) | F05: honest chat states |
| [21-cancelled-initiative-withdrawn](21-cancelled-initiative-withdrawn.webp), [22-approvals-withdrawn](22-approvals-withdrawn.webp) | F03 |
| [23-notifications](23-notifications.webp) | F27: stale unread notices |
| [24-completed-initiative-stepper](24-completed-initiative-stepper.webp) | F15 stepper; N4 and F34 milestones |
| [25-initiatives-list](25-initiatives-list.webp), [26-not-found-initiative](26-not-found-initiative.webp) | F16 and F17 counts and formatting; F24 not-found page |
| [27-approvals-390](27-approvals-390.webp), [28-org-390](28-org-390.webp) | F25 phone layouts |
| [29-work-board](29-work-board.webp) | F21 |
| [31-goals](31-goals.webp), [32-settings](32-settings.webp), [33-operations](33-operations.webp) | F16 and F37; F33; F29 and N10 |
| `N1-…`, `N2-…`, `N12-…` | New issues N1, N2, N12 and N13 |
