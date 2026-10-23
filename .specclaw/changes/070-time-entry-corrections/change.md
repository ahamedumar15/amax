# Time entry corrections: fix or remove hours, and keep Reports in step

**Change:** 070-time-entry-corrections · **Created:** 2026-10-22

## Problem

Time entries are insert-only (audit TIM-B01). A rejected week can only gain hours, so "you logged 8 h, it was 6 h"
can't be fixed, and hours never go down. Undoing a commit-draft suggestion deletes the entry without an event
(TIM-B02), so Reports keeps hours that no longer exist. On the way: an Admin can reopen their own approved week
(TIM-B06); writes without a week act on the UTC current week (TIM-B10); and `findWeek` tells "doesn't exist" apart
from "not yours", and locks rows before checking the caller (TIM-B12). Evidence is in [`audit.md`](audit.md).

**Amendment, 2026-10-22** (from the Time page requirements, FR-4.6, FR-5.8, FR-5.10, FR-5.14, FR-5.18): an
approved week can still be edited directly by another Admin rather than being locked, only the owner can fix a
draft or rejected entry, a delete removes the row instead of keeping it, and the confirm card doesn't say what is
changing. AC-13 to AC-17 cover these.

**Amendment 2, 2026-10-23** (from a live run with the real model; approved by the product owner, "make those changes
in the current branch"): the confirm cards are hard to read (the title is the tool description plus a comma list of
every input, the body shows raw field names, ISO dates and the entry id), approval cards show only a week id, and chat
can make a card that can only fail (Kasun confirmed "log 6 h" on his submitted week, then got the refusal). AC-20 to
AC-27 cover these. Ctrl+K on Team time was rechecked and works once the page has loaded (the run's driver pressed it
too early), so it isn't part of this.

## Mock Delta

What changes on screen, and where to see it: [`070-time-entry-corrections`](../../mock/index.html#070-time-entry-corrections)

My timesheet (009) gets, per project row, an **Ask amax** "Fix these hours" button with that row pinned. Chat lists the
row's entries and proposes `correct_time_entry` or `delete_time_entry`, which the person confirms. A rejected week shows
the approver's comment above the rows with the same button. There are no edit fields.

Amendment: the confirm card says what changes ("Fleet Tracker, Wed Oct 14: 10 h → 6 h"). An approved week
has no "Fix these hours" button, and chat answers a fix request with "locked, reopen it with a reason". A PM's card for a
member's entry names the person and the reason, and the member's bell shows "Ayesha Perera changed your Fleet Tracker
hours for Wed Oct 14" with the reason.

Amendment 2 ([`#070-amendment-2`](../../mock/index.html#070-amendment-2)): Time's confirm cards get a plain title and
labelled before → after lines, with no ids or field names: "Fix Fleet Tracker, Wed Oct 14" / "Hours 2.7 h → 2 h"; a fix
for someone else adds "For Tharushi Wijesinghe", the reason and "Tharushi will be notified"; "Approve Nimal Silva's
timesheet for 2026-W42 (31.5 h)". A request on a submitted or approved week gets a reply saying why and what to do next,
and no card.

## Acceptance Criteria

1. **AC-1** `correct_time_entry` (MCP tool + `time.entry.correct` service) changes one entry's hours, billable flag,
   note or project. The day can't change (delete and log again for that). Hours keep the `log_time` rules: > 0,
   ≤ 24 per person-day across entries, steps of 0.05 h. The owner may correct entries in a **draft** or **rejected**
   week. A **submitted** week is refused with "ask the approver to send it back". An **approved** week needs another
   Admin and is audited as `time.week.locked_change` (the existing lock guard, reused).
2. **AC-2** `delete_time_entry` (MCP tool + `time.entry.delete` service) removes one entry under the same rules as AC-1.
3. **AC-3** Each write emits one declared event in the same transaction as the row change:
   `time.entry.corrected` `{ entryId, weekId, userId, projectId, day, hours, billable, revision, before: { hours, billable, projectId }, lockedChange }`
   and `time.entry.deleted` `{ entryId, weekId, userId, projectId, day, hours, revision, lockedChange }`.
   `time.entry.logged` gains `revision: 1`. Payloads are declared in `module.ts`. The audit row records before and after.
4. **AC-4** `time.entry` gets `revision int not null default 1`, bumped on each correction. A refused write (validation,
   permission, lock) leaves the entry, the audit log and the outbox unchanged. A test forces a failure after the
   update and checks all three are rolled back.
5. **AC-5** Chat: intents `time.correct` and `time.delete` go through the pending-action confirm (no direct writes).
   `get_timesheet` and `get_my_week` return the week's entries with their ids, so chat can name the exact entry. My
   timesheet rows carry an `IntentButton` with a `PinButton` that resolves to that row (R3).
6. **AC-6** Undoing a commit-draft suggestion emits `time.entry.deleted` for its entry (TIM-B02).
7. **AC-7** Reports handles `time.entry.corrected` (update hours and billable) and `time.entry.deleted` (tombstone).
   It applies an event only when its `revision` is newer than the stored one, and a late `time.entry.logged` never
   brings back a tombstoned entry. Reports' utilisation never counts a deleted entry or a corrected entry's old hours.
8. **AC-8** `reopen_week` refuses the Admin's own week, matching the self-approval rule (TIM-B06).
9. **AC-9** Writes that name a week by person need an explicit `week` (or a `weekId`). `submit_week` needs `week`. Leaving it
   out is a validation error that names the field, never a guessed UTC week. The read tools keep "latest week" and say
   so (TIM-B10).
10. **AC-10** `findWeek` authorises before it locks. For a week the caller can't act on, "no such timesheet" and
    "not yours" give the same error. The namesake error doesn't list other people's emails (TIM-B12).
11. **AC-11** Regression tests (DB-backed, none skipped):
    - log → submit → reject → correct (down) and delete → resubmit, then check `weekTotals`, the submit payload's hours
      and `reports.logged_hours`;
    - unauthorised user, submitted week, approved week (owner refused; another Admin allowed and audited), 0 h,
      over 24 h a day, 0.07 h;
    - TIM-T01: apply suggestion → undo → deliver events → no `logged_hours` row;
    - events out of order: deleted before logged, and corrected twice in reverse;
    - TIM-T04: 24 h a day and 0.05 h steps; TIM-T05: `isoWeekOf(2025-12-29)` is `2026-W01`;
    - self-reopen refused; a write with no week refused; `findWeek` gives the same error for missing and out-of-scope weeks.
12. **AC-12** README (tools, events, rules) updated. `check:graph` passes; the `modules/time` and `modules/reports`
    suites pass with DB tests running.

**Amendment, 2026-10-22.** It is additive only: it changes 070's own new tools (`correct_time_entry`,
`delete_time_entry` and their cards), and nothing already on `main` behaves differently. Where AC-13 to AC-17
differ from AC-1 to AC-3, they win.

13. **AC-13** Approved weeks are locked for corrections and deletes (FR-4.6, FR-5.18). `correct_time_entry` and
    `delete_time_entry` on an **approved** week are refused for everyone, Admin included, with "2026-W42 is approved
    and locked; reopen it with a reason (reopen_week) to change it". Nothing is written. A reopened week (draft)
    takes them again. Chat relays the refusal and offers the reopen path. My timesheet shows no "Fix these hours"
    button on an approved week. **Unchanged:** `log_time`, accepting a commit draft, the 009 lock guard and its
    `time.week.locked_change` audit, and every event payload's existing fields (`lockedChange` stays, and is
    `false` on corrections and deletes).
14. **AC-14** A PM or Admin can fix someone else's entry (FR-5.10). The owner can correct or delete as before. So can a
    PM who holds `time:approve` on the entry's project (and on the new project, if it changes), and an Admin. Anyone
    else gets the AC-10 out-of-scope error. A non-owner must give `reason` (3–500 characters), or validation fails
    and names the field. The owner may leave it out. The same week rules apply to everyone: draft or rejected only,
    a submitted week is refused, and an approved week is refused (AC-13). The audit row records the reason. The
    `corrected` and `deleted` payloads gain `by`, `byOther` and `reason`.
15. **AC-15** The member hears about it (FR-5.10). New rules `time.entry-corrected-by-other` and
    `time.entry-deleted-by-other` (`when: { byOther: true }`, to the owner, except `by`) put
    "{by} changed your {project} hours for {day}" (or "removed") in the owner's bell, with the reason as the body, linking
    to `/time/my/{week}`. A change the owner makes to their own entry sends nothing.
16. **AC-16** Soft delete (FR-5.8). `time.entry` gets nullable `deleted_at timestamptz` and `deleted_by uuid`
    (migration `0003_entry_deleted_at.sql`, columns only; existing rows stay null). `delete_time_entry` sets them
    instead of removing the row, and bumps `revision`. Every read and guard skips rows with `deleted_at` set:
    `get_my_week`, `get_timesheet`, Team time, the week total and project list, the day-total guard, the submit
    payload, and `weekTotals`/`projectHours`/`visible()` in `contracts.ts`. No existing row has it set, so every
    existing read returns what it does today. Correcting or deleting a deleted entry gives the same error as a missing
    one. The row and its audit trail stay. **Unchanged:** the commit-draft undo keeps removing its entry as today
    (with 070's event).
17. **AC-17** The confirm card says what changes (FR-5.14). For a correction it names the project and day and shows
    each changed field before → after (e.g. "Fleet Tracker, Wed Oct 14: 10 h → 6 h"). For a delete it names the
    project, day and hours. For someone else's entry it also names the person and the reason. The tools take
    `project`, `day`, `hoursBefore` and `person` as inputs, and their `propose` check refuses a card whose values
    don't match the stored entry. The shared card lists every input, so the entry id still shows, after those
    fields. Tested on the pending card's title. The shared confirm-card component and other tools' cards don't
    change.
18. **AC-18** Tests (DB-backed, none skipped): an Admin and the owner both refused to correct or delete on an approved
    week, then allowed after `reopen_week`. A PM fixes a managed project's entry with a reason and the owner gets one
    notification. A PM is refused on an unmanaged project, on moving the entry to an unmanaged project, and without a
    reason. A soft-deleted entry is gone from every read and total but its row and audit remain. The card-text checks
    from AC-17. README updated.
19. **AC-19** Nothing existing changes: every test that exists on `main` and in 009 passes **unmodified**,
    including Admin `log_time` into an approved week (audited as `time.week.locked_change`), the commit-draft undo,
    and the shape of existing event payloads. Only tests for 070's own correct/delete locked-change cases are
    replaced, because AC-13 supersedes them. `git diff main -- modules/time/tests` shows no edits to pre-070 tests.

**Amendment 2, 2026-10-23.** It changes how cards look and when they are made; no service, event or rule changes, and
every refusal it adds at proposal time is one the service already makes at run time. Where AC-20 to AC-25 differ from
AC-17, they win.

20. **AC-20** A tool can declare an optional `card(viewer, input)` returning `{ title, lines: { label, value }[] }`.
    When it does, chat's pending card uses that title and shows those lines instead of the raw input list. The input
    is still stored and run as today. Tools without `card` look exactly as they do now, a card saved before this
    still renders, and a `card` that throws falls back to today's card. The buttons and the confirm flow don't change.
21. **AC-21** `correct_time_entry`'s card reads the stored entry: title "Fix {project}, {Wed Oct 14}"; one line per
    changed field, before → after ("Hours 2.7 h → 2 h", billable, note, project); for someone else's entry also
    "For {person}", "Reason {reason}" and "{first name} will be notified". No entry id or field names show.
22. **AC-22** `delete_time_entry`'s card: "Remove {project}, {Wed Oct 14}: {hours} h", plus the person, reason and
    notify lines as in AC-21.
23. **AC-23** `log_time`'s card: "Log {hours} h to {project}, {Wed Oct 14}", with billable and note lines when given.
24. **AC-24** `approve_week`, `reject_week`, `remind_week` and `reopen_week` cards name the person, the ISO week and
    its total ("Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"), plus the comment or reason when given.
25. **AC-25** No doomed card. The tool's `propose` check refuses, so no card is made and chat is told why, when:
    correct or delete targets a submitted or approved week (AC-13's messages); `log_time` targets a submitted week,
    or an approved week the caller may not change (009's rule, unchanged); approve or reject targets a week that
    isn't submitted; remind targets one that isn't draft or rejected; reopen targets a week that isn't approved, or
    the caller's own. The services keep every check they have.
26. **AC-26** Tests: the title and lines for each tool above (own and someone else's entry); each AC-25 refusal leaves
    no pending card and writes nothing; a tool without `card`, and a `card` that throws, give today's card. 070's
    AC-17 test on the old title text is replaced; every other existing test passes unmodified.
27. **AC-27** A clean live run with the real model, from reset local demo data, of the demo script: Tharushi fixes and
    removes an entry, Kasun's request on his submitted week gets a reply and no card, Maya fixes Tharushi's entry
    with a reason and Tharushi's bell shows it, Sahan's request on an approved week gets a reply and no card.
    Screenshots of each card in `shots/`.
28. **AC-28** The member's bell names the day as the cards do: "Maya Fernando changed your Fleet Tracker hours for
    Tue Oct 13" (and "removed"), not the ISO date. The `corrected` and `deleted` payloads gain an optional
    `dayLabel`; `day` and every other field stay as they are.

## Scope

- **In `modules/time/`:** `server/correct.ts` (new), `server/log.ts` (export the lock and day-total guards),
  `server/weeks.ts`, `server/reopen.ts`, `server/my.ts`, `server/sheet.ts`, `mcp.ts`, `chat.ts`, `contracts.ts`,
  `module.ts`, `suggestions.ts`, `ui/MyPage.tsx`, `ui/prompts.ts`, migration `0002_entry_revision.sql`, tests, README.
- **Outside (necessary):** `modules/reports/server/hours.ts` (two handlers, revision check, tombstone),
  `modules/reports/module.ts` (register them), and a migration `modules/reports/db/migrations/0002_hours_revision.sql`
  (`revision`, `deleted_at`). Without these, Reports keeps stale hours after every correction, which is AC-7.
  utilisation reads skip tombstones.
- **Not here:** draft or rejected hours in Reports (REP-B04 → 072); Finance (072); entity scope (071).
- **Amendment adds, in `modules/time/`:** `server/correct.ts` (its own approved-week refusal; `guardLock` and
  `log.ts` behave as before), `server/entry.ts` (PM/Admin scope), the `deleted_at is null` filter in
  `server/read.ts`, `server/weeks.ts`, `server/team.ts`, `server/guards.ts` (day total) and `contracts.ts`,
  `module.ts` (two new rules; new optional payload fields only), `mcp.ts`, `chat.ts`, `ui/MyPage.tsx`, migration
  `0003_entry_deleted_at.sql`, new tests, README. Nothing new outside `modules/time/`: Reports' tombstone already
  handles `time.entry.deleted`.
- **Not altered:** `log_time`, the commit-draft accept and undo, `reopen_week`, the 009 lock guard and its audit,
  the shared confirm card, existing event fields, existing notification rules.
- **Knock-on for unbuilt changes:** 071's migration becomes `0004`, 073's `0005`.
- **Amendment 2 adds:** `packages/core/src/module.ts` (the optional `card` on a tool), `packages/chat/src/engine.ts`
  (use it for the pending card), `apps/web/components/chat/Chat.tsx` (render its lines), and in `modules/time/`
  `mcp.ts`, `server/card.ts`, `server/guards.ts` (the lock rule as a pure check, `guardLock` unchanged in behaviour),
  `server/weeks.ts` (find a week without locking it, for the propose check), tests, README. Not here: the Sonnet
  0 requests-per-minute limit on the Anthropic workspace (a Console setting), and the outbox tick in local dev.

## Decisions

Approved by the product owner, 2026-10-22 ("approve 070, go with your recommended decisions").

- **D1 What can be corrected:** hours, billable, note and project, not the day. Allowing the day to change would let
  an entry move weeks, which mixes two weeks' locks.
- **D2 Reports ordering:** revision plus tombstone in Reports (above), not a re-read of Time per event.
- **D3 Approved weeks lock fully for corrections and deletes** (product owner, 2026-10-22): no Admin can correct or
  delete an entry in an approved week; reopen with a reason is the only path (FR-4.6, FR-5.18). The product owner
  also asked that no existing feature change, so 009's Admin `log_time` into an approved week stays as it is. Locking
  that too would be its own change.
- **D4 Who fixes someone else's entry** (product owner, 2026-10-22, FR-5.10): a PM on the entry's project, or an
  Admin, with a reason; the member is notified.
- **D5 Soft delete** (product owner, 2026-10-22, FR-5.8): `deleted_at` on the row; the audit trail and Reports'
  tombstone are unchanged.
- **D6 Confirm card** (product owner, 2026-10-22, FR-5.14): before → after for each changed field.

## Tasks

<!-- UI first, then backend, then integration. Week writes keep the 009 lock guard; correct and delete
     share it and the 24 h day total with logEntry. Reports applies an event only when its revision is newer. -->

- [x] `T1` — My timesheet as in the mock: a "Fix these hours" `AskButton` per project row (row pinned, prompt naming the week and project), shown for draft and rejected weeks, alongside the existing row pin and the sent-back comment; chat-first test covers it (AC-5 UI)
  Files: modules/time/ui/MyPage.tsx, modules/time/ui/prompts.ts, modules/time/tests/chat-first.test.ts
- [x] `T2` — Backend: the `revision` migration; `time.entry.correct` and `time.entry.delete` services reusing the lock guard and day total; `time.entry.corrected`/`deleted` events, `revision` on `logged`, payloads declared; reopen refuses your own week; writes need an explicit week; `findWeek` authorises before it locks, with one error for missing and out-of-scope weeks and no namesake emails (AC-1–AC-4, AC-8–AC-10)
  Files: modules/time/db/migrations/0002_entry_revision.sql, modules/time/server/correct.ts, modules/time/server/log.ts, modules/time/server/weeks.ts, modules/time/server/decide.ts, modules/time/server/submit.ts, modules/time/server/reopen.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/corrections.test.ts, modules/time/tests/week-guards.test.ts
  Depends: T1
- [x] `T3` — Tools and chat: `correct_time_entry` and `delete_time_entry`, the `time.correct`/`time.delete` intents, entry ids on `get_my_week` and `get_timesheet`, required `week` on write tools; undo of a commit draft emits `time.entry.deleted` (AC-5, AC-6, AC-9)
  Files: modules/time/mcp.ts, modules/time/chat.ts, modules/time/server/my.ts, modules/time/server/sheet.ts, modules/time/suggestions.ts, modules/time/tests/mcp.test.ts, modules/time/tests/contracts.test.ts, modules/time/tests/commit-draft-008.test.ts
  Depends: T2
- [x] `T4` — Reports: `revision` and `deleted_at` on `logged_hours`, corrected and deleted handlers applying only newer revisions, a late `logged` never reviving a tombstone, utilisation skipping tombstones (AC-7)
  Files: modules/reports/db/migrations/0002_hours_revision.sql, modules/reports/server/hours.ts, modules/reports/server/inputs.ts, modules/reports/module.ts, modules/reports/tests/hours-sync.test.ts
  Depends: T2
- [x] `T5` — Integration through the outbox: log → submit → reject → correct/delete → resubmit with totals and Reports; TIM-T01 undo; out-of-order and retried events; TIM-T04, TIM-T05; README (AC-11, AC-12)
  Files: modules/time/tests/corrections-flow.test.ts, modules/time/README.md
  Depends: T3, T4

<!-- Amendment (AC-13–AC-19). Additive only: log_time, guardLock, the commit-draft accept/undo and pre-070 tests stay as they are. -->

- [x] `T6` — Team time: a "Fix hours" `AskButton` on each draft or rejected row the viewer can approve (row pinned, prompt naming the person and week id and asking for a reason). My timesheet keeps no button on approved weeks; the chat-first test covers both (AC-13 UI, AC-14 UI)
  Files: modules/time/ui/Timesheets.tsx, modules/time/ui/prompts.ts, modules/time/tests/chat-first.test.ts, modules/time/tests/prompts.test.ts
- [x] `T7` — Backend: migration `0003_entry_deleted_at.sql`; correct and delete refuse approved weeks for everyone with the reopen hint; PM (managed project, old and new) or Admin may act with a required reason; soft delete; `deleted_at is null` in every read, guard and contract; optional `by`/`byOther`/`reason` on the corrected and deleted payloads; the two `*-by-other` notification rules (AC-13–AC-16)
  Files: modules/time/db/migrations/0003_entry_deleted_at.sql, modules/time/server/correct.ts, modules/time/server/entry.ts, modules/time/server/guards.ts, modules/time/server/read.ts, modules/time/server/weeks.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/governance.test.ts
  Depends: T6
- [x] `T8` — Tools and chat: `reason` on `correct_time_entry` and `delete_time_entry`; their confirm cards say project, day, person and before → after, never the id; `get_timesheet` returns entry ids to whoever may fix that week (AC-14, AC-17)
  Files: modules/time/mcp.ts, modules/time/chat.ts, modules/time/server/sheet.ts, modules/time/tests/mcp.test.ts
  Depends: T7
- [x] `T9` — Integration: replace 070's own locked-change correct/delete tests; PM fix → outbox → one bell item for the owner; soft-deleted entry gone from totals and Reports; pre-070 tests unmodified (`git diff main -- modules/time/tests`); README (AC-18, AC-19)
  Files: modules/time/tests/corrections.test.ts, modules/time/tests/corrections-flow.test.ts, modules/time/README.md
  Depends: T7, T8

<!-- Amendment 2 (AC-20–AC-27). Cards and proposal-time checks only: services, events and rules stay as they are. -->

- [x] `T10` — Chat panel: a pending card with `lines` shows its title and labelled lines instead of the raw input list; one without them renders as today (AC-20 UI)
  Files: apps/web/components/chat/Chat.tsx, packages/chat/src/engine.ts
- [x] `T11` — Shared: optional `card(viewer, input)` on a tool; the chat engine uses it for the pending card's title and lines, falling back to today's card when absent or when it throws; chat tests (AC-20, AC-26)
  Files: packages/core/src/module.ts, packages/chat/src/engine.ts, packages/chat/tests/card-hook.test.ts
  Depends: T10
- [x] `T12` — Time: cards for correct, delete, log, approve, reject, remind and reopen; propose checks refusing doomed cards, reusing the lock rule as a pure check and a non-locking week lookup; tests, replacing 070's AC-17 title test (AC-21–AC-26)
  Files: modules/time/mcp.ts, modules/time/server/card.ts, modules/time/server/guards.ts, modules/time/server/weeks.ts, modules/time/tests/cards.test.ts, modules/time/tests/mcp.test.ts
  Depends: T11
- [x] `T13` — Integration: README; reset local demo data; live run of the demo script with the real model; screenshots of each card (AC-27)
  Files: modules/time/README.md, .specclaw/changes/070-time-entry-corrections/shots/
  Depends: T12
- [x] `T14` — Bell titles name the day as "Tue Oct 13": optional `dayLabel` on the corrected and deleted payloads, used by the two by-other rules (AC-28)
  Files: modules/time/week.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/server/correct.ts, modules/time/server/entry-card.ts, modules/time/tests/corrections-flow.test.ts
  Depends: T13

## Verify

**Verdict:** PASS

**Amendment 2, verified 2026-10-23** on the working tree at `269313b` plus the uncommitted amendment (Windows 11). AC-20 to AC-27 pass. The two specclaw gates don't run clean on this host, as before; the product owner chose, on 2026-10-23, to record PASS with them noted.

- AC-20: pass — `packages/chat/tests/card-hook.test.ts` AC20: one turn proposes three tools; the one with `card` gets its title and lines, the one without and the one whose `card` throws get today's "Save one thing: w-1, 2" card with no lines; the input is stored unchanged on all three. Chat 29/29, so existing cards are unchanged.
- AC-21: pass — `modules/time/tests/cards.test.ts` AC21 (own: "Fix Fleet Tracker, Mon Oct 12", Hours and Note before → after, no id); `mcp.test.ts` 070 AC17, replaced as AC-26 allows (someone else's: For, Hours, Reason, "Tharushi will be notified").
- AC-22: pass — cards.test.ts AC22: "Remove Fleet Tracker, {day}: {hours} h".
- AC-23: pass — cards.test.ts AC23: "Log 1.5 h to Fleet Tracker, Fri Oct 16" with Billable no and the note.
- AC-24: pass — cards.test.ts AC24: "Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"; "Send back …" with the Comment line.
- AC-25: pass — cards.test.ts AC25: Kasun's `log_time` and correction on his submitted week, Maya approving Tharushi's draft, reminding Kasun's submitted week and Sahan reopening it all make no card, and `time.entry` plus `core.audit_event` counts don't move. `guardLock` keeps its behaviour through `lockRefusal` (time 93/93, including 009's Admin `log_time` into an approved week).
- AC-26: pass — the tests above; the 070 AC17 test now reopens Tharushi's W42 first, because an earlier test in its file approves it, so the old test was asserting a card that could only fail. No other existing test changed.
- AC-27: pass — live run on `pnpm dev` with Claude Haiku 5.5 (the workspace's Sonnet 5.5 limit is 0 requests a minute), from local demo data reset to its seeded values: Tharushi's fix ("Fix Fleet Tracker, Wed Oct 14 · Hours 2.7 h → 2 h") and removal ("Remove Fleet Tracker, Mon Oct 12: 2.4 h") confirmed; Kasun's request ran `correct_time_entry`, got no card, and chat said to ask the approver to send the week back; Maya's fix for Tharushi (For, Hours, Reason, Notice) confirmed, and after the outbox tick Tharushi has one bell item and Reports holds 2.0 h, 1.5 h and the tombstone at revision 2; Maya's approval card read "Approve Nimal Silva's timesheet for 2026-W42 (31.5 h)"; Sahan's request on the approved week ran `correct_time_entry`, got no card, chat offered the reopen path, and the entry stayed 0.3 h at revision 1. Screenshots: `shots/amend2-fix-card.png`, `amend2-delete-card.png`, `amend2-submitted-no-card.png`, `amend2-pm-fix-card.png`, `amend2-approve-card.png`, `amend2-approved-no-card.png`; compared against `#070-amendment-2` in the mock.
- AC-28: pass — `corrections-flow.test.ts` AC15, through the outbox and notifications' workflow engine: Tharushi's one bell item now reads "Nimal Silva changed your Fleet Tracker hours for Fri Nov 13"; `dayLabel` is declared on both payloads and `day` is unchanged. Time 93/93, notifications 7/7, reports 7/7, `pnpm lint` exit 0 after the change.

Commands (`DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`): `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 93/93, `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8, `packages/chat` 29/29, `packages/mcp` 20/20; `apps/web/tests/tool-schemas.test.ts` 1/1; `packages/core` 157/158, the one failure being `ac5-adapters` listing 60 pre-existing files with Windows path separators (none touched here). `pnpm lint` exit 0; `check-graph --root` only the known R7 fixture. `pnpm turbo run build --filter=./apps/web` exit 0. Not run: the time and chat Playwright e2e (the setup-path issue on Windows noted below); the live run covers the card screens.

Gates: `specclaw-preset-check .` exit 1 (repo-wide hits as before; the new files are under 80 lines: `server/card.ts` 50, `server/entry-card.ts` 56, `server/week-card.ts` 45, `tests/cards.test.ts` 70, `packages/chat/tests/card-hook.test.ts` 56). `specclaw-quality-scan .` not_run ("Argument list too long" in its jq step). Quality: not_run. Review: specclaw-review not installed.

Re-verified after the 2026-10-22 amendment (AC-13 to AC-19), working tree on `specclaw/070-time-entry-corrections` at `e67af2d` plus the uncommitted amendment. Every AC passes. The two specclaw gates don't run clean on this Windows host (see Gates); the product owner chose again, on 2026-10-22, to record PASS with them noted.

- AC-1: pass — `modules/time/tests/corrections.test.ts` AC1: the owner corrects a draft entry to the day's exact 24 h and is refused 0.05 h more; 0, 0.07 and 24.05 h and an empty change are invalid; project and billable change; someone out of scope is refused; Kasun's submitted week is refused. Once approved, Kasun and Sahan (Admin) are both refused with the reopen hint (AC-13 supersedes the locked-change path for corrections).
- AC-2: pass — corrections.test.ts AC2: a delete by someone out of scope (Kasun) is refused, the owner's delete goes through, and a second delete of the same id gives the same out-of-scope error.
- AC-3: pass — corrections.test.ts AC3: `time.entry.corrected` (revision 2, `before.hours`, `lockedChange: false`) then `time.entry.deleted` (revision 3) in `core.event`; the `time.entry.correct` audit row has before and after. Payloads declared in `module.ts`; `logged` carries `revision: 1`.
- AC-4: pass — corrections.test.ts AC4: a trigger fails the event insert after the update; entry (hours, revision 1), audit log and outbox are unchanged.
- AC-5: pass — `mcp.test.ts` "070 AC5": `get_timesheet` returns the row's entries with ids; `correct_time_entry` from the model becomes a pending card, writes nothing until confirmed, then revision 2, audited `source: chat`. `time.correct`/`time.delete` intents listed (`contracts.test.ts`). e2e `time.spec.ts` "070 AC5": the row's "Fix these hours" opens chat with "Fleet Tracker, 2026-W42" pinned and the prompt filled, axe clean; a submitted week has no button.
- AC-6: pass — `commit-draft-008.test.ts`: undo leaves `time.entry.deleted` (revision 2) for the entry; `corrections-flow.test.ts` (TIM-T01): accept → outbox → one live `logged_hours` row; undo → outbox → none.
- AC-7: pass — `modules/reports/tests/hours-sync.test.ts`: through the outbox, utilisation goes 4 h → 2.5 h → person gone (tombstone, revision 3); deleted-before-logged stays deleted; corrections delivered as revision 3, 2, 3 keep revision 3.
- AC-8: pass — `week-guards.test.ts` AC8: Maya can't reopen her own approved W43 ("your own week"); Sahan can.
- AC-9: pass — week-guards.test.ts AC9: `submit_week` with no week, and approve/remind/reopen naming a person without a week, refuse with "say which ISO week"; `mcp.test.ts` "070 AC9" refuses the same through MCP. Read tools still default to the latest week.
- AC-10: pass — week-guards.test.ts AC10: a random week id and Ayesha's week give Nimal the identical error; with another transaction holding Ayesha's row `for update`, Nimal's approve fails at once (no wait on the lock); the namesake error has no `@`.
- AC-11: pass — `corrections-flow.test.ts`: log 8 h + 7.5 h → submit → reject → correct to 6 h and delete → resubmit gives `hours: 6` in the result, 6 h in `weekTotals`, and one live 6 h row in Reports; TIM-T01 as in AC-6; TIM-T04 23.95 + 0.05 = 24 h accepted, one more 0.05 h refused, 0.07/0/24.05 invalid; TIM-T05 in `contracts.test.ts` (`isoWeekOf(2025-12-29)` = `2026-W01`). Unauthorised, submitted, approved and out-of-order cases are in AC-1, AC-2 and AC-7. No required test skipped.
- AC-12: pass — `modules/time/README.md` (tools, events, rules) and `modules/reports/README.md` updated; time 82/82 and reports 7/7 with DB tests running; `check-graph --root` has only the Windows false positive below.
- AC-13: pass — `governance.test.ts` AC13: once Kasun's W42 is approved, Kasun and Sahan (Admin) are both refused correct and delete with "approved and locked; reopen it with a reason (reopen_week)", and no `time.week.locked_change` row is added; after `reopen_week` the owner's correction goes through. My timesheet already hides "Fix these hours" outside draft and rejected (e2e 070 AC5). `approvals.test.ts` still shows Sahan logging into an approved week, audited as `time.week.locked_change` (unchanged).
- AC-14: pass — governance.test.ts AC14: Nimal (PM of Fleet Tracker) without a reason gets "invalid input: reason"; moving the entry to HR Insights (not his project) gets the out-of-scope error; Kasun is refused; Nimal with a reason succeeds; the event has `by`, `byOther: true`, the `reason`, `projectName` and `week`, and the audit row's `after` has the reason; Sahan (Admin) deletes with a reason. UI: Team time shows "Fix hours" on draft and rejected rows the viewer can approve (`prompts.test.ts` AC14, screenshot `shots/app-team.png`); `get_timesheet` gives that viewer the entry ids (`mcp.test.ts` 070 AC17).
- AC-15: pass — `corrections-flow.test.ts` AC15, through the outbox and notifications' workflow engine: Nimal's fix gives Tharushi exactly one bell item, "Nimal Silva changed your Fleet Tracker hours for 2026-11-13", body "Left at 4 on Friday", link `/time/my/2026-W46`; her own correction and delete send nothing; Reports holds the corrected 7 h.
- AC-16: pass — governance.test.ts AC16: after a delete, `weekTotals` and My timesheet drop the entry's hours, `entries` no longer lists it, the row is still there with `deleted_at` and `deleted_by` set, and correcting it gives the out-of-scope error. Migration `0003_entry_deleted_at.sql` adds nullable columns only. corrections-flow AC11 (correct and delete, then resubmit) still totals 6 h in Time and Reports.
- AC-17: pass — mcp.test.ts 070 AC17: a card whose `hoursBefore` doesn't match the entry isn't made (no pending); the matching card's title reads "Fix one time entry: Fleet Tracker, <day>, Tharushi Wijesinghe, <before>, 0.25, On leave that afternoon, <id>". The id still shows, after the named fields, because the shared card lists every input (AC-17 text records this). The shared card component is untouched.
- AC-18: pass — the tests listed under AC-13 to AC-17; time README "Corrections (070)" and "Approval rules" updated.
- AC-19: pass — `git diff main -- modules/time/tests modules/reports/tests`: the amendment changed no pre-070 test. In files that existed on `main`, its only edits are an import line in `prompts.test.ts` plus a new AC14 test, and the 070-only AC5 and new AC17 tests in `mcp.test.ts`. (070's original T3 had already widened the tool and intent list in `contracts.test.ts`.) Every pre-070 suite passes unmodified, including Admin `log_time` into an approved week and the commit-draft undo.

Commands (`DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`, `amax-dev-postgres`; Windows 11):
- `vitest run --config ../../vitest.config.ts --dir .` in `modules/time` 88/88 (14 files), `modules/reports` 7/7, `modules/notifications` 7/7, `modules/finance` 8/8, `modules/payroll` 8/8; `apps/web/tests/tool-schemas.test.ts` 1/1.
- `pnpm lint` exit 0 (35/35). Its graph step reports "0 modules" on Windows; `node scripts/check-graph.mjs --root <repo>` shows only the known R7 fixture false positive (`packages/testing/boundaries/r7-provider-sdk`).
- `pnpm turbo run build --filter=./apps/web` exit 0.
- Time e2e through a scratch config that only quotes the setup paths as `file://` URLs: 3/3 (009 AC3 Team week vs mock ≤ 2 % with the new button, 070 AC5, 009 AC2/054 AC5), axe clean.
- Not rerun: the whole-repo `turbo run test`. The amendment touches only `modules/time`, and its consumers' suites (reports, notifications, finance, payroll) were run above.

Gates:
- `specclaw-preset-check .` exit 1: repo-wide `comment` and `max_lines` hits as in 068 and 070's first verify. In the amendment's files, the new hits are short `070 AC-n` comments in the modules' existing style, plus `contracts.ts` going 103 → 104 lines (over 80 before 070). The new files (`server/card.ts` 40, `tests/governance.test.ts` 67) and the edited ones stay under 80.
- `specclaw-quality-scan .` didn't complete: its jq step fails with "Argument list too long" on this host. Quality: not_run.

Screenshots: `shots/app-team.png` (Team time W42 as Maya: "Fix hours" beside Remind on the two draft rows, none on submitted rows), `shots/app-team-chat.png` (Fix hours → chat with "Tharushi Wijesinghe, 2026-W42" pinned and "… (week id …). Reason: " filled in), `shots/app-team-dark.png`, `shots/mock.png` (`#070-time-entry-corrections` with the amendment cards); earlier `shots/app.png`, `app-dark.png`, `app-chat.png` (My timesheet). Compared against the mock: the same Ask amax hand-off with the record pinned and no edit fields. The mock's before → after card is rendered by the shared card as listed fields (hoursBefore, hours) rather than struck-through text.

Fixes after verify (2026-10-22, found on the dev server):
- Team time: Remind, Fix hours and the row pin ran into each other; the cell's buttons are now a spaced flex row (`.time .row-actions`). Checked on the dev server as Maya, in light and dark: no overlap, 8 px gaps.
- Chat: the row's **+** after "Fix these hours" kept the unedited fix prompt, because only a pin for a *different* record cleared it. A bare pin now drops an unedited Ask amax prompt and keeps the row pin; text the person typed stays. `apps/web/components/chat/Chat.tsx`; the time e2e 070 AC5 now presses the row's + and expects an empty message with the row still pinned. Time e2e 3/3 after a rebuild. The web app's chat and pins e2e couldn't be run on their own here (they depend on the `amx` setup project for sign-in and the KMS key).
