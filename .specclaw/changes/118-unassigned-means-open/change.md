# "Unassigned" means an open proposal needs an owner; a shipped one with none is "Not recorded"

**Change:** 118-unassigned-means-open · **Created:** 2026-11-16 · **Review:** change

## Problem

On AMX the attention strip says **8 Unassigned**, but the proposals list shows "Unassigned" in the Owner column of
about 72 rows. The count is right: it counts open proposals with no owner (3 proposed, 5 verified). The column also
labels the 64 released ones "Unassigned", although nobody needs to act on shipped work; its owner is only a credit,
which fills in at the next sync once people connect GitHub. Asked by the product owner (2026-11-16): make the label
match.

## Mock Delta

What changes on screen, and where to see it: [`118-unassigned-means-open`](../../mock/index.html#118-unassigned-means-open)

The Owner column, the board card's avatar and the proposal page say "Not recorded" (muted) for a released or withdrawn
proposal with no owner. "Unassigned" stays for open ones, and the count is unchanged.

## Acceptance Criteria

1. **AC-1** One rule in `modules/delivery/server/readiness.ts` decides what an ownerless proposal needs:
   - `needsOwner(p)`: no owner, and neither released nor withdrawn
   - `ownerLabel(p)`: the owner's name, else "Unassigned" when it needs an owner, else "Not recorded"

   The attention strip's Unassigned count (`attention.ts`) uses `needsOwner`.
2. **AC-2** The proposals list's Owner column, the board card's avatar name and the proposal page's Owner fact all show
   `ownerLabel`. "Unassigned" keeps its warning style only where an owner is needed; "Not recorded" is muted.
3. **AC-3** A table test over proposed, verified, released and withdrawn proposals, with and without an owner: the label
   and the count agree, and AMX's count stays 8. The delivery suite passes.

## Tasks

- [x] `T1` — One rule for needing an owner, and every label from it (AC-1, AC-2)
  Files: modules/delivery/server/readiness.ts, modules/delivery/server/attention.ts, modules/delivery/ui/ProposalsPage.tsx,
  modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/ProposalPage.tsx, .specclaw/mock/index.html,
  apps/mock/public/mock/index.html
- [x] `T2` — The label and the count agree (AC-3)
  Files: modules/delivery/tests/owner-label-118.test.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
