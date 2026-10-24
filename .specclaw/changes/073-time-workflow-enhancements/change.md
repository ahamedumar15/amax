# Time workflow: weekend hours, daily and scheduled reminders, ThisWeek capacity, approval checks

**Change:** 073-time-workflow-enhancements · **Created:** 2026-10-22 · **Updated:** 2026-10-24 · **Builds on:** 070, 071, 072
(branch `specclaw/073-time-workflow-enhancements`, stacked on `specclaw/072-time-consumers-sync`)

## Problem

Only Monday to Friday can be logged, so weekend work and its overtime have no record (TIM-E02). Weekend commits become
suggestions that can never be accepted (TIM-B07). Reminders only happen when an approver presses Remind (TIM-E03). The
ThisWeek card assumes 40 h per person and has no pins on its project rows (TIM-B13). Evidence is in
[`../070-time-entry-corrections/audit.md`](../070-time-entry-corrections/audit.md).

**Update, 2026-10-24.** Rebased on 070 to 072 as built.
- **Migration number:** this change uses `0007`.
- **Reminder scope:** reminders follow 071's entity scope.
- **Reuse:** missing days and each person's local date come from 072's weekly utilisation.

The product owner moved the Team grid (FR-1) to its own change, 074. From the Time page requirements, 073 adds:
- **Reminders:**
  - Reminders are per week only, so nobody can be chased for a single missing day (FR-3.2).
  - A reminder carries no message (FR-3.3) and doesn't point to the day (FR-3.5).
  - Nothing runs on a daily schedule (FR-3.6).
  - Nobody sees who was last reminded, so the same person can be reminded again minutes later (FR-3.7).
- **Approvals:**
  - Submitting a week with missing working days gives no warning (FR-4.1).
  - "Approve all" also approves weeks that need a closer look: over 60 h, a day over 14 h, or missing days (FR-4.4).

## Mock Delta

What changes on screen, and where to see it: [`073-time-workflow-enhancements`](../../mock/index.html#073-time-workflow-enhancements)

- **My timesheet and Team time:**
  - **Sat** and **Sun** columns appear only for a week with weekend hours, marked "weekend".
  - A link from a day reminder marks that day's column ("Missing: Tue Oct 20").
- **ThisWeek:** reads "118.5 h of 176 h allocated" (from Allocations), and each project row has a pin. With no
  allocation data: "118.5 h logged · allocation unknown".
- **Team time rows:** show the last reminder ("Reminded 2 h ago by Maya Fernando").
- **Chat (approver), "Remind everyone who hasn't logged today":**
  - One card: "Remind 3 people to log Tue Oct 20", one line per person, and the message (default "Please update your
    hours for today.").
  - Anyone reminded in the last 4 hours is marked "reminded 1 h ago".
  - People on approved leave that day are left out.
- **Bell:**
  - "Log your hours for Tue Oct 20", with the message, linking to that day.
  - On Monday morning, local time: "Reminder: submit your timesheet for 2026-W42".
- **Chat (Admin):** "Remind people at 16:00 on working days who haven't logged" gives a settings card. A PM can switch
  it off for a project they manage.
- **Chat, submit:** the card warns "Missing: Fri Oct 16" and still submits.
- **Chat, approve all:** "Approve 3 timesheets (2 skipped: Kasun Dias, a day over 14 h; Dinesh Wickrama, missing
  Fri Oct 16)".

## Acceptance Criteria

**Weekend hours (TIM-E02, TIM-B07)**

1. **AC-1** `log_time` takes Saturday or Sunday only with `weekend: true`. Without it, the error says to confirm weekend
   work.
   - Weekend entries belong to the same ISO week, so they count everywhere the week's hours do: `weekTotals` (and so
     Payroll overtime), `projectHours`, approvals, the submit payload, Reports' hours, and 072's weekly utilisation.
   - They show as weekend days on My timesheet and Team time.
   - Validation, permissions, audit and events are the same as for weekday entries, and so are 071's rules.
   - Weekend days are never "missing".
2. **AC-2** A weekend commit drafts a suggestion that says "weekend". Accepting it logs with `weekend: true` (TIM-B07).

**Reminders (TIM-E03, FR-3)**

3. **AC-3** `remind_missing` (Team time, approvers; FR-3.2, FR-3.3, FR-3.5): for one working day (today or an earlier
   weekday), everyone the viewer is responsible for (D2) who has no live hours that day.
   - **Who's skipped:** anyone on approved leave that day, and anyone who has already logged.
   - **The card:** one card, "Remind {n} people to log {Tue Oct 20}", one line per person, and an optional message
     (default "Please update your hours for today.").
   - **On confirm:** each person gets `time.day.reminded`, and a result per person: `sent`, `skipped` (logged since,
     on leave, out of scope) or `failed`.
   - **The bell:** "Log your hours for {Tue Oct 20}", with the message as the body, linking to `/time/my/{week}?day={day}`.
     My timesheet marks that day's column.
   - **`remind_week`:** gains the same optional message (additive).
4. **AC-4** Every reminder is recorded and visible (FR-3.7, FR-3.10).
   - **What's stored:** each reminder (week or day, manual or automatic) in `time.reminder` (migration `0007`):
     sender, recipient, kind, week or day, message and time. Its delivery result is notifications' existing delivery
     record.
   - **Team time:** each row shows the last reminder ("Reminded 2 h ago by Maya Fernando").
   - **Repeat warning:** a reminder card for someone reminded in the last 4 hours adds "reminded {1 h} ago by {name}".
     The card is the confirmation; nothing is refused.
5. **AC-5** Automatic daily reminder (FR-3.6), off by default.
   - **Setting it:** an Admin sets `dailyReminderAt` (HH:MM) through 071's settings tools.
   - **What runs:** a schedule (workflows, `timezone: "entity"`) at that local time, Monday to Friday, reminds everyone
     in the entity with no hours that day and not on approved leave. Each reminder comes from
     `system:time.reminders` and is recorded as in AC-4.
   - **PM switch:** a PM can switch it off or on for a project they manage (`set_project_reminders`). Someone whose
     recent projects (time or allocation in the last 4 weeks) are all switched off isn't reminded.
   - **Retry-safe:** one automatic reminder per person and day (unique in `time.reminder`), so a retried slot sends
     nothing twice.
6. **AC-6** Weekly reminder (the original AC-3 to AC-5).
   - **What runs:** a schedule `time.draft-reminders` (Monday 09:00, entity local) reminds everyone whose previous ISO
     week is still draft or rejected with hours logged.
   - **Retry-safe:** one per week and slot, and a manual `remind_week` still works alongside it.
   - **Fails closed:** an entity with no time zone isn't reminded.
   - **TIM-T03:** `Asia/Colombo` and `Australia/Perth` each fire at their own 09:00.
7. **AC-7** No weekend reminders (FR-3.8). `remind_missing` refuses Saturday and Sunday, both schedules run Monday to
   Friday only, and approved leave is always skipped. Public holidays: see D5.

**ThisWeek (TIM-B13)**

8. **AC-8** ThisWeek's capacity and pins.
   - **Pins:** each project row has a `PinButton` that resolves through `get_team_week` to that project's hours.
   - **Capacity:** taken from Allocations' `personMonthTotals`: percent × each person's weekly target (072; 40 h unless
     set) × the week's working days ÷ 5, for each person on the card.
   - **No allocation data:** with Allocations not installed or not readable, the card says "allocation unknown"
     rather than assuming 40 h.

**Approval checks (FR-4.1, FR-4.4)**

9. **AC-9** Submitting with missing working days (FR-4.1).
   - **The card:** `submit_week`'s card adds "Missing: {Fri Oct 16}" for working days up to the person's local today
     (or the whole week, once it's over) that have no hours and no approved leave.
   - **The result:** submitting still works, and the result lists the missing days.
   - **Unchanged:** a week with no entries is still refused.
10. **AC-10** Anomalies stay out of "approve all" (FR-4.4).
    - **What's flagged:** a submitted week with over 60 h, a day over 14 h, or missing working days.
    - **`approve_weeks`:** skips it ("needs individual review: a day over 14 h").
    - **`approve_week`:** its card shows the same flag, and approving one at a time still works.
    - **`get_team_week`:** rows gain `anomalies` (additive).

**Tests and docs**

11. **AC-11** Tests (DB-backed, none skipped):
    - weekend logging and the weekend commit draft;
    - `remind_missing`: scope, leave and already-logged skips, the message, the 4-hour warning;
    - the reminder record and Team time's last-reminder line;
    - the automatic daily slot: on and off, a PM's project switch, retry-safe;
    - the weekly slot in two zones (TIM-T03);
    - no weekend reminders;
    - ThisWeek with and without Allocations;
    - the submit warning;
    - anomaly skips in `approve_weeks`;
    - axe on the weekend columns, light and dark.
12. **AC-12** A live run with the real model:
    - an approver reminds everyone who hasn't logged today;
    - an Admin turns on the 16:00 reminder;
    - Kasun submits a week with a missing day;
    - Maya approves all, with an anomaly skipped.

    README updated. `check:graph` passes, and the time e2e passes. Every existing test passes unmodified, except where
    D6 lists an intended change.

## Scope

- **In `modules/time/`:**
  - Server: `server/log.ts` (`weekend`), `week.ts`, `server/my.ts`, `server/team.ts`, a new `server/reminders.ts` and
    `server/schedules.ts`, `server/decide.ts` (message), `server/bulk.ts` and `bulk-card.ts` (anomalies),
    `server/submit.ts` and `week-card.ts` (missing days), `server/settings.ts` (`dailyReminderAt`).
  - Manifest and wiring: `suggestions.ts`, `mcp.ts`, `chat.ts`, `chat-suggestions.ts`, `module.ts` (schedules,
    rules, payloads).
  - UI: `ui/*` (weekend columns, marked day, last reminder, ThisWeek).
  - Migration `0007_reminders.sql`, tests, README.
- **Outside:** none. Allocations and Leave are read through their contracts; notifications delivers the new rule as it
  does the others.
- **Not here:**
  - The Team grid (FR-1: cell colours, summary strip, Utilisation column, filters, sort, day breakdown, totals row,
    week picker) is change **074**.
  - Slack or Teams reminders, and holiday awareness (D5).

## Decisions

Approved by the product owner, 2026-10-24 ("approve"): the recommended option of each, D1–D6. The Team grid (FR-1) is change 074.

- **D1 Weekend semantics.** *Recommended:* weekend hours are ordinary hours in the same ISO week. They count toward the
  40 h overtime threshold, utilisation and billing. Overtime *classification* (a weekend rate) stays out (TIM-N02).
- **D2 Who is expected to log**, for "remind all missing" and the daily reminder. People with no hours that day have no
  week row, so Time needs a list of who to expect. *Recommended:* active people who can log time and are, for the
  viewer:
  - their reports;
  - people with time or an allocation on a project they manage in the last 4 weeks;
  - for Admins and `time:team`, everyone in their legal entities.

  The daily schedule uses everyone in the entity with time or an allocation in the last 4 weeks.
- **D3 Capacity formula.** *Recommended:* percent × the person's weekly target × the week's working days ÷ 5.
- **D4 Times.** *Recommended:* the weekly reminder at Monday 09:00 for the week before, and the daily reminder off until
  an Admin sets a time.
- **D5 Public holidays.** Time can't see the holiday calendar; it's Reports' own table. *Recommended:* skip weekends
  and approved leave now, and add holidays when the calendar is shared through a contract (a small follow-up).
- **D6 Behaviour that changes** (the product owner's "no existing feature altered", as in 071 and 072):
  - `log_time`'s weekend refusal message now offers `weekend: true`.
  - `approve_weeks` (070) skips anomalous weeks.

  Everything else is additive: messages, records, schedules off by default, card warnings, `anomalies`.
  *Recommended:* accept both, listed under Verify.

## Tasks

<!-- UI first, then backend, then integration. Reminders go through one service per kind (week, day), each recorded in
     time.reminder; schedules follow compliance's pattern (`schedules` in the manifest, `timezone: "entity"`). Who is
     expected to log (D2) is one helper used by remind_missing and the daily slot. -->

- [ ] `T1` — Screens: Sat and Sun columns only for a week with weekend hours; the day a reminder links to marked "Missing"; the last-reminder line on Team time rows; ThisWeek capacity from Allocations and targets, with row pins (AC-1 UI, AC-3 UI, AC-4 UI, AC-8)
  Files: modules/time/ui/MyPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/ThisWeek.tsx, modules/time/ui/parts.tsx, modules/time/ui/time.css, modules/time/server/my.ts, modules/time/server/team.ts, modules/time/server/capacity.ts, modules/time/tests/screens-073.test.ts
- [ ] `T2` — Weekend hours: `weekend: true` through `log_time`, its card and chat; weekend days in `workDays`-based reads where hours exist; weekend commit drafts (AC-1, AC-2)
  Files: modules/time/server/guards.ts, modules/time/server/log.ts, modules/time/week.ts, modules/time/server/entry-card.ts, modules/time/mcp.ts, modules/time/chat.ts, modules/time/suggestions.ts, modules/time/tests/weekend.test.ts
  Depends: T1
- [ ] `T3` — Migration `0007_reminders.sql` (`time.reminder`, `daily_reminder_at`, `time.project_reminder`); `remind_missing` with the expected-people helper (D2), leave and logged skips, message, `time.day.reminded` and its rule; `remind_week` message; the reminder record; the 4-hour line on cards; weekends refused (AC-3, AC-4, AC-7)
  Files: modules/time/db/migrations/0007_reminders.sql, modules/time/server/expected.ts, modules/time/server/reminders.ts, modules/time/server/decide.ts, modules/time/server/bulk-card.ts, modules/time/mcp-reminders.ts, modules/time/mcp.ts, modules/time/contracts.ts, modules/time/module.ts, modules/time/tests/reminders.test.ts
  Depends: T1
- [ ] `T4` — Schedules: the daily reminder (`dailyReminderAt` in settings, PM `set_project_reminders`, one per person and day) and the weekly Monday reminder, both entity-zoned, weekdays only, retry-safe (AC-5, AC-6, AC-7)
  Files: modules/time/server/schedules.ts, modules/time/server/settings.ts, modules/time/server/rules.ts, modules/time/mcp-settings.ts, modules/time/module.ts, modules/time/tests/schedules.test.ts
  Depends: T3
- [ ] `T5` — Approval checks: missing days on the submit card and result; anomalies (over 60 h, a day over 14 h, missing days) on `get_team_week` rows, the approve card, and skipped by `approve_weeks` (AC-9, AC-10)
  Files: modules/time/server/anomalies.ts, modules/time/server/submit.ts, modules/time/server/week-card.ts, modules/time/server/bulk.ts, modules/time/server/bulk-card.ts, modules/time/server/team.ts, modules/time/tests/approval-checks.test.ts
  Depends: T1
- [ ] `T6` — Integration: full suites, time e2e with axe on the weekend columns (light and dark), live run with the real model, README, intended changes listed under Verify (AC-11, AC-12)
  Files: modules/time/tests/e2e/time.spec.ts, modules/time/README.md
  Depends: T2, T3, T4, T5

## Verify

<!-- Filled by verify. -->
