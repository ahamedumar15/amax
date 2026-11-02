# 080 follow-ups

- [major B1] `apps/web/tests/e2e/chat-first.spec.ts:27` (rounds 1–3, escalated; shipped bounded by the product owner's
  decision, 2026-11-02). The allocations copy e2e accepts only grids whose first month is 2026-09 to 2027-01, because
  the server reads the wall clock (`gridFor`'s `new Date()`, `modules/allocations/server/grid.ts:51`) and the fixtures
  hold only the Dec 2026 → Jan 2027 copy. From 2027-02-01 it fails on the prompt on every branch. Class fix, in a
  change of its own, either:
  1. shift the allocations e2e data by the months since the fixtures' day, as presales does
     (`modules/presales/tests/e2e/shift.ts`, `FIXTURE_DAY` + `SHIFT_SQL`, applied in its e2e setup), so the window,
     the January column and the copy line up in any month; the test then builds its copy text from the grid's months;
  2. or a validated platform clock (`@amax/core` config, `now()`), which allocations reads and e2e pins to
     2026-10-16 (041's review: a clock belongs in a platform change, not a module).
  Option 1 is smaller and already has a pattern in the repo.
