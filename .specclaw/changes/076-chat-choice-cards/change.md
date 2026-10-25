# Chat choice cards

**Change:** 076-chat-choice-cards · **Created:** 2026-10-25

## Problem

When a request fits more than one write ("change Wednesday to 6 h" on a day with two entries), amax answers with a
paragraph listing the alternatives. The person types which one they mean, and only then gets a confirm card: two extra
steps for something amax already knew exactly.

Approved by the product owner, 2026-10-25: "build it in the current branch end to end", after the choice card was
proposed in chat ("only for choice-based descriptions").

## Mock Delta

What changes on screen, and where to see it: [`076-chat-choice-cards`](../../mock/index.html#076-chat-choice-cards)

In chat, alternatives that are each a write show as one **choice card**: a question, one option per write (its figure and
what it changes), "Something else…", and one button named for the chosen option's action. After a choice it folds to the
usual one-line receipt; the options not chosen are dropped.

## Acceptance Criteria

1. **AC-1** The model has one more tool in chat, `offer_choices` (question, 2–4 options, each a write tool and its input).
   The instructions say to use it instead of listing alternatives in text when each alternative is a write, and to use
   plain text when they aren't writes or something must be asked.
2. **AC-2** Each option is checked as a single write call is: the tool exists for the viewer and is a write, its input
   passes the tool's schema, it has a declared service, it takes no typed secret, and its `propose` check passes. An option
   that fails is left out and the model is told why. Two or more left: one choice card. One left: an ordinary confirm
   card. None: no card, and the model is told why.
3. **AC-3** The options are ordinary pending cards that share a `choice` (`id`, `question`, and the option's `label`),
   each with its own trace step and idempotency key. Confirming one runs only that write, and the others are recorded as
   not chosen. Two options of one choice can never both run: before an option runs, the other options' keys are claimed
   as cancelled, and an option whose sibling has already run or is running is refused as cancelled.
4. **AC-4** Cancel on a choice card cancels every option. A conversation reopened from history shows an undecided choice
   card again, as one card.
5. **AC-5** The card (`ChoiceCard.tsx`): the eyebrow "Choose · {kind}", the question, one radio option per write with its
   figure and subject (or its label), and "Something else…", which writes nothing and puts the cursor in the chat box.
   The button is named for the chosen option's action (its `look.confirm`, red when destructive) and stays disabled
   until an option is picked. "Nothing is saved until you confirm." It folds to the chosen option's receipt.
6. **AC-6** Keyboard-complete (a radio group; arrow keys move between options), labelled for screen readers, light and
   dark themes, and full-width buttons at phone width. Axe finds nothing.
7. **AC-7** Tests: AC-2's filtering (a refused option is dropped; one left becomes a plain card; none makes no card);
   AC-3's exclusivity (confirm one, the other is refused; a concurrent second confirm never writes twice); AC-4's cancel.
   Every existing chat test passes unmodified.
8. **AC-8** A live run with the real model: Tharushi, with two Fleet Tracker entries on one day, says "Change Wednesday
   to 6 h" and gets one choice card; picking an option and confirming changes only that entry.

## Tasks

- [x] `T1` — The choice card in chat: grouping, radio options, "Something else…", receipt (AC-5, AC-6)
  Files: apps/web/components/chat/ChoiceCard.tsx, apps/web/components/chat/Chat.tsx, packages/ui/src/styles/chat.css
- [x] `T2` — `offer_choices`: option checks, grouped pending cards, instructions (AC-1, AC-2)
  Files: packages/chat/src/choices.ts, packages/chat/src/engine.ts
- [x] `T3` — One option wins: sibling keys claimed before a run; cancel cancels the group (AC-3, AC-4)
  Files: packages/chat/src/engine.ts
- [x] `T4` — Tests and a live run with the real model (AC-7, AC-8)
  Files: packages/chat/tests/choices.test.ts, .specclaw/changes/076-chat-choice-cards/change.md
  Depends: T1, T2, T3

## Verify

**Verdict:** PASS
- AC-1: pass — `offer_choices` is in every chat turn (`choices.ts`); `CHOICE_INSTRUCTIONS` is appended to the model's instructions. Live, the model used it for "Change Wednesday to 8 h" and "… to 6 h". When only one write fits ("down to 5 h") it made one confirm card, and when nothing needed changing it answered in text.
- AC-2: pass — `choices.test.ts`: an option over 24 h is left out with the tool's own reason passed to the model; one left becomes a plain card; none makes no card; the tool's chip is hidden.
- AC-3: pass — `choices.test.ts`:
  - after one option is confirmed, the other is refused as cancelled, and only one write ran;
  - two confirms at once write at most once;
  - the other options' keys are claimed as cancelled before a run (`claimChoice`).
- AC-4: pass — cancel cancels all three options (`decided` has 3 cancelled), and a later confirm is refused. Reopened conversations restore `pending`, which `Chat.tsx` groups by `choice.id`.
- AC-5: pass — `ChoiceCard.tsx`, live: "Choose · Fix hours", the question, the shared "Fleet Tracker · Wed Oct 14" once, and one row per option. "Something else…" focuses the chat box. The button is disabled ("Pick an option") until a choice, then reads "Save the fix · 0.7 h". The receipt reads "✓ Saved the fix · Fleet Tracker, Wed Oct 14".
  - Product owner during the build, "make it interactive":
    - number keys 1–4 pick an option, and Enter on the picked radio confirms;
    - the picked option is highlighted and expands to show the details its label doesn't already state;
    - each option shows a key hint;
    - the button carries the picked figure;
    - while saving, the chosen option shows a spinner and the others dim;
    - motion only runs without reduced motion.
- AC-6: pass — a radio group with arrow keys; axe (wcag2a/aa, 21aa, 22aa) is clean on the chat panel in light and dark. At phone width the buttons are full width and the key hints are hidden.
- AC-7: pass — `packages/chat/tests/choices.test.ts` (4 tests); chat 35/35; web 317/317; time 141/141; `pnpm lint` ok; build ok; time e2e 9/9.
- AC-8: pass — live with the real model.
  - Tharushi: "Change Wednesday to 8 h" gave three options. Picking "0.7 h → 2.7 h" changed only that entry (5.3 + 2.7).
  - "Change Wednesday to 6 h" gave two options. Key 2 and Enter changed only her entry back to 0.7 h, so the data is as it was found.
  - Not shown live: the preview with extra details (For, Reason, Notify) on someone else's entry. In two tries as Maya, the model chose a single card and then asked for details, so no choice card appeared.
- Screenshots: choice-light/dark/picked/done.png and choice2-open/picked/dark/phone.png in the session scratchpad (`ui/`).
