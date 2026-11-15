# Project team: add people from the project, hand over the PM, and keep internal teams on without monthly copies

**Change:** 107-project-team · **Created:** 2026-11-15 · **Review:** change

**Builds on:** 106-set-up-project-card (its card hands off to this change's "Add someone" card).

## Problem

Being on a project means being its manager or being allocated to it this month. Adding someone today means knowing to
ask chat to "allocate" them, by employee number or full name, and it fails for anyone without an HR record, such as a
person added with `admin user-add`. The manager is whoever created the project, with no way to hand it over. And on an
internal project such as AMX, everyone drops off on the 1st of each month unless the allocations are copied, so their
syncs are refused and they can no longer own proposals. Asked 2026-11-15 by the product owner (Umar Ahamed).

**Out of scope:** the amax plugin offering setup for an unknown project; Connect GitHub.

## Mock Delta

What changes on screen, and where to see it: [`107-project-team`](../../mock/index.html#107-project-team)

The project's Team page leads with **PM: Maya Fernando** and an **Ask amax · Add someone to AMX** button. Chat answers
with a choice card of likely people (name · role · % free this month), a percent and **This month / Until further
notice**. Someone without an HR record gets "Add Chandima to HR first?" on the same card. A standing member shows
"until further notice" in the team list. "Make Nimal the PM of AMX" gets a one-line confirm card.

## Acceptance Criteria

1. **AC-1** A new MCP write tool `set_project_manager` (`projectKey`, `userId`) makes an active person the project's
   manager. An Admin or the current manager may run it; anyone else is refused with the reason. It is audited, emits
   `delivery.project.manager-changed` (from, to), and the new manager is notified. The new manager gets the project's
   PM rights at once (managed-project scope); the old one keeps only what their own allocation gives them.
2. **AC-2** In chat, "make Nimal the PM of AMX" shows a confirm card "Make Nimal Silva the PM of AMX (was Maya
   Fernando)" with button **Make PM**. A person who isn't active is refused before the card.
3. **AC-3** `allocate` takes `standing: true` (with `month` as its first month and no `through`): the person stays
   allocated at that percent in every month from then on, until it is ended. `percent: 0` from a month ends it from that
   month; earlier months stay. A standing allocation and month rows for the same person and project don't both count:
   the month row wins for its month.
4. **AC-4** Everything that reads "on the project this month" counts a standing allocation: the viewer's assigned
   projects (sync permission, proposal owners, task done), `get_project_team`, the allocations grid and capacity. Nobody
   standing drops off on the 1st, with no copy run.
5. **AC-5** `get_project_team` and the Team page mark a standing member "until further notice"; the grid shows the
   percent in every month with the same mark.
6. **AC-6** The Team page (`/delivery/p/:key/team`) leads with the PM (pinnable) and an **Ask amax · Add someone to
   <KEY>** intent button that opens chat with the project pinned and "Add someone to <KEY>" filled in. No form on the page.
7. **AC-7** In chat, "add someone to AMX" (or the button) gets one choice card: up to four likely people who aren't on
   it this month, each "<name> · <role> · <n>% free this month" (most free first), plus "Someone else…" with a name
   field; a percent field (default 100 for an internal project, 50 otherwise); and **This month / Until further notice**
   chips (Until further notice preselected for internal billing). The button names it: **Add Chandima to AMX**.
8. **AC-8** When the person picked has no HR record, the card says so and offers **Add to HR and AMX**: it runs
   `add_person` (name and work email from their account, title and department typed on the card, entity chips) and then
   `allocate`, confirmed once. If the HR write is refused, nothing is allocated.
   (Plan note, 2026-11-15, for the product owner to confirm: one chat card runs exactly one service write (043), so a
   write across HR and Allocations can't be one confirm, as presales' Promote to delivery isn't. Planned instead: the
   card offers **Add Priya to HR**; once confirmed, chat shows the allocate card at once, filled in. Two confirms in a
   row; if the HR write is refused, no allocate card appears.)
9. **AC-9** After 106's card creates a project, chat offers "Add your team?" with this change's card for the new project.
10. **AC-10** A PM can add people and hand over the PM only on projects they manage; an Admin on any. Engineers and
    others get no card; chat says who can.
11. **AC-11** Every card here is keyboard-complete, its fields labelled, errors announced, in light and dark themes;
    every person and the PM line on the Team page carry a PinButton that resolves to that person on that project.

## Tasks

- [ ] `T1` — Team page: leads with the PM line (pinnable) and an **Ask amax · Add someone to KEY** intent button with the
  project pinned; standing members marked "until further notice" in the team table and the allocations grid; no write
  controls on the page (AC-5, AC-6, AC-11)
  Files: modules/allocations/ui/ProjectTeamPage.tsx, modules/allocations/ui/Grid.tsx, modules/allocations/ui/allocations.css,
  modules/allocations/server/team.ts, modules/delivery/contracts.ts
- [ ] `T2` — The Add to project card: `allocate`'s card gets a 106 form (up to four likely people not on the project this
  month, most free first, as chips labelled "name · role · n% free this month", plus "Someone else…"; percent, default
  100 on an internal project and 50 otherwise; This month / Until further notice chips, the latter preselected for
  internal billing), button "Add NAME to KEY"; after 106's card creates a project its receipt offers "Add your team?",
  which fills the message box (AC-7, AC-9, AC-11)
  Files: modules/allocations/mcp.ts, modules/allocations/server/add-card.ts, modules/allocations/chat.ts,
  packages/core/src/module.ts, apps/web/components/chat/ConfirmCard.tsx, apps/web/components/chat/Chat.tsx,
  modules/delivery/server/set-up-project-card.ts, modules/allocations/tests/add-card-107.test.ts
  Depends: T1
- [ ] `T3` — Standing allocations: `allocate` takes `standing: true`; a new `allocations.standing` row (RLS, retention)
  records it, and month rows are written 12 months ahead so every reader counts it unchanged; a monthly schedule
  extends the horizon; `percent: 0` from a month ends it from then on, earlier months kept; a month row set by hand wins
  for its month; `get_project_team` and the grid read the standing mark (AC-3, AC-4, AC-5)
  Files: modules/allocations/db/migrations/0002_standing.sql, modules/allocations/db/schema.ts,
  modules/allocations/server/services.ts, modules/allocations/server/standing.ts, modules/allocations/module.ts,
  modules/allocations/mcp.ts, modules/allocations/README.md, modules/allocations/tests/standing-107.test.ts
- [ ] `T4` — `set_project_manager`: a Delivery service (Admin, or the current manager) that makes an active person the
  manager, audited, emitting `delivery.project.manager-changed` (from, to); a notification rule tells the new manager;
  chat's card "Make NAME the PM of KEY (was NAME)" with button **Make PM**; an inactive person is refused before the card
  (AC-1, AC-2, AC-10)
  Files: modules/delivery/server/manager.ts, modules/delivery/mcp.ts, modules/delivery/contracts.ts,
  modules/delivery/module.ts, modules/delivery/server/write-cards.ts, modules/delivery/README.md,
  modules/delivery/tests/manager-107.test.ts
- [ ] `T5` — No HR record: the Add to project card names someone who can sign in but has no HR record, and offers **Add
  NAME to HR** (an `add_person` form card: name and work email from their account, title and department typed, entity
  chips); once confirmed, chat proposes the allocate card filled in; a refused HR write proposes nothing more (AC-8, AC-10)
  Files: modules/hr/mcp.ts, modules/hr/server/add-person-card.ts, modules/allocations/server/add-card.ts,
  modules/hr/tests/add-person-card-107.test.ts
  Depends: T2
- [ ] `T6` — End to end and docs: on a project's Team page, Add someone (pick, percent, until further notice, confirm,
  the row shows "until further notice"); hand over the PM; someone with no HR record added in two confirms; after
  setting up a project, "Add your team?"; keyboard and axe on each card (AC-6, AC-7, AC-8, AC-9, AC-11)
  Files: apps/web/tests/e2e/project-team.spec.ts, apps/web/playwright.auth.config.ts, packages/ai/src/scripted-writes.ts
  Depends: T3, T4, T5

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
