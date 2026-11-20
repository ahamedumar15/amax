# Agent-first projects fill their portfolio row from what the repo already tells amax

**Change:** 121-agent-first-portfolio-columns · **Created:** 2026-11-20 · **Review:** change

## Problem

On Projects → Portfolio, the amax project's row is empty: no Manager, Sprint, Margin or Next release, a "0 of 0" bar,
and a Health of "On track" that is only the column default. These are stored columns that only the demo fixtures fill
(`set_project_manager` writes Manager). An agent-first project (093: a linked repo that has synced proposals) already
gives amax what it needs to work them out: the proposals' phases, tasks and verify verdicts, plus its releases and
deployments. Asked by the product owner (2026-11-20).

## Mock Delta

What changes on screen, and where to see it: [`121-agent-first-portfolio-columns`](../../mock/index.html#121-agent-first-portfolio-columns)

- The amax row on Portfolio shows a computed Sprint, Progress, Health and Next release, each with a short reason.
- Manager says "No manager" instead of a blank, and Margin says "Internal" for an internal project.

## Acceptance Criteria

Each rule below applies to an agent-first project only. A manual project keeps its stored values exactly as today.
"Open proposals" means the project's proposals that aren't released or withdrawn (`withdrawnIn`).

1. **AC-1 Sprint.** The cell reads "Continuous", plus the number of open proposals (for example
   "Continuous · 4 open"), because an agent-first project has no sprints.
2. **AC-2 Progress.** The bar and its label are the sums of `tasks_done` and `tasks_total` over the open proposals
   (for example "23 of 31 tasks"). With no open proposal, it reads "Nothing open" instead of "0 of 0".
3. **AC-3 Health** comes from the open proposals:
   - **off-track** when any of them has a latest verify verdict of FAIL;
   - **at-risk** when none has failed but one in `building` hasn't been updated for 14 days or more;
   - **on-track** otherwise.

   The chip's tooltip and its `sr` text name the reason (for example "Off track: AMX-112 failed verify").
4. **AC-4 Next release.** It is the newest release that hasn't reached the project's Prod environment, with the
   furthest environment it is in now (for example "v0.14.0, in Staging"). With no such release but with verified
   proposals waiting, it reads "3 verified, not released". With neither, it reads "–".
5. **AC-5 Margin.** An internal project (`billing = 'internal'`, agent-first or not) shows "Internal", not "–". A billed
   agent-first project keeps its stored margin, since finance data is out of scope here.
6. **AC-6 Manager** is never computed, because naming a manager is a person's decision. A null manager shows
   "No manager" in the cell, not an empty avatar. The row's pin is enough for chat to suggest `set_project_manager`
   (R3); the row gets no form.
7. **AC-7 One source.** `list_projects`, `get_project`, the Portfolio table and the Projects page's lede and tickets
   all read the same computed values from one function in `modules/delivery/server`. Nothing new is written to the
   database, and no migration is needed.
8. **AC-8 Tests.** Unit tests cover each rule's branches (AC-1 to AC-6), and one e2e checks the AMX row on
   `/delivery` with its fictional fixture data.

## Tasks

- [x] `T1` — Portfolio cells read the computed values: Sprint label, Progress "N of M tasks" or "Nothing open", Health chip with its reason as tooltip and `sr` text, Margin "Internal", Manager "No manager" (AC-1–AC-6)
  Files: modules/delivery/ui/ProjectsPage.tsx
  Depends: T2
- [x] `T2` — One read-time function computes an agent-first project's Sprint, Progress, Health (and its reason) and Next release from its open proposals, releases and Prod deployments; internal billing gives margin "Internal"; `listProjects` and `getProject` apply it, so `list_projects`, `get_project`, the table, lede and tickets share it; manual projects unchanged; no writes, no migration (AC-1–AC-5, AC-7)
  Files: modules/delivery/server/portfolio.ts, modules/delivery/server/queries.ts, modules/delivery/mcp.ts
- [x] `T3` — Unit tests for every rule's branches (open/none, FAIL/stale 14 days/fine, release not in Prod/verified waiting/neither, internal vs billed margin, null manager, manual project untouched), and an e2e for the AMX row on `/delivery` (AC-8)
  Files: modules/delivery/tests/portfolio-121.test.ts, apps/web/tests/e2e/delivery.spec.ts
  Depends: T1, T2

## Verify

Quality: 57 → 57 duplicated lines in modules/delivery (none in 121's files; no refactor).
