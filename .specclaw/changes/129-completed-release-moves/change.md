# A proposal in a completed release moves only when asked

**Change:** 129-completed-release-moves · **Created:** 2026-11-26 · **Review:** change

## Problem

124's review stopped at the cap with one major open (124's `## Verify`). A Verified proposal that sits in a *completed*
release is listed on the New release card with no detail and no "Move from their release" box, and `create_release` and
`set_release_proposals` take it out of that release without `reassign`; only the audit records the move. Since 126 a
completed release is final, so a change to what it contains shouldn't happen silently. Product owner (2026-11-26): ask
first, as for an open release; the move stays possible (a proposal of a UAT release that never reached Prod still ships
in a later one).

## Mock Delta

What changes on screen, and where to see it: [`129-completed-release-moves`](../../mock/index.html#129-completed-release-moves)

- New release card: a proposal in a completed release shows where it is ("in v0.12.0 · UAT · Completed") and appears in
  "Move from their release", exactly like one in an open release; unticked there, the card refuses it on the field.

## Acceptance Criteria

Terms. **Held elsewhere**: the proposal is in another release of the project, open or completed (123's
`openElsewhere`, which today skips completed ones). A proposal **shipped** in another release (Released there) stays
refused outright, as today.

1. **AC-1 One rule.** "Held elsewhere" counts a completed release as well as an open one. The card's list
   (`releaseProposals`), its field check, its move line (`movesOf`) and `assignProposals` all use it, so they can't
   disagree.
2. **AC-2 Writers ask.** `create_release` and `set_release_proposals` refuse a proposal held in a completed release
   unless `reassign` names it, with the same message as for an open one ("CON-14 is already in CON v2.4.0 (UAT,
   Completed); confirm moving it, or take it out there first"). Named in `reassign`, it moves and is audited in
   `after.moved` as today.
3. **AC-3 The card shows it.** On the New release card, such a proposal carries its detail ("in v2.4.0 · UAT ·
   Completed"), appears under "Move from their release", is refused on the field until ticked there, and the confirm
   card's move line names it ("CON-14 from v2.4.0 (UAT, Completed)").
4. **AC-4 Tests.** A table over a proposal in an open release, in a completed release, and in a completed release with
   `reassign`: both writers and the card agree in each case; a Released proposal in a completed release is still
   refused as shipped. README line.

## Tasks

## Verify
