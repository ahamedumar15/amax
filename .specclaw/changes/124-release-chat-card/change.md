# Release tracking, phase 2: create a release from one chat card

**Change:** 124-release-chat-card · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 123, chat's New release asks for six fields in text, the person must know proposal keys, and a proposal that
sits in another open release is simply refused. The product owner's phase 2 brief (2026-11-26) wants "Create a new
release" to open one conversation that collects the name, category, proposals and dates, offers only Verified and
Released proposals, warns about a proposal already in another release and moves it only on explicit confirmation, and
ends with a link to the new release. Phase 3 (list and detail pages, the daily status check) is out of scope.

Decisions (product owner, 2026-11-26), which amend 123's AC-6: a proposal in **any** other open release is shown as a
warning and moved only when the person **explicitly** ticks it to move (otherwise refused, as in 123); proposals are
picked from a **multi-select** on the card (a new `checks` field kind); the done card links to the release with an
**in-app** path.

## Mock Delta

What changes on screen, and where to see it: [`124-release-chat-card`](../../mock/index.html#124-release-chat-card)

- "Create a new release" opens one New release card: Name, Version, Category chips, Start, Target, and the project's
  Verified and Released proposals as checkboxes, each in another release marked with it.
- Ticking a proposal that sits in another open release shows a "Move from …" box that must also be ticked.
- Field errors show on the field; the done card says "Created November Release (v1.9.0) · 2 proposals" with an
  "Open the release" button.

## Acceptance Criteria

Terms. **Eligible proposals** of a project: its Verified and Released proposals that aren't withdrawn and haven't
shipped in another release (123's rules, unchanged). A proposal's **open release** is another release of it that isn't
Completed (an untracked one counts, as in 123).

1. **AC-1 Intent.** "Create a new release", "New release" on a Releases page, and the project pin's offer open the New
   release card at once (106's pattern: `create_release` gets a `draft` input, chat proposes the card with whatever is
   known and asks nothing in text). The project is the pinned or named one; with none, chat asks "Which project is it
   for?" with `offer_answers` listing up to six active projects the person may create releases in.
2. **AC-2 The card.** Fields: Name (text), Version (text, prefilled with the next version after the project's latest),
   Category (chips Dev, UAT, Prod), Start (text, prefilled with today in the project's zone), Target (text), and
   Proposals (`checks`, AC-3). Anything already said is prefilled; edits stay on the card while it's checked, so
   nothing is typed twice. The button reads "Create {name}".
3. **AC-3 Eligible proposals.** New read tool `list_release_proposals` (`projectKey`; `delivery:read`) returns the
   project's eligible proposals: key, title, phase, and their open release (version, category, status) if any. The
   card's Proposals options are exactly these, labelled "<KEY> <title>", with "in <version> · <Category> · <Status>"
   under one in an open release. With none, the field says "No Verified or Released proposals in <project> yet".
4. **AC-4 Checks field (platform).** `CardField` gains `{ kind: "checks", options: { value, label, detail? }[] }`; its
   value is the ticked values joined by commas. The chat card draws it as a fieldset of checkboxes with a legend,
   keyboard-complete, light and dark, and an error under it like other fields. Existing cards are unchanged.
5. **AC-5 Explicit move.** `create_release` and `set_release_proposals` take `reassign` (proposal keys). A ticked
   proposal in an open release moves only when it is also in `reassign`; otherwise it's refused, naming the release ("FLT-012
   is already in FLT v1.8.0 (UAT, In progress); confirm moving it, or take it out there first"). On the card, ticking such a proposal
   adds a `checks` field "Move from their release" listing it, unticked. The move is audited with where each came from
   (`after.moved`: key and version). A proposal in a Completed release moves without `reassign`, as in 123.
6. **AC-6 Warnings on the card.** The card's note (the tool's `note` hook) lists each ticked proposal in an open release:
   "FLT-012 is in FLT v1.8.0 (UAT, In progress): it moves only if you tick it below".
7. **AC-7 Checks as you edit.** The card checks a field on edit (the existing field check): a date that isn't
   YYYY-MM-DD or a real day, a target before the start, a category the project has no environment for, an empty name,
   a version the project already has, and an ineligible proposal each show their message on that field; the button
   stays until fixed. The whole input is checked again at confirm (Phase 1's service), so nothing invalid is written.
8. **AC-8 Create and link.** Only Create on the card writes: Phase 1's `createRelease` runs with the edited input
   under the existing pending-action confirm. The result carries `open: { label: "Open the release", url: <href> }`.
   Chat's done outcome accepts an in-app path (`/` then not `/`) and shows it as a button without ↗ that opens in the
   same tab. The receipt reads "Created <name> (<version>) · <n> proposals"; chat's reply names the release and the link.
9. **AC-9 Errors.** A person who may not create releases in the project gets no card: "You can't create releases in
   <KEY>" (the `propose` hook). A refusal at confirm (a conflict nobody ticked, a proposal that changed phase, a
   version taken meanwhile) shows its reason and leaves the card open to fix. A backend failure shows "That didn't go
   through. Try again." and the card stays open. Cancel closes it with nothing written. No path says Done before the
   service returns.
10. **AC-10 Tests.** Intent and draft card (fields, prefill, project question); `list_release_proposals` (eligibility,
    open release); the checks field renders and edits (component test); conflict note and explicit move in both
    writers, refusal without it; field checks; confirm creates and returns the link; cancel writes nothing; a failing
    service leaves the card open. 123's suites still pass; the e2e "081 AC-39" uses the card.

## Tasks

<!-- Added by plan. -->

## Verify

<!-- Filled by verify. -->
