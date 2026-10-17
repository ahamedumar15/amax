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

## Verify
