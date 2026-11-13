# Agentic time from the sync, and a manual-proposal button that says what it does

**Change:** 104-agentic-time-from-sync · **Created:** 2026-11-13 · **Review:** change

## Problem

Work an agent builds in a repo reaches amax through the specclaw sync, which carries phase, tasks, PR and dates but no
time. So a synced proposal reads 0 h and the Time module shows nothing for it. The one path that drafts hours from git
(008 AC-3) needs a push webhook and a commit message with `Time: 1.5h` and `KEY T3 done`, which specclaw commits never use.
Separately, the all-projects Proposals page calls manual creation "Add by hand" (094 AC-8), though the button opens chat.

Agreed with the product owner on 2026-11-13: hours are estimated from commit timestamps, drafted as a suggestion the
person accepts, corrected in chat after accepting, and a proposal also shows hours that wait for approval.

## Mock Delta

What changes on screen, and where to see it: [`104-agentic-time-from-sync`](../../mock/index.html#104-agentic-time-from-sync)

The all-projects Proposals header keeps its repo line; the secondary button reads "New proposal in chat". A person's
timesheet shows a suggestion "Add 1.5 h on amax for 12 Nov", from 6 commits on AMX-102, with accept and dismiss. A
proposal's Time card shows the approved figure and, under it, "1.5 h waiting for approval". Its history says the hours
were drafted from the repo.

## Acceptance Criteria

**The button**

1. **AC-1** On the all-projects Proposals page, the secondary manual-creation button reads "New proposal in chat" (tooltip
   "Opens chat to add one"). When it shows, and what it opens (chat's create mode, intent `delivery.new-proposal`), are as
   in 094 AC-8. No "Add by hand" text is left in the app or its tests.

**What the sync sends**

2. **AC-2** The repo reader (`read-specclaw.mjs`, used by the plugin and CI) sends, per change, the commits named for it
   (`specclaw(<NNN-slug>)` or `[specclaw] <NNN-slug>` subject; merges left out): id, author email and login, and commit time.
   A sync from an older plugin that sends none still works and drafts nothing.

**The estimate**

3. **AC-3** One pure function turns a person's commits on one proposal on one day (UTC, the commit's date) into hours:
   commits less than 90 minutes apart are one session; a session counts from 30 minutes before its first commit to its
   last (a lone commit is 0.5 h); the day's sessions are summed, rounded to a quarter hour, and capped at 8 h. A table
   test covers one commit, one session, two sessions, the cap and a session that crosses midnight (split by day).

**Drafting**

4. **AC-4** For each person, proposal and day with an estimate, amax creates a timesheet suggestion for that person
   ("Add 1.5 h on amax for 12 Nov", detail "From 6 commits on AMX-102. Accept to add it to your timesheet as a draft.").
   Nothing is logged until they accept. Accepting logs a billable entry, source agent, named for the proposal, in their
   draft week; undo removes it. This reuses the commit-draft suggestion (008 AC-3), including its weekend wording.
5. **AC-5** The person is the commit's author, found by their linked git identity under the same rule as push ingestion
   (verified email for the identity). It is never whoever ran the sync. A commit with no linked author drafts nothing, and
   the sync's result counts those commits.
6. **AC-6** Drafting happens only when commit time is on for the author's legal entity (008 AC-6), and only for days on or
   after the day it was switched on. With it off, the sync behaves exactly as today.
7. **AC-7** A day is drafted only once it has ended (UTC), so its estimate is final. There is one draft per person,
   proposal and day: a second sync, or the plugin and CI both syncing, drafts nothing more. A commit whose hours already
   came through the push webhook's `Time:` line is left out of the estimate.
8. **AC-8** No sync, agent or job logs, submits or approves time. The only writes are the suggestion and, on the
   person's accept, their own entry (table test over the sync path's audit rows).

**Hours on the proposal**

9. **AC-9** A proposal's Time card shows, under the approved figure, "N h waiting for approval": hours on live entries
   named for it in weeks not yet approved. The line is absent at 0. It is a total with no names, and the estimate band
   still counts approved hours only.
10. **AC-10** The waiting total reaches Delivery the way approved hours do (081 AC-4): Time hands totals to a Delivery
    service under its job; Delivery reads no Time table. It moves when an entry named for a proposal is logged, corrected
    or deleted, and when a week is submitted, approved, rejected or reopened.
11. **AC-11** The proposal's history says "Drafted 1.5 h for 12 Nov from the repo, waiting to be accepted" when a draft is
    made, visible under the same rule as its other time lines (081 AC-28).

**Standards**

12. **AC-12** The read tools that return a proposal return its waiting hours, so chat and MCP see what the page shows. The
    Time card stays pinnable and its pin resolves to the proposal with both figures.
13. **AC-13** `docs/` and the plugin's README say how hours are estimated, that consent gates them, and that the person
    accepts. `npm run check:graph` passes; the 008, 081 and 089–094 suites stay green.

## Tasks

- [ ] `T1` — "New proposal in chat" label and tooltip; the Time card's "N h waiting for approval" line, absent at 0, band unchanged (AC-1, AC-9 screen)
  Files: modules/delivery/ui/NewProposalButton.tsx, modules/delivery/ui/proposals-action.ts, modules/delivery/ui/ProposalPage.tsx, modules/delivery/ui/band.ts, modules/delivery/tests/proposals-action-094.test.ts, apps/mock/public/mock/index.html
- [ ] `T2` — The reader sends each change's commits (id, author email, time; merges and unnamed commits left out); older payloads without them still parse (AC-2)
  Files: modules/delivery/sync/authors.ts, modules/delivery/sync/specclaw.ts, plugins/amax/scripts/src/read-specclaw.ts, plugins/amax/scripts/read-specclaw.mjs, plugins/amax/tests/reader.test.ts, scripts/specclaw-sync-ci.mjs, packages/testing/tests/specclaw-sync-ci.test.ts
- [ ] `T3` — Pure session estimate per person, proposal and UTC day: 90-minute gap, 30-minute lead-in, quarter-hour rounding, 8 h cap, split at midnight; table test (AC-3)
  Files: modules/delivery/sync/estimate.ts, modules/delivery/tests/estimate-104.test.ts
- [ ] `T4` — Drafting from a push: authors by linked git identity (provider from the project's repo host), consent on and day on or after `notified_at`, only ended days, one draft per person, proposal and day, webhook `Time:` commits left out; suggestion wording "from N commits on KEY"; sync result counts drafted and unlinked (AC-4, AC-5, AC-6, AC-7, AC-8)
  Files: modules/delivery/server/push.ts, modules/delivery/server/commit-time.ts, modules/delivery/server/ingest.ts, modules/delivery/db/migrations/0022_commit_draft_day.sql, modules/delivery/contracts.ts, modules/delivery/module.ts, modules/time/suggestions.ts, modules/delivery/tests/sync-time-104.test.ts, modules/time/tests/commit-draft-008.test.ts
  Depends: T2, T3
- [ ] `T5` — Waiting hours: Time hands per-proposal totals of live entries in unapproved weeks to Delivery's hours service under its job; refreshed on entry log, correct, delete and on week submit, approve, reject, reopen; `ProposalRow`, `get_proposal` and `list_proposals` return them (AC-9 data, AC-10, AC-12)
  Files: modules/delivery/db/migrations/0023_proposal_waiting_hours.sql, modules/delivery/server/proposal-hours.ts, modules/time/server/proposal-hours.ts, modules/delivery/server/queries.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/mcp.ts, modules/time/tests/proposal-hours-104.test.ts
  Depends: T1
- [ ] `T6` — Proposal history line "Drafted 1.5 h for 12 Nov from the repo, waiting to be accepted", from Delivery's own audit of the draft, visible under 081 AC-28's rule (AC-11)
  Files: modules/delivery/server/proposal-detail.ts, modules/delivery/tests/proposal-detail.test.ts
  Depends: T4
- [ ] `T7` — Docs and the full check: how hours are estimated, consent and accept; `check:graph`; the 008, 081 and 089–094 suites green (AC-13)
  Files: modules/delivery/README.md, modules/time/README.md, plugins/amax/README.md, plugins/amax/skills/sync-specclaw/SKILL.md
  Depends: T4, T5, T6

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
