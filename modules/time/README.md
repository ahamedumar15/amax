# time (change 009)

Timesheets: hours logged by people and by agents against delivery projects, ISO weeks submitted for approval, approved through the manager or project chain, and locked once approved.

- **Owner:** `/modules/time/` in `.github/CODEOWNERS`
- **Screens:** `/time` and `/time/w/:week` (Team time), `/time/my` and `/time/my/:week` (My timesheet). Weeks are ISO keys such as `2026-W42`.
- **Contracts** (`contracts.ts`): `weekTotals`, `projectHours`, ISO week helpers (`isoWeekOf`, `weekStart`, `workDays`, `shiftWeek`, `weekKey`, `parseWeekKey`), `EVENTS`, `WEEK_STATUSES` and the event payload types. Version 1.
- **Events:** `time.entry.logged`, `time.week.submitted`, `time.week.approved`, `time.week.rejected`, `time.week.reopened`, `time.week.reminded` (reminders reach people through notification rules, never sent directly).
- **MCP tools** (`mcp.ts`): read `get_team_week`, `get_my_week`; write `log_time`, `submit_week`, `approve_week`, `reject_week`, `remind_week`, `reopen_week`. Time logged over MCP is agent time.
- **Chat intents** (`chat.ts`): log time.
- **Approval rules:** you never approve your own week. Admin approves any week; a manager approves the weeks of their reports (`viewer.reports`, filled by hr when it's installed); a project manager approves weeks with time on a project they manage. Reject needs a comment. Approved weeks are locked: changing one needs Admin, is audited as `time.week.locked_change`, and `reopen_week` takes a reason.
- **Depends on:** delivery (projects, managed-project scope). **Integrates with:** hr (reporting lines; without it only the project chain applies), leave (not wired yet; until it is, a week carries a free-text note such as "Casual leave Fri").
- **Allocated hours** on the screen are 40 h per person until allocations (010) publishes capacity.
- **Data:** `time.entry`, `time.week`, `time.approval` (RLS on `tenant_id`); retention entries in `module.ts`.
- **Tests:** `pnpm --filter @amax/time test` (DB tests need `DATABASE_MIGRATE_URL`); screen e2e: `pnpm --filter @amax/time e2e` after `pnpm --filter @amax/web build`.
