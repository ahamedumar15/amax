# HR one today: changes and reads by the entity's own date, and entities with no time zone shown

**Change:** 110-hr-one-today · **Created:** 2026-11-15 · **Review:** change

**Builds on:** 109-project-team-follow-ups (its two majors and five minors open at the pass-5 cap; `## Verify` and
`follow-ups.md`).

## Problem

109 moved add_person, leavers and the HR status job onto today in the entity's own time zone, and refuses an entity with
none. The rest of HR still uses UTC's today: change_person's default effective date and its "title, location and work
email change today" check, and the reads of what is in force (a person, the directory, an employment period, who reports
to whom). In the hours when Sri Lanka or Sydney is already a day ahead of UTC, someone added with today's join date isn't
yet employed for those reads and changes. The hourly job also skips an entity with no time zone with only an audit line to
show for it, so its joiners and leavers stop moving and nobody is told. Five small 109 follow-ups ride along.

## Mock Delta

What changes on screen, and where to see it: [`110-hr-one-today`](../../mock/index.html#110-hr-one-today)

The People screen leads with an attention line when an entity has no time zone: "Lumen Labs Pty Ltd has no time zone
set: its joiners and leavers aren't moved, and people can't be added there", with **Ask amax · Set the time zone**
(set_entity_zone, pinned to the entity). The Add to project button shows a Through before the start as typed, never as a
range.

## Acceptance Criteria

1. **AC-1** change_person's default effective date, and the check that title, location and work email change only today,
   use today in the person's entity's own time zone; an entity with no time zone is refused with 109's message. At 20:00
   UTC a Sri Lankan or Sydney person's title changes with no date given, and their department change takes effect on
   their own today.
2. **AC-2** HR's reads of what is in force today (the person by employee number, get_person, the directory, the
   employment period and who reports to whom, in `contracts.ts`) read on each person's entity's own today, so someone
   added at 20:00 UTC with today's join date is found employed at once.
3. **AC-3** When an entity has no time zone, the People screen leads with an attention line naming it, with **Ask amax ·
   Set the time zone** (set_entity_zone, its pin on the entity), and the hourly status job's run says which entities it
   left unmoved (its summary, not only the audit). The line goes once the zone is set.
4. **AC-4** When the monthly job ends a standing allocation, the end is in the name of whoever set it
   (`allocations.standing for <who>`), as its extensions are; the leaver handler's end names the leaver's record.
5. **AC-5** On the Add to project button, a Through month before the start shows as typed after the start month, never as
   a range; Through from the start month on still reads as one range.
6. **AC-6** The add_person card's note reports only the entity lookup's own refusals (not found, more than one); any other
   error is an error, not a note. linkNote's comment says what its note says.
7. **AC-7** The 109 done-line test drives an edited Through through the chat engine's confirm path and reads the stored
   card's done line.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
