# Marketing site: a public landing page that sells amax, with a short product video

**Change:** 062-marketing-site · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `apps/web (public route, proxy), packages/auth (public paths)` · **Depends on:** [001](../archive/001-amax-foundation/change.md)

## Problem

A signed-out visitor who opens amax lands on the sign-in screen. Nothing tells a prospect what amax is, who it is for or why agent-native beats Jira, Monday or Kantata. We need a public page that sells the product, and shows it working, before anyone has an account.

## Mock Delta

What changes on screen, and where to see it: [`062-marketing-site`](../../mock/index.html#062-marketing-site)

A new public page with no app navigation: no rail, top bar or chat launcher. Top bar: logo, Features, How it works, Security, Sign in, "Book a demo". Hero: "Agents keep the records. People decide." with a 40-second product video (poster, play button, captions). Then: the problem (busywork in incumbent tools), how it works in three steps (agents write through MCP, amax asks before it changes anything, people review and decide), a feature grid by area (Delivery, People and payroll, Finance and sales, Operations, Platform), a trust band (every write attributed and audited, role-scoped MCP, region pinning, WCAG 2.2 AA), an "Ask amax" chat preview, and a closing call to action. All sample data is fictional. No testimonials, logos or numbers we don't have.

## Acceptance Criteria

1. **AC-1** A signed-out request to `/` gets the marketing page (HTTP 200, no redirect to `/signin`). A signed-in request to `/` still gets the app overview. Playwright checks both.
2. **AC-2** The page is public: it is listed in `isPublicPath`, renders without a database or session, and loads no app-shell, chat or tenant data. A unit test covers the new public path.
3. **AC-3** Sections in order: hero with video, problem, how it works (3 steps), features (5 areas, each naming real modules from `docs/roadmap.md` and marking unbuilt ones "Coming"), trust, chat preview, closing CTA, footer. Every claim matches `PRODUCT.md` or shipped modules. There are no testimonials, customer logos or invented metrics (rule 7).
4. **AC-4** "Sign in" links to `/signin`. "Book a demo" is a `mailto:` link whose address comes from config (`AMAX_SALES_EMAIL`), and the button hides when that is unset. The page has no forms (rule 1).
5. **AC-5** The product video is a 30–45 s MP4 (H.264, ≤ 8 MB) plus a WebM, recorded from the demo app with fictional data. It ships with a poster image and a WebVTT captions track. It does not autoplay with sound, it never autoplays under `prefers-reduced-motion`, and it has keyboard-reachable native controls.
6. **AC-6** WCAG 2.2 AA: axe reports no violations in light and dark themes. The page is keyboard-complete with a skip link and visible focus, and it has no horizontal scroll at 390 px.
7. **AC-7** SEO and sharing: the page sets title, description, canonical URL and Open Graph and Twitter tags with a 1200×630 image, and `robots.txt` and `sitemap.xml` list it. The app routes stay `noindex`.
8. **AC-8** Performance: Lighthouse on the production build scores ≥ 90 for performance and 100 for accessibility on mobile. The video loads lazily (`preload="none"` or `metadata`), so it adds no weight before the visitor presses play.
9. **AC-9** The page uses the app's design tokens (colour, radius, font, mascot) from `packages/ui`, so brand changes reach it with no separate stylesheet.
10. **AC-10** The page shows no app navigation: no rail, top bar, search, chat launcher or profile. Playwright asserts that none of them render for a signed-out visitor at `/`.
11. **AC-11** It is as colourful as the overview. The five feature areas use the overview ticket gradients (violet, mint, yellow, sky, pink) with the mock's 3D art. The hero, video poster and closing CTA use the brand mint-to-violet gradient.
12. **AC-12** The video is made with `brag` in the amax brand: logo, mascot, mint-to-violet gradient, the app font and the ticket colours. Its frames show real amax screens with fictional data.

## Open questions

- **Video tool:** `brag`, in brand (AC-12).
- **Domain:** should the marketing page live on the same host as the app (`/`), or on its own host (for example `amax.app` with the app on `app.amax.app`)? Default: same host.

## Tasks

- [ ] `T1` — Marketing page UI matching the mock: hero, problem, how it works, feature tickets with art, trust band, chat preview, CTA and footer, using `packages/ui` tokens, `Logo`, `Mascot` and the ticket gradients. No app shell, no forms, and the demo link reads from `AMAX_SALES_EMAIL` (AC-3, AC-4, AC-6, AC-9, AC-10, AC-11)
  Files: apps/web/app/welcome/page.tsx, apps/web/app/welcome/welcome.module.css, apps/web/components/marketing/ProductVideo.tsx
- [ ] `T2` — Product video made with `brag` (`brag-slim`) in brand. Inputs: logo, mascot, mint-to-violet gradient, app font, ticket colours, and screenshots of the demo app with fictional data. Outputs: an MP4 (H.264, ≤ 8 MB), a WebM, a poster and WebVTT captions. `ProductVideo` uses native controls, `preload="none"`, and no autoplay under reduced motion (AC-5, AC-8, AC-12)
  Files: apps/web/public/marketing/amax-product.mp4, apps/web/public/marketing/amax-product.webm, apps/web/public/marketing/amax-product-poster.jpg, apps/web/public/marketing/amax-product.en.vtt, apps/web/components/marketing/ProductVideo.tsx
  Depends: T1
- [ ] `T3` — Routing: `/welcome` is a public path, and a signed-out `/` is rewritten (not redirected) to `/welcome`. A signed-in `/` still reaches the app overview. Update the gate unit tests (AC-1, AC-2)
  Files: packages/auth/src/gate.ts, packages/auth/tests/ac1-signin.test.ts, apps/web/proxy.ts
- [ ] `T4` — SEO: metadata, canonical URL, Open Graph and Twitter tags with a 1200×630 image, `robots.ts` and `sitemap.ts` listing only the public page, and `noindex` on the `(app)` layout (AC-7)
  Files: apps/web/app/welcome/page.tsx, apps/web/app/welcome/opengraph-image.png, apps/web/app/robots.ts, apps/web/app/sitemap.ts, apps/web/app/(app)/layout.tsx
- [ ] `T5` — Playwright: a signed-out `/` shows the marketing page with no rail, top bar or chat. A signed-in `/` shows the overview. axe passes in light and dark, there is no horizontal scroll at 390 px, the video has controls and captions, and a visual snapshot is taken. Run Lighthouse on mobile (AC-1, AC-5, AC-6, AC-8, AC-10)
  Files: apps/web/tests/e2e/marketing.spec.ts
  Depends: T1, T2, T3, T4

## Verify
