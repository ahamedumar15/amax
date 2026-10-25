# Team time status band

**Change:** 075-team-time-status-band · **Created:** 2026-10-25

## Problem

Team time opens with one long sentence: "Week 42, Mon Oct 12 to Fri Oct 16. 3 of 5 people have submitted 87.5 h. Agents
logged 90.2 h, 66% of the team's 137.4 h." The dates repeat the week picker and the hours repeat the summary strip. The
two facts that matter, how far the team is with submitting and how much the agents logged, are buried, and they can't
be clicked or pinned.

Approved by the product owner, 2026-10-25: "build it in the current branch end to end", after the status band was
proposed in chat.

## Mock Delta

What changes on screen, and where to see it: [`075-team-time-status-band`](../../mock/index.html#075-team-time-status-band)

Team time's header sentence is replaced by a status band of two bars: **Submissions** ("3 of 6", one segment per status)
and **Who logged it** (agents vs people, with the agents' share). Each status in the legend links to the grid filtered
to it, and each bar has a **+** pin.

## Acceptance Criteria

1. **AC-1** Team time no longer has the header sentence. Under the title, a status band shows two parts side by side:
   **Submissions** and **Who logged it**. With nobody on the week it shows nothing, and the empty state stays as it is.
2. **AC-2** Submissions: "{submitted or approved} of {everyone}", and a bar with one segment per status, its width in
   proportion to the count: Approved, Submitted, Sent back, Draft, Not started. "Everyone" counts people with no
   timesheet (073's Not started rows). The legend names each status with an icon (✓ ● ↩ ◐ ○) and its count, so colour is
   never the only signal. A status with no one is left out.
3. **AC-3** Who logged it: the week's total hours, and a bar split into agent hours and hours people entered, with each
   part's hours and %. With no hours it reads "No hours logged yet".
4. **AC-4** Each legend item is a link that sets the grid's status filter, keeping the other filters: Approved →
   `approved`, Submitted → `submitted`, Sent back → `rejected`, Draft and Not started → `not_submitted`. It lands on the
   Timesheets card (`#timesheets`). The band counts the whole week whatever the filters are.
5. **AC-5** Each part has a **+** that pins it ("Submissions, 2026-W42", "Who logged it, 2026-W42") and resolves through
   `get_team_week` like the summary strip.
6. **AC-6** Accessible: each bar has a text alternative ("3 of 6 submitted: 1 approved, 2 submitted, 2 draft, 1 not
   started"), links work from the keyboard with a visible focus, contrast holds in light and dark, and at phone width
   the two parts stack. Axe finds nothing.
7. **AC-7** Tests: the band's counts and percentages from a week's rows (unit); the e2e check that read the header
   sentence reads the band instead, and a legend link filters the grid. Every other test passes unmodified.

## Tasks

- [x] `T1` — The status band on Team time: two bars, legend links, pins, accessible and responsive (AC-1 to AC-6)
  Files: modules/time/ui/StatusBand.tsx, modules/time/ui/band.ts, modules/time/ui/TeamPage.tsx, modules/time/ui/Timesheets.tsx, modules/time/ui/time.css, modules/time/server/grid.ts
- [x] `T2` — Tests: band figures, and the e2e check reads the band and follows a legend link (AC-7)
  Files: modules/time/tests/status-band.test.ts, modules/time/tests/e2e/time.spec.ts
  Depends: T1

## Verify

**Verdict:** PASS
- AC-1: pass — the header sentence is gone; the band sits under the title (`TeamPage.tsx`, `StatusBand.tsx`); the empty week keeps its date line and empty state.
- AC-2: pass — week 42 "3 of 5 submitted", with 3 submitted and 2 draft; week 43 shows 1 approved, 2 submitted, 1 draft and 1 not started, each segment and chip with its own icon. Unit test AC7.
- AC-3: pass — "66% by agents, of 137.4 h", with Agents 90.2 h · 66% and People 47.2 h · 34%; "No hours logged yet" when there are no hours (unit test).
- AC-4: pass — e2e: clicking "2 draft" goes to `?status=not_submitted#timesheets` and the grid shows 2 rows; other filters are kept in the link.
- AC-5: pass — a **+** on each part pins "Submissions, 2026-W42" / "Who logged it, 2026-W42" through `get_team_week`.
- AC-6: pass — each bar has a text alternative (`role="img"`).
  - Axe (wcag2a/aa, 21aa, 22aa) is clean in light, dark, phone and week 43.
  - At phone width the parts stack.
  - Product owner, during the build: "make sure every button's text is properly aligned". The legend glyphs (● ◐ ✦) rendered at different sizes and sat low, so they were replaced by 14 px SVG icons (`BandIcon.tsx`) in 28 px chips. Measured: every chip 28 px tall, each icon centred on its label (0 px offset).
- AC-7: pass — `tests/status-band.test.ts`; e2e AC3 reads the band and follows a legend link.
- Commands: time vitest 141/141; `pnpm lint` ok; `pnpm build` ok; time e2e 9/9.
- Screenshots: band-light.png, band-dark.png, band-phone.png and band-w43.png in the session scratchpad (`ui/`).
