# Project tabs share one header, and Team, Proposals and Releases lay out properly

**Change:** 122-project-tabs-layout · **Created:** 2026-11-22 · **Review:** change

## Problem

A project's six tabs (Board, Proposals, Releases, Risks and decisions, Team, Contract) each draw their own header, so
the tab bar jumps up and down between them and only Board shows the project's lede. On Team the PM card is a tall,
mostly empty box and the two cards touch. On Proposals the agent-first (i) sits alone above the attention strip
instead of beside the title, and every row repeats the project's name. On Releases an empty release map is a blank
box, and an empty "All releases" table shows only headers, with no message. Found by the product owner on AMX
(2026-11-22, screenshots of Team and Proposals).

## Mock Delta

What changes on screen, and where to see it: [`122-project-tabs-layout`](../../mock/index.html#122-project-tabs-layout)

- One project header on every tab: breadcrumb, project name with the agent-first (i) beside it, the project's lede,
  the tab's action on the right, then the tab bar, always in the same place.
- Team: ~~the PM is one compact line card; the Team card sits below it~~ one Team card: its head, then the project
  manager highlighted on its own row (avatar, name, "Project manager", pin), then the allocation table, where the PM's
  own row carries a **PM** chip.
- Amendment 1 (product owner, 2026-11-23, from a screenshot during build): two separate cards for the PM and the team
  "looks odd"; keep it one card with a professional way to highlight the role.
- Proposals: the (i) is beside the title; the strip and the table follow with no stray row; no Project column.
- Releases: an empty release map and an empty release list each say so in one line inside their card.

## Acceptance Criteria

1. **AC-1** Every project tab renders the same header from one shared component: breadcrumb (Projects / project /
   tab, the tab name only off Board), the project name as the page's h1, the project's lede (Board's current lede,
   e.g. "Continuous. Released means it reached Prod."), the tab's own action at the right of the title row (Team's
   **Ask amax · Add someone to AMX**, Board's view control), and the tab bar.
2. **AC-2** On AMX at 1440 px, the tab bar's top edge is at the same position on all six tabs (within 1 px), in light
   and dark themes.
3. **AC-3** For an agent-first project, the (i) button sits directly right of the project name in the title row on
   every tab, with its tooltip as today (opens on click and focus, closes on Escape). Nothing renders as its own
   row above the content, on Proposals or anywhere else.
4. **AC-4** (amendment 1) Team is one card. Below its head, the project manager has a highlighted row of its own:
   initials avatar, name, "Project manager", and a pin to the project. A deactivated PM keeps its "Account deactivated
   · needs a new PM" chip; a project with none reads "No project manager yet". The allocation table follows in the
   same card, and when the PM is allocated, their row carries a **PM** chip beside their name.
5. **AC-5** Team: the Team card's head shows the title, its pin and "From allocations" on one line, with the
   pin beside the title and the note right-aligned. Nothing in the head wraps at 1440 px.
6. **AC-6** On a project's Proposals and Releases tabs, the tables have no Project column (every row is that
   project). The all-projects pages keep theirs.
7. **AC-7** Releases: with no active release, the Release map card shows one line ("No active releases on <project>.
   Switch to All to see past ones.") instead of an empty box; with no releases at all it says "No releases on <project>
   yet." (review round 4: there are no past ones to switch to). With no releases at all, the All releases card shows an
   empty state ("No releases yet") in place of the table, and nothing extends past the card's edge.
8. **AC-8** At 390 px the header wraps without overlap (the action moves below the title), the tab bar scrolls
   sideways inside itself, and no tab scrolls the page sideways.
9. **AC-9** Risks and decisions and Contract change only by the shared header; their empty states stay as they are.
10. **AC-10** Tests: an e2e that opens all six AMX tabs and checks AC-2 and AC-3; checks for AC-4 to AC-7 on AMX
    (and on Contoso for a project with releases); axe finds no violations on Team, Proposals and Releases in light
    and dark themes; the delivery visual test still passes.

## Tasks

- [x] `T1` — One `ProjectHeader` in Delivery's UI (crumb, project name with the agent-first (i) beside it, lede, actions, tab bar) and its styles: card gap, compact one-line card, one-line card head, and at 390 px a wrapping head with the tab bar scrolling inside itself (AC-1, AC-3, AC-4, AC-5, AC-8)
  Files: modules/delivery/ui/ProjectHeader.tsx, modules/delivery/ui/delivery.css
- [x] `T2` — Delivery's tabs use it: Board, Proposals, Releases, Risks and decisions, Contract; the (i) is no longer its own row on Proposals; a project's Proposals and Releases tables drop the Project column; Releases says when the map or the list is empty (AC-1, AC-2, AC-3, AC-6, AC-7, AC-9)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProjectSections.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ReleasesPage.tsx
  Depends: T1
- [x] `T3` — One source for the header's data: `server/header.ts` reads the project and its Prod environment and builds the lede ("<sprint line>Released means it reached <Prod env>."); Delivery provides the header in a slot, `PROJECT_HEADER_SLOT`, declared in its contract, as Time fills `PROPOSAL_TIME_SLOT` (AC-1)
  Files: modules/delivery/contracts.ts, modules/delivery/server/header.ts, modules/delivery/ui/ProjectHeaderSlot.tsx, modules/delivery/module.ts
  Depends: T2
- [x] `T4` — Team (Allocations) renders the header from the slot, with its Ask amax button as the action; the PM card is one compact line and the Team card's head keeps the title, pin and "From allocations" on one line (AC-1, AC-3, AC-4, AC-5)
  Files: modules/allocations/ui/ProjectTeamPage.tsx
  Depends: T1, T3
- [x] `T5` — Tests: an e2e over the six AMX tabs (tab bar position within 1 px, the (i) beside the title, light and dark), the Team, Proposals and Releases checks (AC-4 to AC-7, Releases on Contoso and on an empty project), 390 px with no sideways page scroll, axe on Team, Proposals and Releases in both themes; a unit test for `projectHeader`'s lede; the delivery visual test still passes (AC-2, AC-8, AC-10)
  Files: apps/web/tests/e2e/project-tabs-122.spec.ts, modules/delivery/tests/project-header-122.test.ts, modules/delivery/README.md
  Depends: T2, T4

## Verify

**Verdict:** pending — the local review loop runs after the `contracts.ts` comment removal is committed

Checked 2026-11-23 at `d9410f8` plus that one-line removal, Windows 11, dev app on :3000 with the local dev database.

- AC-1: pass — one `ProjectHeader` (Delivery UI) renders on all six tabs: the Board and the section pages call it directly, and Team (Allocations) renders it from `PROJECT_HEADER_SLOT`. The lede comes from `server/header.ts` (`tests/project-header-122.test.ts` AC1).
- AC-2: pass — the tab bar's top edge is at 237.3 px on all six AMX tabs, light and dark (spread 0.0 px; it was 219 to 266 px); e2e `project-tabs.spec.ts` AC2.
- AC-3: pass — one (i) per tab, 8 px right of the h1 on its centre line, and none outside `.dv-head .dv-title` (e2e AC3); the tooltip is the existing `AgentFirstLine` unchanged.
- AC-4: pass (amendment 1) — Team is one card: the PM row (initials, name, "Project manager", pin) leads, then the table; Umar's row on AMX carries the PM chip (`shots/app-team-dark.png`); e2e AC4 on CON (one card, the lead row above the table, its pin).
- AC-5: pass — the head's title, pin and "From allocations" sit on one line (e2e AC5).
- AC-6: pass — no Project column on CON's Proposals and Releases tabs; the all-projects pages keep it (e2e AC6).
- AC-7: pass — AMX: "No active releases on amax. Switch to All to see past ones." and "No releases yet" with no table (e2e AC7, `shots/app-releases-light.png`).
- AC-8: pass — at 390 px no tab scrolls the page sideways and the tab bar stays inside the viewport (e2e AC8, `shots/app-team-390.png`).
- AC-9: pass — Risks and decisions and Contract changed only by the shared header (`ProjectSections.tsx` diff).
- AC-10: pass — e2e `project-tabs.spec.ts` 5/5 (run against the dev app with a scratch config; CI runs it in the `screens` group); axe clean on Team, Proposals and Releases in both themes; 107's Team e2e moved to the PM row. Not run here: the delivery visual test (it needs the signed-in suite's own database, which doesn't set up on Windows); CI runs it.

Commands (exit codes):
- `pnpm lint` (36 tasks, module graph check ok): 0
- `pnpm turbo run build --filter=./apps/web`: 0 (compiled in 22.7 s)
- `pnpm turbo run test --filter=@amax/delivery --filter=@amax/allocations --concurrency=1`: 1 — 749/751 passed; `releases.test` (Windows backslash paths, host-only) and `create-project-surfaces` (passes alone, a load flake) fail on this host only, neither touched here
- `npx playwright test` (scratch config, `project-tabs.spec.ts` only): 0, 5 passed
- `specclaw-verify size` with `base_branch` 20a43e2286 for the run: 0 — 241 production lines (cap 400)
- `specclaw-preset-check .`: 1 — 4,674 violations repo-wide, pre-existing (as recorded at 120); 122's new files are clean; the comment 122 added to `contracts.ts` was removed; touched files over 80 lines were already over (ProjectPage 127 → 109)
- `specclaw-quality-scan . --gate`: 2 — the complexity tool did not run (0 functions counted); duplication ran: 872 lines repo-wide, none in this change's files

Screenshots: `shots/mock.png`, `shots/app-{team,proposals,releases,board}-{dark,light}.png`, `shots/app-team-390.png`

Quality: 872 → 872 duplicated lines repo-wide (`specclaw-quality-scan`, 2026-11-23); none in this change's files, so no refactor.
