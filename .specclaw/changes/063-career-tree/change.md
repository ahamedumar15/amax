# Career tree: one person's whole history in one view

**Change:** 063-career-tree · **Created:** 2026-10-18
**Lane:** People · **Module:** `modules/career` (new) · **Depends on:** [011](../archive/011-hr-core/change.md), [010](../archive/010-allocations-forecast/change.md), [024](../archive/024-learning/change.md), [007](../archive/007-delivery-projects/change.md), [050](../archive/050-immutable-trace/change.md)

## Problem

A person's history is split across HR (grade, department, manager), allocations (projects), learning
(certifications) and the audit trail (who changed what). Nobody can see, in one place, how someone
grew: where they started, which projects they worked on and with what technologies, when they were
promoted, and who recorded each change. Managers and HR rebuild this by hand for reviews, promotions
and staffing.

## Mock Delta

What changes on screen, and where to see it: [`063-career-tree`](../../mock/index.html#063-career-tree)

New "Career" view under the Person page (Kasun Dias). It shows a career tree that grows up from the
join date:
- **Trunk:** the years.
- **Rings:** promotions and grade changes.
- **Branches:** projects. Each branch leaves the trunk at its start month, and its length is the time
  on the project.
- **Leaves:** the technologies used on each project.
- **Fruit:** certifications.
- **Roots:** department, manager and entity moves.

Beside the tree is a "What changed" timeline list with filters (all, promotions, projects,
technologies, certifications, moves). The selected node's trace panel shows what changed, when, who
recorded it (a person, or an agent acting for one), the source record, and its pin.

## Acceptance Criteria

1. **AC-1** A new `career` module owns the view. It reads only through other modules' `contracts.ts`:
   - hr: `listEmploymentPeriods` and `getEmployment` for grade, department, manager, entity and
     contract.
   - allocations: `listAllocations` for projects by month.
   - delivery: project names and clients.
   - learning: certifications.
   - audit/trace: who and when.

   It writes only to its own `career` schema. hr can't host it, because allocations already imports
   hr's contracts and the reverse import would create a cycle. `npm run check:graph` passes.
2. **AC-2** The Person page gets a "Career" link that opens `/hr/p/<id>/career` (route owned by
   `career`). The tree follows the Mock Delta encoding:
   - Rings are placed at each grade change. They are labelled with the new grade and get thicker
     with seniority.
   - A branch starts at the project's first allocated month and ends at the last one (or "now").
     Consecutive months merge into one branch.
   - Fruit is placed at the issue date. A certification that has expired shows as a faded fruit.
   - Root changes are placed below the ground line at their effective date.

   For the fixture person, the counts match the mock exactly.
3. **AC-3** Technologies are career's own records: a `technology` tag per person × project, with a
   source.
   - An agent proposes tags from delivery's ingested commits and linked repos (languages and
     dependencies). Chat confirms them with the write tool `tag_technology` after the pending-action
     confirm.
   - The person's skills-matrix entry (allocations `member.skill`) shows as a leaf on the trunk.
   - The same technology has the same colour on every branch.
   - The page has no inline edit. "✦ Ask amax" opens chat with the person pinned and a prompt such
     as "Correct Kasun Dias's career history".
4. **AC-4** Every node and every timeline row is focusable and pinnable. Its `PinRef` resolves
   through the read tool `get_career_event` to that exact event.

   Selecting a node shows its trace:
   - what changed (before → after);
   - the effective date;
   - who recorded it: a person, or "agent for <person>";
   - who approved it, if anyone;
   - a link to the source record in its own module.

   Selecting the same item in the tree and in the list highlights both.
5. **AC-5** Read tool `get_career(personId)` returns the same nodes as the screen, so an agent can
   answer "what has Kasun worked on since 2023?". The only write tool is `tag_technology`.
6. **AC-6** The career tree follows the same permissions as other person data:
   - **Who can see it:** the person, their manager chain, HR and leadership. Other viewers get 404.
   - **Pay:** pay changes are never nodes. A grade change shows the grade, never the salary.
   - **Health documents:** don't appear.
7. **AC-7** Accessibility:
   - The timeline list carries the same information as the tree, in date order. The tree is an SVG
     with `role="group"` and a label on each node.
   - Arrow keys move along the trunk, and Enter opens a node's trace.
   - The growth animation is off under `prefers-reduced-motion`.
   - The tree works in light and dark themes.
   - Below 720px the list comes first and the tree scales to fit, with no horizontal page scroll.
   - axe is clean on `/hr/p/LL-0417/career`.
8. **AC-8** The module meets the `docs/module-standard.md` items listed below. When an optional
   source module (allocations, learning or delivery) is off, its part of the tree is missing and a
   note says why. The trunk and rings need only hr.
   - It changes nothing outside `modules/career/` (apart from its CODEOWNERS line and the Person
     page link slot).
   - Its `contracts.ts` is published first and has contract tests.
   - It has a README, fixtures and a manifest.
   - It can be switched off.
9. **AC-9** Fixtures give Kasun Dias a clearly fictional history that matches the mock:

   | What | Count | Detail |
   |---|---|---|
   | Grade changes | 3 | Associate Engineer 2021 → Engineer 2022 → Senior Engineer 2024 |
   | Projects | 4 | Contoso Portal, Northwind Claims, Fleet Tracker, Internal Design System |
   | Technologies | 9 | — |
   | Certifications | 2 | 1 expired |
   | Moves | 2 | Manager changes |

## Open questions for plan

- Do delivery's ingested commits carry language or dependency data? If not, `tag_technology` starts
  as chat-only, and the agent proposal follows in a later change.
- Should the Person page link be a tab or a card? The mock shows a card with a mini tree that
  links through.

## Tasks

<!-- Added by plan. -->

## Verify

<!-- Filled by verify. -->
