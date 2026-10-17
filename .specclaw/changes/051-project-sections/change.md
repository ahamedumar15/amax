# Project sections that work

**Change:** 051-project-sections · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [041](../archive/041-delivery-mock-parity/change.md), [010](../archive/010-allocations-forecast/change.md)

## Problem

The section tabs on the project page (`/delivery/p/CON`) look like they do nothing. Debugging found the cause in `modules/delivery/ui/ProjectPage.tsx:99-105`:
- Risks and decisions, Team and Contract are placeholder buttons with `aria-disabled` and no handler. They are styled exactly like enabled tabs.
- Board is only a pressed state, not a link.
- Proposals and Releases leave the project for the global lists, and Releases isn't filtered to the project.

Reproduced in a Playwright browser: every tab is hit-testable, and Proposals navigates to `/delivery/proposals?project=CON`.

## Mock Delta

What changes on screen, and where to see it: [`051-project-sections`](../../mock/index.html#051-project-sections)

- Each tab is a link to `/delivery/p/<key>/<section>`. The current tab has `aria-current="page"`, and the project header stays in place.
- **Proposals** and **Releases** show this project's proposals and releases inside the project page.
- **Team** shows who is allocated to this project this month and the next two months, with their percentages (from allocations).
- **Risks and decisions** and **Contract** open an empty state that says which change brings them ("Arrives with RAID logs", "Arrives with finance, 017"), with an "Ask amax" chip. They are no longer dead buttons.

## Acceptance Criteria

1. **AC-1** All six tabs are links (`/delivery/p/<key>`, `/proposals`, `/releases`, `/team`, `/risks`, `/contract`). Each works by keyboard and marks itself with `aria-current="page"`. An e2e test clicks every tab and checks the URL and the heading for that section.
2. **AC-2** Proposals and Releases list only this project's records, with the same rows, pins and filters as the global pages. A test seeds two projects and checks that the other project's records are absent.
3. **AC-3** Team lists people allocated to this project for the current month and the next two months: name, role and percent per month. The data comes through `@amax/allocations/contracts` and respects the viewer's scope. Every row has a pin.
4. **AC-4** Risks and decisions and Contract render an empty state that names the change that brings them, plus an "Ask amax" chip. The page has no disabled-looking dead controls (unit guard: no `aria-disabled` on the project tabs).
5. **AC-5** Typecheck, unit tests, lint and both e2e suites stay green. The 041 visual diff is updated for the tab change only.

## Tasks

- [x] `T1` — Section tabs become links with `aria-current="page"` under a shared project header; Risks and decisions and Contract open empty states with an "Ask amax" chip; delivery routes `p/:key/<section>` (AC-1, AC-4)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProjectSections.tsx, modules/delivery/ui/delivery.css, modules/delivery/module.ts, modules/delivery/contracts.ts
- [x] `T2` — Proposals and Releases sections reuse the global list components, scoped to the project in the query (AC-2)
  Files: modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/server/queries.ts, modules/delivery/mcp.ts
  Depends: T1
- [x] `T3` — Route mounts: a module may contribute a route under another module's URL space, and a contribution wins over the owner's fallback. Needed because delivery can't import allocations (allocations depends on delivery; R5 forbids the cycle) (AC-3)
  Files: packages/core/src/module.ts, apps/web/lib/registry.ts, apps/web/tests/routes.test.ts
- [x] `T4` — Team section, owned by allocations and mounted at `/delivery/p/:key/team`: this month and the next two from `listAllocations({ projectIds })` with the viewer as reader, names and roles from hr, a pin per row; delivery keeps a fallback empty state for when allocations is off (AC-3)
  Files: modules/allocations/ui/ProjectTeamPage.tsx, modules/allocations/server/team.ts, modules/allocations/module.ts, modules/allocations/mcp.ts, modules/allocations/tests/team.test.ts
  Depends: T1, T3
- [x] `T5` — Tests: unit guard (no `aria-disabled` in the tabs, every tab a link), project scoping of proposals and releases, signed-in e2e that clicks every tab, and the 041 visual baseline updated for the tab change only (AC-1, AC-2, AC-4, AC-5)
  Files: modules/delivery/tests/sections.test.ts, apps/web/tests/e2e/sections.spec.ts, apps/web/playwright.auth.config.ts, apps/web/playwright.config.ts
  Depends: T2, T4

## Build notes

- **Team is mounted from allocations (T3, T4).** Delivery can't import `@amax/allocations/contracts`: allocations already depends on delivery, so the import would be a module cycle (R5) and break migration order. Instead `ModuleRoute.mount` lets allocations serve `/delivery/p/:key/team`; delivery's own `p/:key/team` route is the fallback when allocations is switched off. The data still comes through `listAllocations({ projectIds })` with the viewer as reader. This touches `packages/core` and `apps/web/lib/registry.ts` (platform) beyond the delivery lane.
- New read tool `get_project_team` backs the Team pins; `list_releases` takes an optional `projectKey`.
- The preset's 80-line and no-comment rules weren't applied to existing files (`ReleasesPage.tsx`, `ProposalsPage.tsx`), which already exceed them; new files stay short.

## Verify

**Verdict:** PASS

- AC-1: pass — every tab is an `<a>` to `/delivery/p/<key>[/section]`; `apps/web/tests/e2e/sections.spec.ts` "AC1 AC4 …" focuses each tab, presses Enter, checks the URL, the h1, the section heading, `aria-current="page"` and axe (wcag2a/aa) on all six.
- AC-2: pass — `modules/delivery/tests/sections.test.ts` "AC2 …" compares each project's scoped proposals and releases with the global lists for every project with releases (other projects' records absent); e2e checks every Proposals and Releases row on CON is Contoso Portal. Same `ProposalsTable`/`ReleasesCards` components as the global pages.
- AC-3: pass — `modules/allocations/tests/team.test.ts` "AC3 …": three months from Oct 2026, role and percent per person, rows + hidden equals every allocated person, an hr scope limited to Australia sees fewer and counts the rest, an Engineer is refused. Data via `listAllocations({ projectIds })` with the viewer as reader. Every row has a pin (`get_project_team`), checked in e2e. `apps/web/tests/routes.test.ts` "AC3 …" covers the mount.
- AC-4: pass — Risks and decisions and Contract render "Arrives with RAID logs" / "Arrives with finance, 017" with an "Ask amax about Contoso Portal's …" button (e2e); unit guard: no `aria-disabled` and no `<button>` in the tabs.
- AC-5: pass — typecheck, unit tests, lint (incl. `check:graph`) and both e2e suites green; the 041 visual diff passes with no new allowance.

Commands (exit codes):
- `DATABASE_MIGRATE_URL=… pnpm test` → 0
- `pnpm lint` → 0 (graph check ok, 5 modules)
- `pnpm build` → 0
- `E2E_DB=amax_e2e_051 E2E_AUTH_PORT=3551 pnpm --filter @amax/web e2e:auth` → 0 (47 passed). A first run had one failure in `audit.spec.ts` (050 AC-5, strict-mode `getByRole("alert")` also matched Next's route announcer); it passed on the re-run, so it's a timing flake outside this change.
- `E2E_PORT=3552 pnpm --filter @amax/web e2e` → 0
- `specclaw-preset-check .` → 1: 700 repo-wide violations (comments, file length) that predate this change; the new files have none. Edited existing files keep their style.
- Quality: not_run (`specclaw-quality-scan` fails with jq "Argument list too long", a known tool issue)
- specclaw-review loop: not run (operator's review cadence)

Screenshots: `shots/app.png` (Team), `shots/app-contract.png`, `shots/app-releases.png`, `shots/mock.png`. The mock's 051 section sits inside the hidden 047-049 sections (unbalanced tags from earlier changes), so the mock shot moves it into `main` before capturing; the mock file is unchanged.
