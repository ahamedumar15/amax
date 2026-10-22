# Time entry corrections: fix or remove hours, and keep Reports in step

**Change:** 070-time-entry-corrections · **Created:** 2026-10-22

## Problem

Time entries are insert-only (audit TIM-B01). A rejected week can only gain hours, so "you logged 8 h, it was 6 h"
can't be fixed, and hours never go down. Undoing a commit-draft suggestion deletes the entry without an event
(TIM-B02), so Reports keeps hours that no longer exist. On the way: an Admin can reopen their own approved week
(TIM-B06); writes without a week act on the UTC current week (TIM-B10); and `findWeek` tells "doesn't exist" apart
from "not yours", and locks rows before checking the caller (TIM-B12). Evidence is in [`audit.md`](audit.md).

## Mock Delta

What changes on screen, and where to see it: [`070-time-entry-corrections`](../../mock/index.html#070-time-entry-corrections)

My timesheet (009) gets, per project row, an **Ask amax** "Fix these hours" button with that row pinned. Chat lists the
row's entries and proposes `correct_time_entry` or `delete_time_entry`, which the person confirms. A rejected week shows
the approver's comment above the rows with the same button. There are no edit fields.

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

## Scope

- **In `modules/time/`:** `server/correct.ts` (new), `server/log.ts` (export the lock and day-total guards),
  `server/weeks.ts`, `server/reopen.ts`, `server/my.ts`, `server/sheet.ts`, `mcp.ts`, `chat.ts`, `contracts.ts`,
  `module.ts`, `suggestions.ts`, `ui/MyPage.tsx`, `ui/prompts.ts`, migration `0002_entry_revision.sql`, tests, README.
- **Outside (necessary):** `modules/reports/server/hours.ts` (two handlers, revision check, tombstone),
  `modules/reports/module.ts` (register them), and a migration `modules/reports/db/migrations/0002_hours_revision.sql`
  (`revision`, `deleted_at`). Without these, Reports keeps stale hours after every correction, which is AC-7.
  utilisation reads skip tombstones.
- **Not here:** draft or rejected hours in Reports (REP-B04 → 072); Finance (072); entity scope (071).

## Decisions

Approved by the product owner, 2026-10-22 ("approve 070, go with your recommended decisions").

- **D1 What can be corrected:** hours, billable, note and project, not the day. Allowing the day to change would let
  an entry move weeks, which mixes two weeks' locks.
- **D2 Reports ordering:** revision plus tombstone in Reports (above), not a re-read of Time per event.

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

## Verify

**Verdict:** PASS

Every AC passes. The two specclaw gates don't run clean on this Windows host (see Gates); the product owner chose to record PASS with them noted, as in 068 (2026-10-22).

- AC-1: pass — `modules/time/tests/corrections.test.ts` AC1: owner corrects a draft entry to the day's exact 24 h and refuses 0.05 h more; 0, 0.07 and 24.05 h and an empty change are invalid; project and billable change; a teammate is out of scope; Kasun's submitted week refuses, then once approved refuses Kasun and lets Sahan change it with one more `time.week.locked_change` audit row.
- AC-2: pass — corrections.test.ts AC2: delete by a teammate refused, by the owner done, and a second delete of the same id gives the same out-of-scope error.
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

Commands (`specclaw/070-time-entry-corrections` at `dc277e4`, `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`, the `amax-dev-postgres` container; Windows 11):
- `pnpm lint` exit 0 (35/35 tsc tasks). Its `check-graph` step reports "0 modules" on Windows, so `node scripts/check-graph.mjs --root <repo>` was run instead: one R7 hit in `packages/testing/boundaries/r7-provider-sdk`, the deliberately broken fixture, which `rules.mjs` skips by a `/`-separated prefix that never matches a Windows `relative()` path. No real violation.
- `pnpm turbo run build` exit 0.
- `pnpm turbo run test --force --concurrency=1 --continue`: 31/35 packages green; 1,371 passed, 6 failed, 6 skipped (workflows' Temporal suite, `AMAX_TEMPORAL_TESTS` unset). The 6 failures are in packages 070 doesn't touch (`git diff b257a6d..HEAD -- packages modules/delivery` is empty) and are Windows-only: core `ac5-adapters` (backslash paths vs a `/` allowlist), testing `ac7-config` ×3 (symlink EPERM), delivery `releases` (absolute Windows path, failing on `main` before 070 too), workflows `kill` (POSIX signals). With `--concurrency=2` vitest's shared cache hit EPERM on Windows and no package ran.
- Time e2e: `npx playwright test` through a scratch config that only quotes the setup paths as `file://` URLs (the repo config's bare `--import C:\Personal Projects\…` fails on Windows): 3 passed (009 AC3 mock diff ≤ 2 %, 070 AC5, 009 AC2/054 AC5).
- `modules/time`, `modules/reports`, `finance`, `payroll`, `notifications`, `insights` suites and `apps/web/tests/tool-schemas.test.ts` (069) green with DB tests running.

Gates:
- `specclaw-preset-check .` exit 1: 2,491 repo-wide hits (2,421 `comment`, 70 `max_lines`), as in 068. In 070's files the hits are the modules' existing commented style plus short `070 AC-n` notes in the same convention; the two `max_lines` files were already over 80 lines before 070 (`modules/time/contracts.ts` 98 → 103, `modules/time/tests/review.test.ts` 140 → 141).
- `specclaw-quality-scan . --gate` exit 2: "jq is required"; it also needs `lizard` (uvx) and `jscpd` (npx), none installed here. Quality: not_run.

Screenshots: `shots/app.png` (My timesheet, Tharushi's draft W42, light), `shots/app-dark.png`, `shots/app-chat.png` ("Fix these hours" → chat with the row pinned and the prompt filled), `shots/mock.png` (`#070-time-entry-corrections`). Compared against the mock: same per-row "Fix these hours" button beside the row pin and the same chat hand-off with no edit fields. The mock shows a rejected week; the fixture week is a draft, so the sent-back comment (existing 009 chip) isn't on the shot.

Notes:
- The build refreshes the tracked copy `apps/mock/public/mock/index.html` from `.specclaw/mock/index.html` (+192 lines: 068, 069 and 070–073 sections); it isn't part of 070 and is left unstaged.
- Playwright's Chromium headless shell (1248) was installed for the e2e run.
