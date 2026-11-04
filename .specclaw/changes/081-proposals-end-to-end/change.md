# Proposals end to end: hours, owners, a detail page and a lifecycle for hand-made proposals

**Change:** 081-proposals-end-to-end · **Created:** 2026-11-02 · **Review:** change

## Problem

Delivery → Proposals is read-mostly and partly hollow (full audit: [`audit.md`](audit.md)). A proposal's hours are a
stored column that nothing ever updates, because no time entry names a proposal. Proposals made by hand or synced from
a repo get no owner. A single proposal has no page, so every link and search hit goes to the project board. And a
hand-made proposal can't be edited, withdrawn or given tasks. The global list has no Planned filter. The shipped-per-week
pin opens the generic list. Global counts include closed projects and ignore the project filter.

## Mock Delta

What changes on screen, and where to see it: [`081-proposals-end-to-end`](../../mock/index.html#081-proposals-end-to-end)

New proposal detail page (`/delivery/proposals/:key`). The global Proposals page gets a Planned filter, a New proposal
button and linked rows. Board cards and search link to the detail page.

Amended in T8 (asked and agreed, 2026-11-03): 007's Proposals section
([`001-amax-foundation-proposals`](../../mock/index.html#001-amax-foundation-proposals)) now has the heading row with
New proposal, the Planned filter and the search box. The page changed by design, and the delivery visual test compares
it against that section within 2% per region; only its header and the table's filter bar changed.

Amendment 1 (2026-11-04), in 081's section: a board card with its actions and its meter while Proposed (AC-22, AC-23),
the key note on the proposal page (AC-24), time lines in the history (AC-28), and the "Released in <Month>" / "Released,
all time" labels (AC-25). **Agreed 2026-11-04:** the same two labels in 007's Proposals section (its legend item "Released this
month" becomes "Released in October", the fixtures' pinned month, and its filter button "Released" becomes "Released,
all time"), so the delivery visual test still compares like with like.

Amendment 2 (2026-11-04), in 081's section: the "Suggested by amax" card, chat's suggestions for a pinned proposal,
and the board card's "✦ amax suggests" chip (AC-30, AC-35).

## Acceptance Criteria

### Time and hours

1. **AC-1** `time.entry` gets a nullable `proposal_id` (migration, index, no backfill). `log_time` accepts an optional
   `proposalKey`. Time checks it through a Delivery contract (`getProposalRef`): it must exist, belong to the entry's
   project and not be withdrawn. Anything else is refused with a clear error.
2. **AC-2** A commit-time suggestion keeps its `proposalKey`, and accepting it logs the entry with that proposal's id.
3. **AC-3** `correct_time_entry` keeps the entry's proposal on the same project, clears it when the project changes,
   and accepts an explicit `proposalKey`. A deleted entry never counts.
4. **AC-4** A proposal's hours are its approved time: totals only, from approved weeks only, no deleted entries.
   Amended during T1 (build): Delivery can't import Time, because Time depends on Delivery and the graph check
   (R5) refuses cycles. So the direction is inverted, the way presales uses `createProject`. Time recomputes the
   totals for whole projects whenever a week is approved or reopened, or an approved week's entry changes. It hands
   them to Delivery's contract `setProposalHours`, which is the only writer of `delivery.proposal.hours` (widened to
   numeric(10,2)). Delivery never reads Time tables. List, board, detail, CSV and `get_proposal` all show that one
   number. Fixtures no longer invent hours: they start at 0, and Time's week-42 fixture entries name their
   proposals, so approving a demo week shows its hours.

### Owners

5. **AC-5** `delivery.proposal` gets `owner_user_id` (FK `auth.user`). `create_proposal` defaults the owner to the
   person acting (the onBehalfOf user for an agent) and takes an optional `ownerUserId`, who must be an active person in
   the tenant. `owner_name` is kept in step. A spec proposal synced or pushed gets the person it was synced for as owner
   when created, and a later sync never overwrites an owner. An existing proposal with no owner shows "Unassigned" and
   can be given one with `update_proposal`. Retention covers `owner_user_id`.

### Detail page and navigation

6. **AC-6** `/delivery/proposals/:key` shows the title and key; project (linked); phase; owner; estimate vs approved
   hours; task progress and the task list; release and the furthest environment reached; source (repo, PR, change
   folder) for spec proposals; created and updated; phase history and audit events for the proposal (from the audit
   log, delivery:read); and lifecycle actions as Ask amax buttons, shown only when the viewer may run them. Unknown key,
   or a viewer without delivery:read, gets the usual not-found or sign-in state. Every block has a pin.
7. **AC-7** Rows in the global and project lists, board cards, `search` hits and `get_proposal` results link to the
   detail page (`proposalHref(key)` in contracts). A refresh of the detail page works.
8. **AC-8** `get_proposal` reads one row by id or key (not the whole list) and returns tasks, owner, hours and the
   release with its environments. It still returns withdrawn proposals, marked `withdrawn`.

### Lifecycle for hand-made proposals

9. **AC-9** `update_proposal` (`delivery:proposal:create`, scoped to the project) changes title, description,
   estimate and owner of a hand-made, unreleased, not-withdrawn proposal. It's audited with before/after. A spec proposal
   is refused ("edit it in the repo"); there is one exception, the owner, which can be set on any proposal.
10. **AC-10** `withdraw_proposal` (`delivery:proposal:move`, destructive, needs a reason) marks a hand-made, unreleased
    proposal withdrawn (`withdrawn_at`, `withdrawn_by`, reason). No row is deleted. It takes the proposal out of its
    release if it's in one. It's audited and emits `proposal.withdrawn`. Withdrawn proposals leave every list, count,
    board lane and release picker, and stay readable by key. A spec proposal is refused: the repo withdraws it.
11. **AC-11** `add_proposal_task` (`delivery:task:done`, scoped) adds the next `T<n>` task to a hand-made, unreleased,
    not-withdrawn proposal and recounts tasks. It's audited. `mark_task_done` keeps working on it.
12. **AC-12** `delivery:proposal:create` is enforced on the server for every new write, with the same grants as today
    (Engineer @assigned, PM). Chat shows a confirm card for each write before it runs (`service:` set), and
    `mcp-registry.test` lists the new tools.

### Creation and chat

13. **AC-13** The global Proposals page has a New proposal button. On a project page the button and chat start with the
    project already known (pinned project, prompt "New proposal in &lt;Project&gt;"), so chat doesn't ask for it again.
    Delivery registers `chatSuggestions` for its pages, the way Time does.
14. **AC-14** The `create_proposal` confirm card shows project, title, description, estimate and owner as they will be
    written.

### Lists, metrics, pins

15. **AC-15** The phase filter is All, Proposed, Planned, Building, Verified, Released, on the global and project lists.
16. **AC-16** Global counts, list, shipped-per-week and Released this month exclude closed projects and withdrawn
    proposals, follow the project filter, and agree with each other. The list sorts by most recently updated, has a
    title/key search box (`?q=`), and pages 20 to a page. CSV exports the filtered rows, all pages.
    Amended after T8 (asked and agreed, 2026-11-03): emptying the search box goes back to the list without `q`, and the
    box completes what you type in place from the filtered proposals (a key first, then a title), the guessed part
    selected: Tab or → keeps it, typing on or Backspace drops it, Enter searches. No dropdown.
    The project filter in use shows as a chip beside Filter; its ✕ goes back to all projects, keeping phase and search.
17. **AC-17** A read tool `get_proposal_metrics` (phase counts, released this month, shipped per week, optional
    project) backs both metric cards and their pins. The shipped-per-week pin opens that metric, not the list.

### Lifecycle consistency and notifications

18. **AC-18** The existing rules keep working, with tests: Released comes only from a Prod deployment; a void restores
    the prior phase; a sync or push never moves Released back; a withdrawn proposal can't be moved, released or synced
    back into the active lists by hand.
19. **AC-19** Notifications: the proposal owner is told when someone else moves their proposal to a new phase or
    releases it, and when a task on it is done by someone else (`to: owner`, category `delivery`). There's no
    notification when the owner acted themselves.
20. **AC-20** D1 decided 2026-11-02: no approval gate. Moving to Planned keeps today's permission (`delivery:proposal:move`); the owner is notified (AC-19).

### Verification

21. **AC-21** `pnpm lint` (graph check included), `pnpm test` for delivery, time and core, `pnpm build`, and
    `e2e:auth` delivery specs pass; a new e2e opens a proposal from the list, board and search.

## Decisions

- **D1 PM approval to Planned (AC-20), decided: keep as is.** PRODUCT.md says PMs "approve proposals", but today an Engineer on the project
  can move one to Planned. Options: (a) keep as is; (b) Planned needs `delivery:proposal:approve` (PM @managed).
- **D2 Who sees proposal hours (AC-4), decided: everyone with delivery:read.** totals of approved time, no per-person rows, shown to anyone with
  delivery:read, the same audience as today's (stale) column. The alternative is Time's week scope, where each viewer
  sees a different total.
- **D3 Closed projects (AC-16):** excluded from global counts and lists, the way `listProjects` already does it. A
  closed project's own page still shows its proposals.

## Amendment 1 (2026-11-04): close the gaps against the Proposals BRD

The product owner's BRD (Proposals Module, Nov 3, 2026) was checked against 081 at `2424743b`. It found seven gaps: FR-14,
FR-13, FR-18, FR-03, FR-10a, FR-21 and NFR-3. This amendment closes them inside 081 (no 074/075 changes), with no
database migration and no new module edge. Every earlier AC, decision and business rule (BR-1 to BR-6) stands.

### Board, list and page

22. **AC-22 (FR-14)** A board card for a hand-made, unreleased, not-withdrawn proposal offers Edit, Add a task and
    Withdraw next to Move. Each is an Ask amax button: it pins the proposal and fills a prompt, and chat writes only
    after the person confirms the card. Each button shows only when the viewer holds its tool's permission on the card's
    project: `delivery:proposal:create` for Edit, `delivery:task:done` for Add a task, `delivery:proposal:move` for
    Withdraw and Move. A spec proposal's card shows none of them (BR-3). The board and the proposal page draw these
    actions from one component, so the two can't differ.
23. **AC-23 (FR-13)** A proposal that has tasks shows its task meter (done of total), Proposed included: in every phase
    on the global and project lists (as Released rows already did), and on the board card in every phase but Released,
    whose card shows its release chip. With no tasks, the list shows "–" and the card shows no bar. (Amended in T9:
    the lists keep the meter on Released rows, as the mock and the visual test have it.)
24. **AC-24 (FR-10a)** The page of a hand-made proposal says what can happen to its key. For example: "Made by hand.
    If this project starts syncing specclaw changes and one of them is numbered CON-019, this proposal moves to the
    hand-made series (for example CON-H001). Its tasks, time, release and history move with it; links by the old key
    stop working." A proposal already in the `-H` series says it is in the hand-made series and keeps its key. Spec
    proposals show no note.
25. **AC-25 (FR-21)** The time period is visible in both places, and neither one's meaning changes. The phase bar's
    legend reads "Released in <Month>" (e.g. "Released in November"), counting proposals released since the 1st, as
    before. The Released filter tab reads "Released, all time" and still lists every released proposal. The
    `get_proposal_metrics` field keeps its name (`releasedThisMonth`) and its description says "this calendar month
    (UTC)".

### Time and notifications

26. **AC-26 (FR-03)** Time's "Log time" chat flow asks "Which proposal is it for?" as an optional field, saying a
    proposal on the chosen project or "none". A `proposalKey` the person already gave is used, not asked again. The
    confirm card shows the proposal (key and title) when there is one. The saved entry carries that proposal's id. A log
    without a proposal works exactly as before, and an unknown, other-project or withdrawn proposal is refused before
    any card appears (AC-1's rule).
27. **AC-27 (FR-18)** A new notification rule tells the project's PMs (people holding `delivery:release:create` on
    that project, the managed scope) when a proposal reaches Verified: "<key> is verified and ready for a release" (the
    key names the project, so the payload needs no new field; amended in T11), linking the
    proposal page. It fires on Verified from a board move or a sync, never for the PM's own action, and never twice to
    one person for one event. The platform keeps one notification per person per event, so a PM who is also the owner
    gets one (that is a test). The owner rules from AC-19 are unchanged.
28. **AC-28 (NFR-3)** The proposal's history shows time logged against it, from Time's existing audit rows (no new
    audit write): "<person> logged 2 h for Oct 19", "corrected to 2.5 h", "removed 2 h".
    - **Join on the id, not the key.** From this amendment on, Time writes the entry's `proposalId`, owner (`userId`),
      `day` and `hours` into every audit row's `after`: log, correct (plus `previousProposalId`), delete, and a change
      request an approver applies (audited as `time.change_request`). The history joins on that id, so a rekey doesn't
      lose the lines. (Amended in T12: all in `after`, so an applied request carries them too.)
    - **Who sees the lines (Q8, decided 2026-11-04).** Time lines are per person, so a viewer sees one only when it is their own entry, or when
      they hold `time:approve` on the proposal's project. Everyone else sees the proposal's approved total only (D2),
      with no per-entry lines.
    - **Older entries.** Entries logged before this amendment carry no `proposalId` in their audit row and get no
      history line; their approved hours still count (AC-4).

### Verification

29. **AC-29** The tests below pass. `pnpm lint`, `check-module-standard`, `pnpm build` and the Linux CI replica
    (unit tests and `e2e` / `e2e:auth`) pass. The delivery visual test passes against the mock after AC-25's label
    change (see Mock Delta).

| AC | Tests |
|---|---|
| AC-22 | Board card renders Edit, Add a task, Withdraw for Maya (PM) on a hand-made card. An Engineer not assigned sees none, a Leadership viewer sees none, a spec card shows none. The e2e clicks Add a task on a card, sees the pinned prompt, and nothing is written until confirm. |
| AC-23 | List and card show a meter for a Proposed proposal after `add_proposal_task`, "–" with no tasks, and the chip on a released card. |
| AC-24 | Page text for a hand-made key, an `-H` key, and a spec proposal (none). |
| AC-25 | Legend reads "Released in November" with the clock pinned to Oct/Nov fixtures. The filter reads "Released, all time" and lists every released proposal. The counts match `phaseCounts`. |
| AC-26 | The intent declares `proposalKey`. The log card shows the proposal line. `propose` refuses another project's proposal. A chat turn (fake provider) with "log 2 h on CON-014" yields a card with the proposal and an entry with its id. A log without one is unchanged. |
| AC-27 | A Verified move by an Engineer notifies the CON PM and not an unrelated PM. A move by the PM themselves notifies no PM. A PM who owns the proposal gets exactly one notification. A Planned move notifies no PM. |
| AC-28 | Log, correct and delete against CON-014 appear in its history for the owner and for an approver, and not for Leadership or another engineer. The proposal is rekeyed (a spec sync takes its key) and the lines remain under the new key. Approved hours are unchanged. |
| Regressions | The existing 081 suites (AC-1 to AC-21), BR-1/BR-2 (`proposal-regression`), owner rules (`proposal-owner`), and approved-hours (`proposal-hours`) stay green. |

**Affected:**
- **Delivery:** `ui/ProjectPage.tsx`, `ui/ProposalActions.tsx`, `ui/ProposalsPage.tsx`, `ui/ProposalPage.tsx`, `server/proposal-detail.ts`, `server/queries.ts`, `mcp.ts` (description), `module.ts` (rule), tests.
- **Time:** `chat.ts` (intent field), `server/log.ts`, `server/correct.ts` (audit carries `proposalId`), tests.
- **Notifications:** one test.
- **Mock:** 081 section; 007's Proposals legend and filter label (agreed 2026-11-04).

No migrations, permissions, tools or contracts are added; one notification rule is added.

**Risks:**
- **Per-person time lines (AC-28).** The access rule above is a decision for the product owner (Q8 below).
- **Reading another module's audit rows.** Reading Time's audit rows from `core.audit_event` is a read of the platform audit log, not of Time's tables. Delivery already reads its own rows there.
- **Mock change.** The label change touches 007's mock section again.

### Still open (not resolved by this amendment)

| # | Question | Owner |
|---|---|---|
| Q2 | Sign-off for the permission reuse: Edit `delivery:proposal:create`, Withdraw `delivery:proposal:move`, Add task `delivery:task:done` | Product owner |
| Q3 | Backfill missing owners on existing proposals, and from what source (today they show "Unassigned") | Product owner |
| Q5 | Can a withdrawn proposal be reinstated (no tool today) | Product owner |
| FR-05 | Accept the inverted contract: Time pushes approved totals to Delivery's `setProposalHours` (R5 forbids Delivery → Time) | Product owner, architect |
| FR-07 | Accept the owner rule: a sync fills a missing owner and never replaces one; a bare CI credential sets none | Product owner |
| Q7 | Check closed-project counts on real data; 081 is tested on fixtures only | Dev, with production access |
| Q8 (new) | AC-28's rule: who sees per-person time lines. **Decided 2026-11-04: the entry's owner and holders of `time:approve` on the project** | Product owner (answered) |

## Amendment 2 (2026-11-04): agent-first proposals: pin suggestions and agent suggestions

The client asked for Proposals to be agent-first, like Time: the agent says what to do next, and a person confirms.
Time does it in three layers. Delivery had only the first (page suggestions, AC-13). This amendment adds the other
two, using the platform as Time and Allocations do: core's `pinSuggestions` slot, and `@amax/agents` suggestion kinds.
There is no new table, migration, permission or tool. AC-1 to AC-29, D1 to D3 and BR-1 to BR-6 stand. In particular,
an agent never writes without a person's confirm or accept (BR-5).

### Pin suggestions (pin a proposal, chat says what fits)

30. **AC-30** Pinning a proposal (its +, a row, a card or an Ask amax button) makes chat offer what fits its state. Up
    to two suggestions, only for tools the viewer may run on its project, each filling the box with a prompt the person
    sends and then confirms:
    - **A hand-made, open proposal:**
      - Proposed: "Move <key> to Planned". Planned: "Move <key> to Building". Building with every task done: "Move
        <key> to Verified" (`move_proposal`).
      - No tasks: "Add a task to <key>" (`add_proposal_task`).
      - No owner: "Make me the owner of <key>" (`update_proposal`).
    - **A spec proposal with no owner:** only "Make me the owner of <key>" (BR-3).
    - **Released or withdrawn:** nothing.

    The prompts are the exact strings chat's tools already parse (e.g. "Move CON-017 to planned"), so the confirm card
    names the same proposal.
31. **AC-31** A pin suggestion is checked when chat opens, against the proposal as it is now (not as it was when the
    page rendered). A proposal that moved, or a permission that changed, offers what fits now. A pin that no longer
    resolves offers nothing; it doesn't fail.

### Agent suggestions (the agent proposes, a person accepts)

32. **AC-32** Kind `delivery.proposal-verify`, "Ready to verify". When a task closes (`delivery.task.done`) and every
    task of a hand-made Building proposal is now done, the Delivery agent suggests "Move <key> to Verified":
    - for the project's PMs, scope `projectId`, permission `delivery:proposal:move`;
    - evidence: the proposal page and the last task.
    - Accepting runs the board move as the accepting person, audited and emitting `proposal.phase_changed`, so the
      owner and PM notifications fire.
    - Undo puts it back to Building, only while it's still Verified and inside the platform's undo window. A Verified
      proposal released since can't be undone.
    - Spec proposals are never suggested (their phase is the repo's, BR-3).
33. **AC-33** Kind `delivery.proposal-owner`, "Suggested owner". When a task closes on a proposal with no owner and a
    person closed it (`user:…`, or an agent or credential acting for a person), the agent suggests "Make <person> the
    owner of <key>":
    - scope `projectId`, permission `delivery:proposal:create`;
    - evidence: the task they closed.
    - Accepting sets the owner (the `update_proposal` rule, valid for spec proposals too); undo clears it again if
      nothing changed it since.
    - This suggests, never assigns: it doesn't settle Q3 (backfilling existing owners).
34. **AC-34** Suggestions don't pile up or go stale:
    - The platform keeps one open suggestion per kind and proposal (the agent can run twice; one stays).
    - "Ready to verify" is withdrawn when the proposal leaves Building. Both kinds are withdrawn when the proposal is
      withdrawn or released. Open suggestions expire after the platform's 7 days.
    - Accepting one that no longer fits is refused with a clear message, and nothing is written: the proposal moved,
      or someone else became the owner. (Amended in T15: an owner set by `update_proposal` raises no event, so a
      "Suggested owner" is refused at accept rather than withdrawn. Tasks never reopen, so there is no reopen
      trigger.)
35. **AC-35** Where people see agent suggestions:
    - **Proposal page:** a "Suggested by amax" card ("An agent suggests, a person decides") with "Ask amax to accept"
      and "Dismiss" buttons (Ask amax, pinned, confirm card), in the style Allocations and Time use.
    - **Board card:** a "✦ amax suggests" chip.
    - **Suggestions inbox:** the platform screen, with accept, query, dismiss and undo.

    Each shows only to viewers who may decide it.

### Verification

36. **AC-36** Tests:
    - Unit tests for each pin-suggestion state and permission (AC-30, AC-31).
    - Each kind's trigger, accept, undo, withdraw and stale-refusal (AC-32 to AC-34).
    - The page card and the board chip by viewer (AC-35).
    - Notifications fire on an accepted Verify, without duplicates.
    - The 081 regressions stay green.
37. **AC-37** End to end in the browser (e2e:auth, CI replica) and by hand:
    - **Pin flow:** pin CON-017, click "Move CON-017 to Planned", confirm, and the board shows it in Planned.
    - **Agent flow:** close the last open task of a hand-made Building proposal, see "Ready to verify" on its page,
      accept in chat, and see Verified, an undo window on the Suggestions screen, and the owner notified.
    - **Prerequisite:** the scripted e2e chat model learns "Accept the suggestion "…" (suggestion id …)" and "Add a
      task to <key>: <title>". These are two rules in `packages/ai/src/scripted-writes.ts`, test-only (never in
      production), and need approval as the one change outside `modules/`.
    - **By hand:** a walk-through of both flows in a locally running app, with screenshots in the PR.

**Affected:**
- **Delivery:** `pin-suggestions.ts` (new), `suggestions.ts` (two kinds, the agent's event handler, withdrawals), `module.ts` (`pinSuggestions`, `suggestions`, `events.handles`), `ui/ProposalPage.tsx`, `ui/ProjectPage.tsx`, `ui/ProposalSuggestions.tsx` (new), tests.
- **Test support:** `packages/ai/src/scripted-writes.ts` (two test-only rules).
- **Browser test:** `apps/web/tests/e2e/delivery.spec.ts`.
- **Mock:** the 081 section.

**Decided 2026-11-04:** approved; nudges "Ready to verify" and "Suggested owner"; the two scripted e2e rules in `packages/ai` are approved.

**Not included (needs the product owner):** a "stale proposal, withdraw it?" nudge. Its undo would reinstate a
withdrawn proposal, which is Q5, still open.

## Amendment 3 (2026-11-04): every Delivery pin suggests its actions

The client asked for every pin in Delivery to offer the actions that fit it, so any Delivery task can be run from a pin:
pin the record, pick the suggestion, confirm the card. Amendment 2 did this for proposals. This amendment does it for
every pinnable Delivery record and view, with the same rules:
- **Fits now:** offers are read when chat asks, from the record as it is now (AC-31).
- **Allowed only:** each offer appears only if the viewer holds its tool's permission on the record's project.
- **Confirmed:** a click fills the box, and the write waits for the confirm card (BR-5).
- **Exact prompts:** each prompt is the text that tool's chat flow already takes.
- **At most three** per pin.

There is no new tool, permission, table or migration.

| Pinned (read tool) | Offers, when they fit | Write tool |
|---|---|---|
| Project (`get_project`) | "New proposal in <Project>"; "Create release <next version> of <KEY>" (next minor after its latest); "Link <KEY>'s repo" when none is linked | create_proposal, create_release, link_project_repo |
| Proposal (`get_proposal`, AC-30 plus) | AC-30's, plus "Mark T<n> of <key> done" (its first open task), and, Verified and in no release, "Put <key> in <KEY> <version>" (the newest release not yet in Prod) | + mark_task_done, set_release_proposals |
| Release (`get_release`, `get_release_history`) | "Record a deployment of <KEY> <version> to <next environment>"; "Change the proposals in <KEY> <version>"; "Tag <KEY> <version> as" | record_deployment, set_release_proposals, tag_release |
| Environment (`get_environment`) | "Make <env> the prod environment of <KEY>" if it isn't; "Rename the <env> environment of <KEY>"; "Remove the <env> environment of <KEY>" if it has no deployments | upsert_environment, remove_environment |
| Deployment (`get_deployment`) | "Void the <env> deployment of <KEY> <version>" while it is live (the reason is typed on) | void_deployment |
| Repo sync (`get_repo_sync`) | "Relink <KEY>'s repo" / "Unlink <KEY>'s repo" when linked; "Link <KEY>'s repo" when not | link_project_repo, unlink_project_repo |
| Proposals views (`list_proposals`, `get_proposal_metrics`) | "New proposal" (in the filtered project when one is named) | create_proposal |
| Releases views (`list_releases`, `list_environments`) | "Create a release" / "Add an environment to <KEY>" for the named project | create_release, upsert_environment |
| Projects view (`list_projects`) | "New project" | create_project |

38. **AC-38** Each row above offers exactly what fits its record's state and the viewer's permissions on its project,
    and nothing else. The views offer only for a project the viewer may write to.
39. **AC-39** Every offer's prompt runs to a confirm card naming the same record, and confirming makes the write. The
    scripted e2e model learns the prompts it doesn't parse yet: create release, mark task done, put in a release, link,
    unlink and relink, rename, new proposal, and new project.
40. **AC-40** Not offered, with the reason recorded:
    - `sync_proposal`, `sync_specclaw`: CI and plugin writes, never chat cards.
    - `set_commit_time_logging`: needs the entity's people told first, an Admin's deliberate act.
    - `withdraw_proposal`: destructive, so no pin offer. Decided 2026-11-04: it gets a clean, dedicated button
      instead. On the proposal page, "Withdraw" becomes an outlined danger button (there is no card fold any more, see below),
      replacing AC-22's quiet underlined link. It still asks for a reason and needs the confirm card.
    - Activity lines and pushes: news, with nothing to act on.
41. **AC-41** Tests:
    - A unit test per row: state, permission, and the exact prompt.
    - The 081 and 054 chat-first suites stay green.
    - End to end in the browser: pin a release, then "Record a deployment … to <next>", confirm, and the release map
      shows it; pin an environment, then "Make … prod" or "Remove", confirm.
    - A hand walk-through of every row on the running app, with screenshots.

**Decided 2026-11-04: no Actions dropdown on board cards.** AC-22's Actions fold, and the Move button the card had
before 081, are removed. A board card keeps its title link, its pin (+) and its "amax suggests" chip, and its actions come
from its pin: pin the card, and chat offers the moves, tasks and owner change that fit it (AC-30, AC-38), each confirmed
on its card. The proposal page keeps its action buttons. This supersedes AC-22 for the board; on the BRD's FR-14 ("Ask
amax actions on the board card"), the board's actions are reached through the card's pin.

**Approved 2026-11-04.** **Affected:** `modules/delivery/pin-suggestions.ts` (split by record), `ui/ProposalActions.tsx`, `ui/ProjectPage.tsx` and `ui/delivery.css` (the Withdraw button, no card fold), `module.ts`,
`packages/ai/src/scripted-writes.ts` (test-only rules, as Amendment 2), tests, `apps/web/tests/e2e/delivery.spec.ts`.

## Amendment 4 (2026-11-04): the board and the proposal page, interactive like Time

The client asked for Delivery to feel as interactive as Time. Time's pages lead with what needs attention:
- **A status band:** a big figure, a segmented bar and a legend whose parts filter.
- **Folded rows:** each opens in place.
- **Live times:** they keep counting.
- **Icons:** status always has an icon as well as a colour.

The Delivery pages are flat cards of equal weight. This amendment brings Time's patterns to the two pages people use
most: the project board and the proposal page. Projects, Proposals and Releases follow in a later change (decided
2026-11-04).

All the rules still hold:
- Read-only controls only; every write is in chat, after the confirm card.
- Every new part is pinnable.
- The new parts are keyboard-complete, work in light and dark themes, and respect reduced motion.

There is no new tool, permission, table or migration. Everything shown is read from data the pages already load, plus
who closed each task (`delivery.task.done_by`: `user:<id>` for a person, anything else for an agent or CI, as the
Overview already counts it).

### Project board (`/delivery/p/<KEY>`)

42. **AC-42** A status band sits between the tabs and the board. It has two parts, each pinned to the project
    (`get_project`), and each shows only when it has something to show:
    - **Proposals:** "<n> in flight" (Proposed to Verified). The bar has one segment per phase. Each legend item (phase icon, count, name) links
      to the project's Proposals tab filtered to that phase.
    - **Tasks:** "<done> of <total> done". The bar splits the done tasks into closed by agents and closed by people,
      then the open ones. The legend reads "Agents <n> · People <n> · Open <n>".

    A screen reader reads each bar as one sentence, for example "5 proposals in flight: 2 proposed, 1 planned, 2 building".
43. **AC-43** "Needs you", above the band, appears only when there's something for this viewer. It has one folded row
    per item, newest first, each with its own pin:
    - **Agent suggestions:** for each open agent suggestion on this project's proposals that the viewer may decide, the
      row reads "Ready to verify · CON-012 SSO token refresh · suggested 2 h ago" and opens to the agent's detail and
      a link to the proposal.
    - **Refused pushes:** for each refused specclaw push, when the viewer may link the repo, the row reads
      "Push refused · <reason> · 3 h ago". It opens to the push's details.
44. **AC-44** Repo sync folds to one row: "Repo sync · <n> pushes refused · last sync <age>" (or "No repo linked").
    It opens, by click, Enter or Space, to the table it shows today. It is open by default when a push was refused.
    The row keeps its pin.
45. **AC-45** The board, its lanes and its cards don't change (Amendment 3), so the 001 mock and its visual test
    still hold.

### Proposal page (`/delivery/proposals/<key>`)

46. **AC-46** The header keeps two actions:
    - **"Ask amax"**, with the proposal pinned.
    - **Withdraw**, the outlined danger button, shown to those who may withdraw and only while the proposal can be
      withdrawn.

    Edit, Add a task and Move leave the header. Chat offers them from the page's pin (AC-30, AC-38), and the opening
    prompt of "Ask amax" lists them. This supersedes AC-6's header buttons.
47. **AC-47** A stage stepper sits under the header: Proposed, Planned, Building, Verified, Released. Each step's state
    shows as an icon and a word, never by colour alone:
    - **Done steps:** a tick, and the date the proposal entered that phase (from its history).
    - **Current step:** marked with `aria-current="step"`.
    - **Later steps:** muted.

    A withdrawn proposal shows a crossed-out step at the point it was withdrawn. The stepper pins to the proposal.
48. **AC-48** The agent's open suggestions (AC-35) come right after the stepper, before any other card.
49. **AC-49** The Time card reads as a band:
    - The big figure "<approved> h of <estimate> h estimated".
    - A bar of approved hours against the estimate. Hours over the estimate show as a separate segment, with an over
      icon and "<n> h over".
    - With no estimate, the card reads "<n> h approved · no estimate".
50. **AC-50** History is a timeline, newest first. Each line has an icon for its kind (created, moved, task done, time
    logged or corrected, released, withdrawn), what happened, who did it (person or "agent for person"), and a live age
    ("3 h ago") that keeps counting. The exact time is in the tooltip. AC-28's visibility rule for time lines is
    unchanged.
51. **AC-51** Tasks lists the open tasks first. The done ones fold into one row, "<n> done", that opens in place.
    A proposal with every task done shows "All <n> done" open.
52. **AC-52** The live age is shared: `ago()` and `<Since>` move from `modules/time/ui` to `@amax/ui`. Time imports
    them from there and its pages don't change.
53. **AC-53** Tests:
    - Unit tests: the band figures and their sentences, the needs-you rows (including permission), the stepper states
      (including withdrawn) and the over-estimate figure.
    - The 081 chat-first suite stays green, with the header's AC-22 test updated to AC-46.
    - In the browser: the band's legend opens the filtered Proposals tab; the repo sync row opens with Enter; the
      stepper marks the current step; Withdraw opens chat with the confirm card; axe finds no violations.
    - A hand walk-through with screenshots, light and dark.

**Approved 2026-11-04.** **Affected:**
- **Delivery UI:** `modules/delivery/ui/ProjectPage.tsx`, `ProposalPage.tsx`, `ProposalActions.tsx` and
  `RepoSyncCard.tsx`, new `ui/BoardBand.tsx`, `ui/NeedsYou.tsx` and `ui/Stepper.tsx`, and `ui/delivery.css`.
- **Delivery server:** `modules/delivery/server/queries.ts` (tasks closed by agents and by people, and phase dates).
- **Shared:** `packages/ui` (`ago` and `Since`), and `modules/time/ui` (imports only).
- **Tests:** unit tests and `apps/web/tests/e2e/delivery.spec.ts`.


## Tasks

Order follows the commit phases (backend before UI, because the screens read the new contracts). One commit per phase.

- [x] `T1` — Phase 1 (data model and contracts): migrations `time.entry.proposal_id`, `delivery.proposal.owner_user_id`, `withdrawn_at`/`withdrawn_by`/`withdraw_reason`, `description`, drop `hours`; Delivery contract `getProposalRef`, `proposalHref`, `ProposalWithdrawn` event; Time contract `proposalHours` (AC-1, AC-4, AC-5, AC-7, AC-10)
  Files: modules/time/db/migrations/0009_entry_proposal.sql, modules/delivery/db/migrations/0019_proposal_lifecycle.sql, modules/delivery/contracts.ts, modules/time/contracts.ts, modules/time/server/totals.ts, modules/delivery/fixtures/index.ts, modules/time/fixtures/*, modules/time/tests/contracts.test.ts, modules/delivery/tests/proposal-contract.test.ts
- [x] `T2` — Phase 2 (time association and ownership): `log_time`/`correct_time_entry` take `proposalKey`; commit draft keeps it; owners on create, sync and push; retention (AC-1..AC-5)
  Files: modules/time/server/log.ts, modules/time/server/correct.ts, modules/time/suggestions.ts, modules/time/mcp.ts, modules/delivery/server/queries.ts, modules/delivery/server/services.ts, modules/delivery/server/push.ts, modules/delivery/mcp.ts, modules/delivery/module.ts, modules/time/tests/proposal-time.test.ts, modules/delivery/tests/proposal-owner.test.ts
  Depends: T1
- [x] `T3` — Phase 3 (detail page and navigation): `/delivery/proposals/:key` page with history from the audit log; links from lists, board, search; `get_proposal` reads one row (AC-6, AC-7, AC-8)
  Files: modules/delivery/ui/ProposalPage.tsx, modules/delivery/server/proposal-detail.ts, modules/delivery/module.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/proposal-detail.test.ts
  Depends: T2
- [x] `T4` — Phase 4 (lifecycle): `update_proposal`, `withdraw_proposal`, `add_proposal_task` services and tools; withdrawn excluded everywhere; detail-page actions (AC-9..AC-12, AC-18)
  Files: modules/delivery/server/lifecycle.ts, modules/delivery/server/tasks.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalPage.tsx, modules/delivery/tests/proposal-lifecycle.test.ts, modules/delivery/tests/mcp-registry.test.ts
  Depends: T3
- [x] `T5` — Phase 5 (creation and chat): New proposal on the global page, project-carrying intent button, Delivery `chatSuggestions`, create card inputs (AC-13, AC-14)
  Files: packages/ui/src/components/PinButton.tsx, modules/delivery/chat.ts, modules/delivery/chat-suggestions.ts, modules/delivery/module.ts, modules/delivery/mcp.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/tests/chat-081.test.ts
  Depends: T4
- [x] `T6` — Phase 6 (filters, metrics, pins, export): Planned filter, closed-project and project-filter consistency, search, 20 a page, `get_proposal_metrics` and its pins (AC-15..AC-17)
  Files: modules/delivery/server/queries.ts, modules/delivery/mcp.ts, modules/delivery/pins.ts, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/tests/proposal-metrics.test.ts
  Depends: T5
- [x] `T7` — Phase 7 (notifications and lifecycle consistency): owner notifications for phase changes and tasks done by others; regression tests for release, void, sync and push rules with withdrawn rows (AC-18, AC-19, AC-20)
  Files: modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/server/services.ts, modules/delivery/server/tasks.ts, modules/notifications/tests/delivery-routing.test.ts, modules/delivery/tests/proposal-regression.test.ts
  Depends: T6
- [x] `T8` — Phase 8 (tests and verification): e2e opens a proposal from the list, board and search; lint, unit tests, build, `e2e:auth` delivery; README and audit progress (AC-21)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, modules/time/README.md, modules/delivery/ui/delivery.css, modules/delivery/ui/ProposalSearch.tsx, .specclaw/mock/index.html, apps/mock/public/mock/index.html, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T7
- [x] `T9` — Amendment 1, board and list: one actions component on the card and the page; task meter in every phase but Released; key note; "Released in <Month>" / "Released, all time" (AC-22 to AC-25)
  Files: modules/delivery/ui/ProposalActions.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ProposalPage.tsx, modules/delivery/mcp.ts, modules/delivery/tests/proposal-board-081.test.ts, .specclaw/mock/index.html, apps/mock/public/mock/index.html
  Depends: T8
- [x] `T10` — Amendment 1, Log time asks for the proposal (AC-26)
  Files: modules/time/chat.ts, modules/time/tests/proposal-time.test.ts, modules/time/tests/contracts.test.ts
  Depends: T8
- [x] `T11` — Amendment 1, PM hears of Verified (AC-27)
  Files: modules/delivery/module.ts, modules/notifications/tests/delivery-routing.test.ts
  Depends: T8
- [x] `T12` — Amendment 1, time in the proposal's history, by id, for whom may see it (AC-28)
  Files: modules/time/server/log.ts, modules/time/server/correct.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/tests/proposal-detail.test.ts, modules/time/tests/proposal-time.test.ts
  Depends: T10
- [x] `T13` — Amendment 1, e2e, READMEs, audit traceability, CI replica (AC-29)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, modules/time/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T9, T11, T12
- [x] `T14` — Amendment 2, pin suggestions for proposals (AC-30, AC-31)
  Files: modules/delivery/pin-suggestions.ts, modules/delivery/module.ts, modules/delivery/tests/proposal-suggestions.test.ts
  Depends: T13
- [x] `T15` — Amendment 2, the two agent suggestion kinds, their trigger and withdrawals (AC-32 to AC-34)
  Files: modules/delivery/suggestions.ts, modules/delivery/server/agent.ts, modules/delivery/module.ts, modules/delivery/tests/proposal-agent.test.ts
  Depends: T14
- [x] `T16` — Amendment 2, the page card and board chip, mock (AC-35)
  Files: modules/delivery/ui/ProposalSuggestions.tsx, modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css, .specclaw/mock/index.html, apps/mock/public/mock/index.html, modules/delivery/tests/proposal-agent.test.ts
  Depends: T15
- [x] `T17` — Amendment 2, end to end: scripted e2e rules, browser tests, hand walk-through, READMEs, traceability, CI replica (AC-36, AC-37)
  Files: packages/ai/src/scripted-writes.ts, apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T16

- [x] `T18` — Amendment 3: pin suggestions for projects, releases, environments, deployments, repo sync and views; proposal additions; no Actions fold on cards; a clean Withdraw button (AC-38, AC-40)
  Depends: T17
  Files: modules/delivery/pin-suggestions.ts, modules/delivery/pins-offer/*.ts, modules/delivery/module.ts, modules/delivery/tests/pin-offers.test.ts
- [x] `T19` — Amendment 3: scripted e2e rules, browser tests, walk-through, docs, CI replica (AC-39, AC-41)
  Files: packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/delivery.spec.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, modules/delivery/server/write-cards.ts, modules/delivery/mcp.ts, modules/delivery/tests/chat-081.test.ts, apps/web/lib/page-context.ts, apps/web/tests/page-context.test.ts
  Depends: T18

- [x] `T20` — Amendment 4 groundwork: `ago` and `Since` move to @amax/ui (Time imports them); the board's band figures (proposals by phase, tasks closed by agents and by people) and the proposal's phase dates read on the server, with unit tests (AC-42, AC-47, AC-52)
  Files: packages/ui/src/age.ts, packages/ui/src/components/Since.tsx, packages/ui/src/index.ts, packages/ui/tests/age.test.ts (moved from modules/time), modules/time/ui/RequestFold.tsx, modules/time/ui/SentBack.tsx, modules/time/ui/Timesheets.tsx, modules/delivery/server/queries.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/ui/band.ts, modules/delivery/tests/board-band-081.test.ts, modules/delivery/tests/proposal-detail.test.ts
  Depends: T19
- [x] `T21` — Amendment 4, the board: status band, Needs you, folded repo sync (AC-42 to AC-45)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/NeedsYou.tsx, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/ui/delivery.css, modules/delivery/tests/board-a4.test.ts, modules/delivery/tests/proposal-board-081.test.ts
  Depends: T20
- [ ] `T22` — Amendment 4, the proposal page: header, stepper, suggestions first, Time band, history timeline, folded done tasks (AC-46 to AC-51)
  Files: modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/ProposalActions.tsx, modules/delivery/ui/Stepper.tsx, modules/delivery/ui/delivery.css
  Depends: T20
- [ ] `T23` — Amendment 4: browser tests, axe, hand walk-through light and dark, CI replica (AC-53)
  Files: apps/web/tests/e2e/delivery.spec.ts, modules/delivery/tests/*.test.ts, .specclaw/changes/081-proposals-end-to-end/audit.md
  Depends: T21, T22

## Verify

Run 2026-11-03 on Linux: the Docker replica of CI's `checks` job (node:24-bookworm, fresh postgres:16-alpine), over the
working tree at T8.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm db:migrate` (delivery 0019, time 0009) | pass |
| `pnpm lint` (35 type checks + graph check) | pass |
| `pnpm turbo run test --concurrency=2` | pass, every package; Delivery 27 files, Time 49, Notifications 6, web 34 |
| `node scripts/check-module-standard.mjs` | pass (22 modules) |
| `pnpm build` | pass |
| `pnpm --filter @amax/web e2e` | pass |
| `pnpm --filter @amax/web e2e:auth` | 83 passed, including the 081 proposal page test and the delivery visual test |

- First pass: Time's `grid-perf` took 2.23 s against its 2 s limit, with two packages testing at once in Docker on
  Windows. It passed alone. 081 doesn't change the Team grid's queries.
- The delivery visual test failed against 007's mock section. The page changed by design, and the section was updated
  with the product owner's agreement (Mock Delta). The search box's `.search` class also clashed with the shell's top
  bar; it is now `.proposal-search`.
- The 081 e2e test first looked for CON-014 on page 1. The e2e tenant's imported AMX specs fill that page, so the test
  now finds it through the new search.
- Host-only on Windows, passing on Linux: Delivery `releases.test` (backslash paths), Notifications `time-routing`
  (other modules' agents never settle), and graph check R7 on `packages/testing/boundaries`.
- After T8 (product owner walkthrough, 2026-11-03): clearing the search box with its ✕ left the list searched, because
  only Enter navigated. Emptying the box while a search is on now goes back to the list without `q`, keeping the phase
  and project filters (`ProposalSearch.tsx`); the 081 e2e test checks it. Checked in Chromium against `dev`: ✕, clearing
  by hand, and an empty box with no search on (stays). Then, asked and agreed (AC-16 amended), the box completes typing in place
  (a native `<datalist>` was tried first and dropped: the product owner wants no dropdown). The 081 e2e test types
  `inv`, gets "invoice export to PDF" with the guess selected, Backspace drops it, Tab keeps it, Enter searches. Then the project filter chip
  (asked and agreed): checked in Chromium, it appears after picking Contoso Portal from Filter, its ✕ (keyboard too)
  goes from `/building?project=CON&q=search` to `/building?q=search`, axe (WCAG 2.2 AA) clean, light and dark checked by
  eye. The 081 e2e test closes it and runs axe. `e2e:auth` not rerun yet.
- Review loop: not run. The specclaw-review MCP server didn't connect this session; run `/specclaw:verify` (or the
  review loop) before the PR.


### Amendment 1 verification (2026-11-04)

Linux replica of CI's `checks` job over the working tree at T13:

| Check | Result |
|---|---|
| install, `db:migrate` (no new migration) | pass |
| `pnpm lint` (type checks + graph check) | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package, Time `grid-perf` included |
| `check-module-standard` | pass (22 modules) |
| `pnpm build` | pass |
| `e2e` | pass |
| `e2e:auth` | 84 passed after one fix: the 081 list test's `name: "All"` link matched "Released, all time" too; now `exact: true` |

- New tests: `delivery/tests/proposal-board-081.test.ts` (AC-22 to AC-25); AC-26 and AC-28 in `time/tests/proposal-time.test.ts`; AC-27 in `notifications/tests/delivery-routing.test.ts`; AC-28 in `delivery/tests/proposal-detail.test.ts`; e2e "081 AC-22" in `delivery.spec.ts`.
- Updated for the new labels: `delivery.test` (`month` in `phaseCounts`), `proposal-metrics` AC15, the legend e2e, and the board Move e2e (opens the Actions fold).
- Review loop: still not run. The specclaw-review MCP server isn't connected; run it before the PR.

### Amendment 2: what the hand walk-through found (2026-11-04)

The production build was run against a freshly seeded database (`amax_walk`) and driven as Maya in Chromium, with the
real job tick (`POST /api/jobs/tick`, a `CRON_SECRET` set for that run only) delivering the outbox, as production's cron
does. CI's side (closing a task from a commit) went through Delivery's services as a credential acting for a person.
- **Bug, fixed:** the tick delivered an older "moved to Planned" event after the "last task done" event, and the agent
  withdrew a "Ready to verify" that still fitted. The outbox doesn't promise order. The withdraw handlers now re-read
  the proposal and take back only what no longer fits it. There's a regression test (AC34 out of order).
- **Fixed:** a move confirmed from a pin suggestion said "Done: CON-016 added." Delivery's move, add-task and edit
  tools now have cards: "Move to Planned" → "Moved CON-016 to Planned", "Add the task" → "Added T1 to CON-018", and
  "Change owner" → "Kasun Dias now owns CON-019".
- **Fixed (approved, in `packages/agents`):** accepting a suggestion showed "Accept an agent suggestion: runs its
  change: <uuid>" with an "Add it" button. The four decision tools now show the suggestion's title, kind, agent and
  why, with Accept, Dismiss, Undo or Ask the agent on the button and in the receipt. It applies to every module's
  suggestions. Test: `packages/agents/tests/cards.test.ts`.
- **Fixed:** a double spark on the board chip, "0 of 0 tasks" on a Planned card with no tasks (now "No tasks yet"),
  and "All 1 task … are done" (now "The only task of CON-018, T1, is done").
- **Final pass, clean:**
  - Pin CON-016, then "Move CON-016 to Planned", confirm, and it's in Planned.
  - New proposal CON-018: Add a task, Planned and Building, all through pin suggestions.
  - CI closes the task; the tick runs the agent; the board shows the "amax suggests" chip and the page "Ready to
    verify".
  - Accept in chat makes it Verified, the Suggestions screen shows it undoable, and Undo puts it back in Building.
  - CI creates an ownerless CON-019 and Kasun's CI closes its task; the agent suggests Kasun as owner; accepting makes
    him the owner.
  - No page errors.
- **Not changed:** chat's "Here's what I'll add" line comes from the scripted e2e model; real Claude writes its own.

### Amendment 2 verification (2026-11-04)

Linux replica of CI's `checks` job over the final tree:

| Check | Result |
|---|---|
| install, `db:migrate` (no new migration), `lint`, `check-module-standard` (22 modules), `build` | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package. New: `proposal-suggestions` (AC30, AC31), `proposal-agent` (AC32 to AC35, plus out of order), `chat-081` AC30 cards, `packages/agents/tests/cards.test.ts`, `packages/ai` scripted rules |
| `e2e` | pass |
| `e2e:auth` | 86 passed, including "081 AC-37 pin a proposal" and "081 AC-37 the agent suggests Ready to verify" |

On the way to green, all in the e2e helper and tests:
- **The spec didn't load.** The helper imported the module manifest, which pulls in its CSS; Playwright can't load
  that, so it now imports only server code.
- **The agent test hung.** The helper's pool had one connection, and the agent handler's transaction blocked
  `createSuggestion`'s; it now has four.
- **The Overview feed test failed.** The helper's CI task close left its feed line, which the Overview e2e then
  read; the helper now removes it.
- **The pin test checked the wrong text.** It now checks the card's From/To lines.

`auth.spec` AC5 failed once and passed on the rerun; this change doesn't touch it.
Review loop: still not run (the specclaw-review server isn't connected).

### Amendment 3 verification (2026-11-04)

Hand walk-through on the real app (`next start`, scripted model, as Maya):
- Each Delivery pin offered its actions: project, release, deployment, environments, one environment, repo sync, a
  proposal card. Each one ran from chat, and each receipt said what was done ("Done: added Sandbox to FLT").
- Board cards have no Actions menu. The proposal page shows Withdraw as an outlined danger button.
- No page errors.

Two fixes came out of it:
- **A testing release was offered QA again.** Offers now treat a release as reached once it's in testing or deployed.
- **The environment card said "add or change".** The card now checks whether the environment exists and says which.

After the walk-through, the person reported a console error: "two children with the same key, `New proposal`".
The pin's offer and the Proposals page's own suggestion had the same label. The shell's page context now shows each
label once, the pin's (`apps/web/lib/page-context.ts`; the new case is in `apps/web/tests/page-context.test.ts`).

Linux replica of CI's `checks` job over the final tree:

| Check | Result |
|---|---|
| install, `db:migrate`, `lint`, `check-module-standard`, `build` | pass |
| `pnpm turbo run test --concurrency=2 --continue` | pass, every package. New: `pin-offers` (AC38), `chat-081` AC39 cards, `packages/ai` scripted rules |
| `playwright install` | failed on a Debian download timeout; passed on the retry |
| `e2e` | 8 passed |
| `e2e:auth` | 87 passed, including the pin-driven board move and the "081 AC-39" release and environment flows |

The page-context fix came after that run. It's covered by its unit test (2 passed) and the web typecheck.
Review loop: still not run (the specclaw-review server isn't connected).
