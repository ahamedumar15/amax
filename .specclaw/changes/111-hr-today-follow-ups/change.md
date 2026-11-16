# HR today follow-ups: one date engine, the README, a dead re-export, and a test that won't drift

**Change:** 111-hr-today-follow-ups · **Created:** 2026-11-16 · **Review:** change

**Builds on:** 110-hr-one-today (its four minors from the final pass, in its `follow-ups.md`, round 4).

## Problem

110 passed clean with four minors open. HR works out an entity's today two ways: `entityToday` in Node (Intl) for
change_person and add_person, `entityDay` in Postgres for the in-force reads, on two tz databases that could disagree.
`services.ts` re-exports two helpers nobody imports from it. The HR README still says reads default to "today" and
doesn't say the status job fails naming entities with no zone. And 110's confirm test allocates 2027–2028 months
against the real clock, so it will break as those months pass, the date drift CI already suffers.

## Mock Delta

What changes on screen, and where to see it: [`111-hr-today-follow-ups`](../../mock/index.html#111-hr-today-follow-ups)

No screen change: the mock section says so.

## Acceptance Criteria

1. **AC-1** `entityToday` gives the date Postgres works out for the entity (`entityDay`), still refusing an entity with
   no zone: one date engine for HR's writes and reads. At 20:00 UTC on 15 Nov, Sri Lanka and Sydney get 2026-11-16 from
   both.
2. **AC-2** `services.ts` no longer re-exports `entityToday` and `noZone`; their one home is `zones.ts`.
3. **AC-3** The HR README says HR's reads default to each person's own today in their entity's time zone (UTC for an
   entity with none), names `get_legal_entity`, and says the hourly `hr.person.status` job fails naming entities with no
   zone once the others are moved.
4. **AC-4** The add-card confirm test fakes its clock, so its months stay in the future whatever the real date.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
