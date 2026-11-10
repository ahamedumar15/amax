# Agent-first proposals: a project whose repo syncs its proposals gets them from the repo, not by hand

**Change:** 093-agent-first-proposals · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 092-ci-sync-owner-and-merge-fixes (same branch, PR #113).

## Problem

The client wants the agentic proposal flow first. Today every project offers "New proposal" (hand-made, 081) next to
the repo's specclaw proposals, so the two compete. Decided 2026-11-10: a project whose linked repo syncs its proposals is
agent-first, with no manual creation there; other projects keep manual creation, since nothing else can make their
proposals yet. "Draft with an agent" from amax comes next, as its own change.

**Agent-first project** (decided 2026-11-10, "linked + synced"): a project with a linked repo that has brought in at
least one proposal (`source = 'specclaw'`). A freshly linked project keeps manual creation until its first sync;
relinking an agent-first project to another repo keeps it agent-first, since its synced proposals stay, and a project that
already has synced proposals is agent-first as soon as a repo is linked (final passes). (The demo
fixtures' CON has a linked repo but only hand-made proposals, so it stays manual.)

## Mock Delta

What changes on screen, and where to see it: [`093-agent-first-proposals`](../../mock/index.html#093-agent-first-proposals)

On an agent-first project, the header has no "New proposal". In its place a line says where proposals come from:
"Proposals come from github.com/… · write one with /specclaw:propose; it appears here when merged". Any other project looks
as today.

## Acceptance Criteria

1. **AC-1** An agent-first project shows no "New proposal" on its page. It shows the line above,
   naming the repo. Any other project shows "New proposal" as today, to whoever may create there.
2. **AC-2** The global Proposals page shows "New proposal" only to someone who may create in at least one project
   that isn't agent-first. Filtered to an agent-first project, it shows that project's line instead. Chat's "Which project
   is it for?" offers only projects that aren't agent-first.
3. **AC-3** `create_proposal` refuses an agent-first project before the confirm card, and the service refuses it
   too (the API and agents): "<KEY>'s proposals come from its repo (<repo>): write one with /specclaw:propose".
4. **AC-4** Chat suggestions and a project's pin don't offer "New proposal" on an agent-first project.
5. **AC-5** Hand-made proposals already in such a project stay as they are: readable, and editable, withdrawable and
   given tasks as before. Unlinking the repo brings manual creation back.
6. **AC-6** Tests: a table over agent-first projects, linked-but-unsynced ones and projects without a repo for the page, the global page, chat suggestions, the
   pin, the confirm card and the service; the 081 creation tests still pass (CON stays manual).

## Tasks

- [x] `T1` — Project and global Proposals pages: no "New proposal" on an agent-first project, the repo line instead (AC-1, AC-2)
  Files: modules/delivery/server/agent-first.ts, modules/delivery/server/queries.ts, modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProposalsPage.tsx, modules/delivery/ui/AgentFirstLine.tsx
- [x] `T2` — create_proposal and its service refuse an agent-first project; chat's project choice and suggestions, and the pin, leave it out (AC-2, AC-3, AC-4)
  Files: modules/delivery/server/proposal-card.ts, modules/delivery/server/services.ts, modules/delivery/server/pin-offers.ts, modules/delivery/chat-suggestions.ts, modules/delivery/mcp.ts
- [x] `T3` — Tests and docs (AC-5, AC-6)
  Files: modules/delivery/tests/agent-first-093.test.ts, modules/delivery/README.md
  Depends: T1, T2

## Verify

<!-- Filled by verify. -->
