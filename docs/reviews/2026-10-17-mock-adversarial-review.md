# Adversarial review of the amax mock: 2026-10-17

Three reviewers looked at mock commit `7924dad`, each in a fresh context with a different lens:
- **Visual design and UX**, from screenshots of all 21 screens: light at 1440 px, plus dark mode and 390 px for five screens.
- **Product fit and data consistency**, read against PRODUCT.md, the roadmap and change 001.
- **Accessibility and behaviour**, probed in Chromium with Playwright, plus contrast maths.

## Verdict

The look matches the chosen reference, and some screens genuinely work: Releases, the payroll stepper with explained changes, the person page, the "Claude for Nimal" attribution, and the confirm card in the chat.

Four problems would hurt it in front of real users:
- The numbers contradict each other across screens.
- There is no permission model; one "delivery lead" sees everyone's pay and payroll actions.
- Agents take risky actions without approval or undo.
- Custom widgets break keyboard and screen-reader use.

**Change 001 should not be approved until the data model and role items in "Fix before approving 001" are in its acceptance criteria.**

## Fix before approving 001

| # | Item | Why |
|---|---|---|
| 1 | AC-5 data model gets `tenant_id`, `legal_entity_id`, currency, `actor` and `on_behalf_of`, plus an `AuditEvent` table | The roadmap already says these must be in from the start; the AC leaves them out. |
| 2 | Roles and data scopes: add HR, Payroll, Employee and Leadership roles; scope data by entity, department and project; mask pay fields everywhere | A "delivery lead" sees salaries, the payroll run and its Approve button, global admins and leave liability. Kasun's salary is masked on his profile but shown on the payslip list. |
| 3 | Chat-first creation either gets ACs (preview, permission check, write through the shared service plus audit, cancel) or moves to its own change | No AC covers the chat flow, "Add it", pinning or the inbox agent. AC-11 still describes ⌘K as a separate palette. |
| 4 | A single seed source; reconcile every number before AC-5 seeds it | See the data contradictions below. |
| 5 | Every agent write is governed: evidence, confidence, human approval, undo, audit | One-click licence "Remove", the support agent granting repo access, and the payroll agent marking changes "OK" and docking pay. |
| 6 | Screens outside 001's scope show empty states, as the change text promises | Otherwise approving 001 also approves 20 modules' UX, including an empty Australia payroll. |

## Data contradictions (the mock disagrees with itself)

- **Hours:** Overview says 412.5 h this week; Time says 141.5 h. The agent share is 63% on Overview but works out to about 55% on Time. "41 h since this morning" doesn't match Friday's 1.0 h. "Week 42 timesheets: 4 people" doesn't match Time's 5 people with 3 submitted.
- **Calendar:** "Week 42, Oct 13 to 17" is wrong; ISO week 42 of 2026 is Oct 12–18, and Oct 13 is a Tuesday. Sprint 18 "Oct 13–24" runs Tuesday to Saturday.
- **Utilisation:** labelled billable ÷ available, but calculated as billable ÷ logged. Nimal is 92/160 = 57.5%, not 94%.
- **Proposals:** phase counts add up to 40, but the page says 37 in flight. 010 is "Released" while only in QA.
- **Event order:** v1.8.0 "rolled back Oct 14", but shown as raised 2 h ago. 012 was tagged v2.4.0 after v2.4.0 was promoted.
- **Finance:** INV-0912 is both the next invoice and 9 days overdue. "Ready to invoice $184,260" appears nowhere on Financials. The Northwind HR retainer is 83% invoiced only 2.5 months after it was won.
- **Payroll (Sri Lanka):** the LKR 12.40M statutory total doesn't reconcile with gross pay. EPF/ETF are due at month end, not Nov 15. Kasun has overtime but shows "No change". Ayesha has pay docked for "no approval found" while she's on approved casual leave. Tharushi's confirmation is effective Oct 1 but her probation ends Oct 31.
- **Recruitment:** the funnel says Hired 4 and Interviewed 19; the board shows 2 and 5. Columns show 1–2 cards against counts of 24 and 9.
- **Elsewhere:**
  - Bench: 6 people (Insights) vs 27 (Allocations).
  - Learning: 126 participants vs 184 in one programme.
  - Headcount growth: 17.6% vs net +31 on 184.
  - Licence savings: $1,940 a month vs $1,620 a year.
  - Kasun's licences: 5 in one place, 4 in another.
  - Leave: 6 on leave today, but nobody is off on the calendar.
  - Joiners: Q4 9/3 vs the October chart.
  - Time: 63% from agents vs 55%.
  - Talent chart ends at 175 vs 184.
- **Fixtures:** `BG-` employee and laptop prefixes echo Bistec, and a real person's name is used for the signed-in user. The mock data should be clearly fictional.

## Domain and workflow gaps

- **Australia payroll** is a switch with no content: no PAYG, super, Payday Super or STP Phase 2.
- **Leave** has no Australian leave types, half days, cancellation or carry-over rules.
- **Time** has no reject-with-comment, period lock or manager-chain approval.
- **Finance** has no GST/VAT/SSCL, credit notes, FX conversion, or time-and-materials invoice drafting from approved time.
- **Presales** mixes AUD and USD with no conversion. Health should be calculated, not typed (it shows green with a high-impact risk open).
- **Cross-cutting:** no bulk actions, delete/archive, audit history, notification settings, CSV import (needed for migration, since chat can't do bulk loads), or entity and currency switcher.
- **Agent claims** need a source, a confidence and a date. Examples: "14% false-positive reduction", share of voice, "CIO surveys 64%", and a UK market with no UK entity.

## Visual and UX

| Sev | Issue | Fix |
|---|---|---|
| High | The floating mascot covers buttons and data on most screens | Dock it into the top bar next to search |
| High | Phone: tables are cut off (Payslips loses Gross, Deductions and Net); 19 unlabelled bottom tabs; stat cards bleed past the edge | Stacked row cards below 600 px; 4 labelled tabs plus "More"; a 2×2 stat grid |
| High | Stat-card colour rotates by position, not meaning (overdue and ready-to-invoice are both yellow; satisfaction and missing documents both pink), so it fights the chip colours | Semantic colours, or one neutral pastel |
| High | Progress bars on stat cards have no denominator ("On leave today 6", "Headcount 184") | Only show a bar against a real target, and label it |
| High | 19-icon rail with no labels or groups; icon meanings are guesswork; the theme toggle looks like a setting | Labelled flyout or expandable rail with section headings; move the theme toggle to the profile menu |
| Med | Three tab styles. Yellow means both "selected" and "primary action" | One tab style with a neutral selected state; yellow only for actions |
| Med | Charts mislead: payroll cost on a 0–50M axis flattens a 1.8% change; October invoicing is month-to-date but drawn as a miss; joiner/leaver counts smoothed into curves; sparklines with no axis | Tight axes, partial-period hatching, bars for counts, labelled sparklines |
| Med | "Approve selected" with no checkboxes; "Approve run" live while 2 reviews are open | Add row selection; disable actions until their preconditions hold |
| Med | Chat covers the content you're working on, repeats "amax" under every bubble, and doesn't show which outlined word filled which field | Group consecutive bot messages; colour outlined words by field to match the confirm card |
| Med | Dark mode: pale history bars are the brightest thing on the page; stat cards go muddy | Retune dark-mode chart and card colours separately |
| Med | Illustrations repeat for unrelated metrics and become noise across 21 screens | At most one per screen (briefing or empty state); small icons on cards |
| Low | No empty, loading or error states (only Presales has one); allocations don't total per person; "In QA" sits in the Released column | Design the states, add per-person totals, rename the column |

## Accessibility and behaviour (WCAG 2.2 AA)

**Critical**
- Switches ignore Space and Enter.
- The closed chat can still be tabbed into.
- Opening the chat from the floating button drops focus.

**High**
- Closing the chat strands focus, and Escape doesn't close it.
- The board's stage dropdown moves a card on a single arrow press.
- Removing a card loses focus.
- Changing screens doesn't move focus or announce the new screen.
- 16 tab "links" have no `href`, so they can't be reached by keyboard.
- There are 222 identical "Add to chat" buttons. They only appear on hover, so touch users never see them, and dragging a nested item pins the parent.
- Contrast: muted text #9A97AE is 2.83:1 and white on coral is 2.99:1.

**Medium**
- Chip and trend colours fail 4.5:1. Dark-mode stat cards fail.
- Reduced motion doesn't stop the infinite animations.
- Theme toggle and sign out are unreachable on phones.
- No `<main>` element and no skip link.
- Chart values aren't available to screen readers.
- Toasts and moves aren't announced.
- The chat input has no label.
- Pick mode takes over every click without saying so.

**Low**
- Empty table headers, no captions.
- Scroll is reset twice on every navigation.
- The theme isn't saved and the toggle has no `aria-pressed`.
- Duplicate SVG ids.
- Some overflow at 390 px and 1024 px.
- 22 px tall switches.

## Keep

- Releases environment map.
- Payroll stepper with the agent's explained changes ("agents record, people decide").
- Page subtitles that lead with what needs attention.
- "Claude for <person>" attribution, used consistently.
- The person page: sensitive fields masked; documents, leave and access in one place.
- The chat's confirm-before-write card.
