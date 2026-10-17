# Delivery: match the mock, section by section

**Change:** 041-delivery-mock-parity · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [007](../007-delivery-projects/change.md)

## Problem

007 shipped the delivery screens from the database, but its visual check covered one board lane. The product owner found the screens drift from the mock: the release map lacks its status pills and styling, three charts are missing, dates are formatted differently, the proposals list doesn't page, and tabs replace the rail entries. The mock is the agreed design, so drift is a defect.

## Mock Delta

No new design. Screens move to match [`001-amax-foundation-projects`](../../mock/index.html#001-amax-foundation-projects), [`-project`](../../mock/index.html#001-amax-foundation-project), [`-proposals`](../../mock/index.html#001-amax-foundation-proposals) and [`-releases`](../../mock/index.html#001-amax-foundation-releases).

## Acceptance Criteria

1. **AC-1** Projects: the head row (lede, client filter, New project), four tickets with their art, "Tasks done per week" (line, planned vs done) and "Revenue by project" (donut), and the portfolio table, as in the mock.
2. **AC-2** Project page: breadcrumb, sprint lede, the mock's tab bar, and cards with the mock's footers. Move stays available but doesn't change the card's resting look (a card menu, not an inline form).
3. **AC-3** Proposals: "Proposals by phase" and "Shipped to Prod per week" side by side, phase segments that filter, and a paged table (Filter, Export) as in the mock.
4. **AC-4** Releases: the map with stations, rolled-back marker and status pills ("Testing since …", "Rolled back …", "Live since …"), and the table with the mock's date and action formats.
5. **AC-5** Projects, Proposals and Releases are rail entries like the mock (one module, several nav entries; needs a manifest `nav[]`).
6. **AC-6** A Playwright visual test compares every section above with the mock at 1440 px and 390 px within 2%, with fixtures pinned to fixtures.md's "today" (Oct 16, 2026) so dates render the same.

## Tasks

## Verify
