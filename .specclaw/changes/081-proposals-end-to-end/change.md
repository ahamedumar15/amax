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
- [ ] `T7` — Phase 7 (notifications and lifecycle consistency): owner notifications for phase changes and tasks done by others; regression tests for release, void, sync and push rules with withdrawn rows (AC-18, AC-19, AC-20)
  Files: modules/delivery/contracts.ts, modules/delivery/module.ts, modules/delivery/server/services.ts, modules/delivery/server/tasks.ts, modules/delivery/tests/proposal-notify.test.ts, modules/delivery/tests/proposal-regression.test.ts
  Depends: T6
- [ ] `T8` — Phase 8 (tests and verification): e2e opens a proposal from the list, board and search; lint, unit tests, build, `e2e:auth` delivery; README and audit progress (AC-21)
  Files: apps/web/tests/e2e/proposals.spec.ts, modules/delivery/README.md, .specclaw/changes/081-proposals-end-to-end/audit.md, .specclaw/changes/081-proposals-end-to-end/change.md
  Depends: T7

## Verify
