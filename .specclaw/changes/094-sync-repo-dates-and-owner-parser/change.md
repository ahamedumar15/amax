# The sync tells the repo's own story: its real dates, a sound Owner-line parser, and "Shipped to Prod" that means Prod

**Change:** 094-sync-repo-dates-and-owner-parser · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 093-agent-first-proposals (same branch, PR #113).

## Problem

Every synced proposal is dated by the sync, not by the repo. In the local demo all 90 AMX proposals were "created" on
2026-11-10 and all 472 tasks "done" that day, though each `change.md` has a `**Created:**` date, `state.json` times each
phase, and git knows the commit that ticked each task. The "Shipped to Prod per week" chart counts the repo's archived
history as shipped to Prod (62 in week 42). And the Owner-line parser escalated at the end of 093's review: a pattern
keeps missing forms (an address straight after the label; backing off to a shorter address). 093's follow-ups also
leave three minors.

## Mock Delta

What changes on screen, and where to see it: [`094-sync-repo-dates-and-owner-parser`](../../mock/index.html#094-sync-repo-dates-and-owner-parser)

A synced proposal's page shows the repo's dates: "Created 17 Oct" and history lines "Approved in the repo · 17 Oct",
"Verified in the repo · 18 Oct", "T3 done · 17 Oct". The Proposals page's "Shipped to Prod per week" counts only what a Prod
deployment released. The all-projects Proposals page leads with "Proposals come from your repos · write one with
/specclaw:propose"; manual creation is a plain "Add by hand" button there, and an agent-first project's Proposals tab
shows its repo line.

## Acceptance Criteria

1. **AC-1** A synced proposal's created date is the repo's: the `**Created:**` header, else `state.json`'s proposal time,
   else the commit that added its `change.md`. Set when amax first stores it; an existing proposal created by a sync gets it
   on its next sync. A hand-made proposal keeps its own.
2. **AC-2** A task the sync marks done is dated by the commit that ticked its box in `change.md` (the plugin, CI and the
   self-sync read it from git, as they read authors). A task closed by a commit message (`KEY Tn done`) or by a person
   keeps its own date and who closed it. Tasks a sync already closed with the sync's date are corrected on the next sync.
   When git can't tell (a shallow clone), the stored date stays.
3. **AC-3** A synced proposal's page shows the repo's phase times from `state.json` (approved, tasks planned, verified, PR
   raised, archived) as history lines marked "in the repo", next to amax's own events, in time order.
4. **AC-4** "Shipped to Prod per week" (and "Released this month", which it adds up to) counts only proposals a Prod
   deployment released (`deployment.released`, not voided); history from the repo's archive isn't counted.
5. **AC-5** The Owner line is parsed by tokens, not one pattern: the text after `**Owner:**` on that line is split on
   whitespace and `<>()[]`, quotes and markup are stripped from each token, and the first token that is a whole address
   (an anchored check) is the owner. Every form from 091, 092 and 093 is a table row, plus an address straight after the
   label (`**Owner:**a@b.test`) and a trailing character after the domain (`a@b.test.`, `a@b.testx!`).
6. **AC-6** 093's minors: `ownerFrozen` and its SQL form come from one definition (or a table test shows they agree);
   push.ts reports a branch's key conflict before an unreadable `state.json`, as 091 did; `proposeCreate` checks the
   viewer may create in the project before naming its repo.
7. **AC-7** Tests: a table per rule (AC-8 included); the 089–093 suites and the AMX e2e still green; a local demo sync shows the repo's
   dates on AMX.
8. **AC-8** Agentic first on the Proposals pages (agreed 2026-11-10). On the all-projects page, when some project is
   agent-first, the main action is the line "Proposals come from your repos · write one with /specclaw:propose", and
   manual creation is a secondary "Add by hand" button, shown only while the viewer can add to a project that isn't
   agent-first (with no agent-first project, "New proposal" stays as today). An agent-first project's Proposals tab shows
   its repo line, as its board does.

## Tasks

- [x] `T1` — Proposals pages lead with the repo line; "Add by hand" is secondary; an agent-first project's tab shows its line (AC-8)
  Files: modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/proposals-action.ts, modules/delivery/ui/ProjectLists.tsx, modules/delivery/ui/ProjectSections.tsx, modules/delivery/ui/NewProposalButton.tsx, modules/delivery/ui/AgentFirstLine.tsx
- [x] `T2` — Token-based Owner-line parser; 093's three minors (AC-5, AC-6)
  Files: modules/delivery/sync/owner-line.ts, modules/delivery/sync/specclaw.ts, modules/delivery/server/owner.ts, modules/delivery/server/services.ts, modules/delivery/server/push.ts, modules/delivery/server/proposal-card.ts
- [x] `T3` — The repo's dates: created, task done, phase history (AC-1, AC-2, AC-3)
  Files: modules/delivery/sync/specclaw.ts, modules/delivery/sync/authors.ts, modules/delivery/sync/import.ts, modules/delivery/server/push.ts, modules/delivery/server/services.ts, modules/delivery/server/tasks.ts, modules/delivery/server/proposal-detail.ts, modules/delivery/mcp.ts, plugins/amax/scripts/read-specclaw.mjs
- [x] `T4` — "Shipped to Prod per week" counts only Prod deployments (AC-4)
  Files: modules/delivery/server/queries.ts
- [x] `T5` — Tests, docs, local demo (AC-7)
  Files: modules/delivery/tests/*-094.test.ts, modules/delivery/README.md
  Depends: T1–T4

## Verify

<!-- Filled by verify. -->
