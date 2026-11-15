# Project team follow-ups: standing allocations end cleanly, keep hand removals, and a month or range stays one

**Change:** 109-project-team-follow-ups · **Created:** 2026-11-15 · **Review:** change

**Builds on:** 107-project-team (its four majors open at the pass-5 cap, in its `follow-ups.md`, round 5).

## Problem

107's review stopped at the five-pass cap with four majors open. A standing allocation the monthly job ends (the person
left, or the project closed) keeps the months it already wrote, up to a year ahead. The Add to project card turns a
request for one month or a range into "until further notice" on an internal project, and can't keep a range at all.
Re-setting a standing allocation brings back months removed by hand. And add_person decides a new person's join date
in the entity's time zone but their status in UTC, so near midnight UTC they can be stored as joining and missing from
the card's picks.

## Mock Delta

What changes on screen, and where to see it: [`109-project-team-follow-ups`](../../mock/index.html#109-project-team-follow-ups)

On the Add to project card: a request for "March to May" shows a **Through** field (May) and **This month** preselected,
so the button reads "Add Dinesh to NWP, Mar–May"; a request naming one month preselects **This month** even on an
internal project. Nothing else on screen changes.

## Acceptance Criteria

1. **AC-1** When the monthly job ends a standing allocation because its person is no longer active or joining, or its
   project is no longer active, it removes the month rows that allocation wrote from the end month on, as ending it by
   hand does (one rule, `setStanding` with percent 0). Rows set by hand stay.
2. **AC-2** Re-setting a standing allocation (a new percent or start month) keeps every month removed by hand from the
   new start on: the old row's removals carry into the new one, and its months are not written again.
3. **AC-3** The Add to project card preselects **Until further notice** on an internal project only when the request
   named no month and no end month; a request with one month preselects **This month**.
4. **AC-4** A request with a range (`month` and `through`) keeps it: the card shows a **Through** field filled with the
   end month, the button names the range, and confirming allocates those months. "Until further notice" with a Through
   month is refused next to the field.
5. **AC-5** add_person decides both the default join date and the joining/active status from one date: today in the
   entity's own time zone. Someone added today, at any hour, is active, and the card's picks show them at once.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
