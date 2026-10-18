# Marketing site revamp: an enterprise-grade product page where the product performs

**Change:** 064-marketing-revamp · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `apps/web (public page, components/marketing)` · **Depends on:** [062](../062-marketing-site/change.md), [063](../063-public-assets-in-image/change.md)

## Problem

The 062 page works, but it reads like an app screen: a stack of same-width cards with a native video box. It doesn't make the case an enterprise buyer needs. Nothing on the page shows the product doing its one job: a person deciding on what an agent drafted. Sections share one layout. The video has no clear play affordance, and in production it doesn't load at all (063). amax is positioned to lead its category, so its front door has to look and behave like a top-tier product site.

## Mock Delta

What changes on screen, and where to see it: [`064-marketing-revamp`](../../mock/index.html#064-marketing-revamp)

The page is rebuilt around working fragments of the real product (direction: "the product performs"). The idea: **the decision card, the one place in amax where a person decides, becomes the page's unit.** Every section shows a real amax card being drafted, decided and recorded.

- **Header:** logo, Product · How it works · Security · FAQ, a light/dark theme switch, Sign in, and a yellow "Book a demo" button. Sticky and solid (no glass), with a hairline under it.
- **Hero, the live thing:** the headline on the left. On the right, a working "Waiting on you" queue at true interface size, with a role switch (PM, Finance, HR, Engineer). Each role has its own fictional queue. Pressing Accept, Approve or Promote resolves the card and writes the attribution line ("Accepted by you · drafted by Git ingestion for Kasun Dias"). Below the hero sits a "Watch the 35-second tour" button.
- **Product film:** the real video on a tinted stage, not black. A "Play the tour · 35 s, captions" pill sits bottom-left, clear of the poster headline. Once started, the MP4 plays inline with native controls. The video is re-rendered with the new cast.
- **Statement:** one sentence at statement size, with small interface crops set inline between the words.
- **How it works:** a pinned fragment changes state as three statements scroll by (the work happens, amax drafts the record, you decide), with real states: commit, suggestion, accepted plus audit line.
- **Today at Lumen Labs (fictional):** a departure-board list of real-looking records (task closed, hours drafted, week submitted, release promoted, invoice drafted, leave requested). Each row has who it was done for and a status block in the ticket colours. One row is open and shows its detail.
- **Capabilities:** one full-width band per area (Delivery, People, Payroll, Finance and sales, Operations, Platform), each in its ticket colour. Each band has a working switch that opens the band's concrete claims, with Coming items marked. Claims come from `areas.ts`, so the 062 registry guard still holds.
- **Built for audit:** filled tiles of product facts: attribution, hash-chained audit, role-scoped MCP, region pinning, retention and legal holds, Entra ID SSO and SCIM, WCAG 2.2 AA, and "runs on Vercel, Cloudflare or your own k3s". No logos, customers or metrics.
- **FAQ:** a sticky heading and an accordion of filled tiles (`<details name>`), with seven real questions.
- **Close:** the yellow field holds the product's own "Ask amax" composer, already open with a typed question. Its button is the demo mailto.
- **Footer:** the wordmark at full width, links, and the fictional-data note.

**Fictional cast, not limited to one country:** Liam Walsh (engineer), Chloe Harris (PM), Jack O'Brien (release owner), Priya Raman (Finance), Sophie Nguyen (leave request), at Lumen Labs (fictional).

**Dark theme:** a lifted indigo palette (ground `#1C1A33`, surfaces `#26243F` and `#2E2B4D`), not near-black. The film and board sections sit on tinted surfaces in both themes. Cards, tiles, rows, the FAQ and the header have a visible outline (`--line`). These outlines were asked for, so they override the skill's no-lines rule.

Brand constraints kept over the skill's house rules (recorded on purpose): the logo's mint-to-violet gradient, the ticket gradients and the violet accent are the amax brand.

## Acceptance Criteria

1. **AC-1** The sections render in the order of the mock delta, each with a different composition from its neighbours. At 1440, 768 and 390 px no heading runs past two lines, there is no horizontal scroll (checked with a wide fallback font, as in 062), and nothing overlaps a headline.
2. **AC-2** The hero queue works. The role switch (a tab list: arrow keys, Home and End) swaps four fictional queues. Each card's action resolves it, announces the outcome through a polite live region, and shows the attribution line. Every action is keyboard-operable with visible focus. Without JavaScript the queue shows the PM's cards, static and readable. A Playwright test presses Accept and reads the attribution line.
3. **AC-3** The video plays. A custom play button (a 64 px or larger target, labelled "Play the 35-second product tour") starts the MP4 inline, with native controls and the English captions track. MP4 is listed first. There is no autoplay, and nothing moves on its own under `prefers-reduced-motion`. A Playwright test against the production build presses play and checks that `currentTime` advances and that `video.error` is null.
4. **AC-4** The how-it-works fragment changes state as each statement reaches the viewport centre (IntersectionObserver). Inactive statements stay at readable contrast (4.5:1 or more). With reduced motion or no script, all three states are shown in sequence.
5. **AC-5** The capability bands are built from `areas.ts`: every live claim maps to an installed module and every Coming claim to a missing one (062's `marketing-areas.test.ts` keeps passing). Each band's switch is a real `role="switch"` that answers click, Space and Enter.
6. **AC-6** The claims still match the product. Hours are drafted and accepted, confirms are scoped to chat, and the week is submitted before approval (062 R4 and copy tests). There are no testimonials, logos, customer names or business metrics. All records are fictional and labelled.
7. **AC-7** Design system: the page uses `packages/ui` tokens (colour, radius, font), `Logo` and `Mascot`, one button shape and one radius. It works in light and dark (axe shows no violations, `wcag22aa` included), and motion uses transform and opacity only, each with a reduced-motion fallback.
8. **AC-8** Performance on the mobile production build, from Lighthouse: performance 90 or more, accessibility 100, best practices 100, SEO 100. The video and every image below the first screen load lazily. The page ships no client JavaScript beyond the queue, the switches, the pinned fragment and the video button (one small client island each).
9. **AC-9** No forms (rule 1). "Book a demo" is the `AMAX_SALES_EMAIL` mailto, hidden when unset (062 behaviour). The Ask amax composer in the close is a static, read-only fragment whose button is that mailto.
10. **AC-10** A theme switch in the header toggles light and dark. It uses the app's `ThemeScript`/`applyTheme` so the choice persists and there is no flash on load. It is a labelled button, keyboard-operable, and starts from the system setting. In dark, no section uses a ground darker than `#1C1A33`, and every card, tile, row and FAQ item has a visible outline (axe contrast passes in both themes).
11. **AC-11** The product video and its poster use the new fictional cast. The mock's copy script ships `.specclaw/mock/media/` with `index.html`, so the GitHub Pages mock plays the video too.

## Open questions

- Is "Gartner level" the bar you meant: an enterprise-grade product site, in the class of category leaders? That's how this proposal reads "gardener level".
- Are there real integration names you want in "Built for audit"? Today only shipped ones are listed: Entra ID, SCIM, MCP clients, Keyflow.

## Tasks

- [x] `T1` — Page shell and static sections matching the mock: header with the theme switch (`readTheme`/`applyTheme`), statement, "Today at Lumen Labs" board, Built for audit tiles, FAQ, close with the Ask amax fragment, and footer. Tokens, the lifted dark palette and outlines in CSS. All prose in `copy.ts`, with the new cast (AC-1, AC-6, AC-7, AC-9, AC-10)
  Files: apps/web/app/(public)/welcome/page.tsx, apps/web/app/(public)/welcome/welcome.css, apps/web/app/(public)/welcome/sections.css, apps/web/components/marketing/MarketingBar.tsx, apps/web/components/marketing/ThemeToggle.tsx, apps/web/components/marketing/Statement.tsx, apps/web/components/marketing/Board.tsx, apps/web/components/marketing/AuditTiles.tsx, apps/web/components/marketing/Faq.tsx, apps/web/components/marketing/Closing.tsx, apps/web/components/marketing/Footer.tsx, apps/web/components/marketing/copy.ts
- [x] `T2` — Hero with the working "Waiting on you" queue: a role tab list (arrow keys, Home and End), four fictional queues, actions that resolve a card with its attribution line and a polite announcement, and a no-JS static PM queue (AC-2)
  Files: apps/web/components/marketing/Hero.tsx, apps/web/components/marketing/Queue.tsx, apps/web/components/marketing/queues.ts
  Depends: T1
- [x] `T3` — Product film: the re-rendered video (new cast), poster and captions, MP4 first, and the "Play the tour" button that starts it inline with controls. No autoplay (AC-3, AC-11)
  Files: apps/web/public/marketing/amax-product.mp4, apps/web/public/marketing/amax-product.webm, apps/web/public/marketing/amax-product-poster.jpg, apps/web/public/marketing/amax-product.en.vtt, apps/web/components/marketing/ProductVideo.tsx
  Depends: T1
- [x] `T4` — How it works: three statements and the pinned fragment, switched by IntersectionObserver. With reduced motion or no script, all states show in sequence (AC-4)
  Files: apps/web/components/marketing/HowItWorks.tsx, apps/web/components/marketing/HowStage.tsx
  Depends: T1
- [x] `T5` — Capability bands from `areas.ts`, each with a `role="switch"` that opens its claims. Remove the 062 Features, Trust, Problem and ChatPreview components (AC-5)
  Files: apps/web/components/marketing/Bands.tsx, apps/web/components/marketing/areas.ts, apps/web/components/marketing/Features.tsx, apps/web/components/marketing/Trust.tsx, apps/web/components/marketing/Problem.tsx, apps/web/components/marketing/ChatPreview.tsx
  Depends: T1
- [x] `T6` — The mock copy script ships `.specclaw/mock/media/` with `index.html` (AC-11)
  Files: apps/mock/scripts/copy-mock.mjs
- [x] `T7` — Tests and gates. e2e: section order, queue Accept with its attribution, the video plays (`currentTime` advances, no error), the theme switch, no overflow at 390 px with a wide fallback font, and axe in light and dark. The copy guards also read the 064 mock section. Lighthouse on the mobile production build (AC-1, AC-2, AC-3, AC-7, AC-8, AC-10)
  Files: apps/web/tests/e2e/marketing.spec.ts, apps/web/tests/e2e/marketing-video.spec.ts, apps/web/tests/e2e/marketing-theme.spec.ts, apps/web/tests/e2e/marketing-seo.spec.ts, apps/web/tests/marketing-prose.ts, apps/web/tests/marketing-queue.test.ts
  Depends: T2, T3, T4, T5

## Verify

Quality: 523 → 523 duplicated lines repo-wide, none in this change's files (refactor skipped).
Build note on AC-1: on a phone (390 px, Avenir Next) the hero headline sets on three lines; two lines would need about 25 px. The two-line check runs at 1440 and 768.
