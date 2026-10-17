# Platform skeleton: monorepo, module registry, design system, deploy anywhere

**Change:** 001-amax-foundation · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `apps/web, packages/ui, packages/core (skeleton), deploy/` · **Depends on:** none

## Problem

Every later change needs the same frame: a monorepo where each business area is a separate package, a web app that mounts modules from a registry, one design system, and builds that run on Vercel, Cloudflare and k3s. Without this, parallel teams and agent runs would collide in one Next.js app.

**Design direction (set in this change, followed by every later change):**
- **Look and feel (chosen by the user from a reference dashboard):**
  - Soft and airy: a lavender-white app frame with large radii (frame 36 px, cards 28 px, controls 12 px) and tinted shadows.
  - A left rail of icons that expands to show labels and group headings.
  - Pastel stat cards with notched edges and small illustrations.
  - Smooth area charts, a donut chart, segmented tabs, outlined buttons, and a yellow main button.
  - Geometric sans type (Avenir Next) with tabular numerals.
  - Light and dark themes, plus a phone layout with a bottom tab bar.
- **Every screen uses the home screen's design:** illustrated stat cards whose colour means something (violet neutral, mint good, yellow needs attention, pink problem) and that show a bar only against a real target, a chart wherever there are numbers (area lines, bars, donuts, funnels), illustrated faces for every person, coloured status labels with icons, and coloured sticker icons on stages (board lanes, proposal phases, hiring stages, pipeline stages).
- **Agents are always violet, people are always mint.** Every chart, row, card and time entry shows who did the work: an agent acting for a person, or the person.
- **Every screen opens with a sentence, not a widget.** "Ayesha is over-allocated in December" comes before the grid.
- **One amax chat for the whole app, and records are added through it.** It's a simple panel docked on the right that doesn't block the page: floating bubbles with a face and name under each, and the words amax used shown with a dashed outline. A big round amax button starts voice input, flanked by "pick from screen" and "new conversation", with a slim text box above. Every create button (new project, proposal, release, person, leave, role, programme, licence, ticket, opportunity, task, activity, risk, agent job) opens the chat for that kind of record. amax asks for what's missing, shows the record, and adds it after "Add it". Editing can stay as forms. ⌘K, the top search box and the amax button in the top bar all open the same chat. Answers show which MCP tools amax called.
- **Anything on screen can be added to the chat as context.** Cards, table rows, stat cards and stage cards each show a small pin button on hover. They can also be dragged onto the chat or the amax button, or clicked in pick mode. Each one becomes a removable chip, and amax answers using it.
- **The inbox agent fills data from Teams and email in the background.** It suggests records (here, new opportunities) with their source shown, and a person accepts, opens in chat, or dismisses each one. Nothing is saved without acceptance. The same rule covers every agent action (licence removal, access grants, payroll checks): the agent suggests with evidence and confidence, a person approves, and the change can be undone.
- **The release map** (projects as lines, environments as stations) lives on the Releases screen.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

The app shell: the expanding labelled rail grouped as Work, People, Business and Operations; the top bar with search, Ask amax and the profile menu; light and dark themes; and the phone tab bar with More. Module screens are empty states naming their change.

## Acceptance Criteria

1. **AC-1** pnpm workspaces and Turborepo hold `apps/web` (Next.js 16, App Router, standalone output), `packages/{core,db,auth,ui,mcp,chat,agents,testing}` and `modules/*`. `pnpm build`, `pnpm lint` and `pnpm test` pass at the root.
2. **AC-2** A module is a package with a `module.ts` manifest (id, nav entries, routes, permissions; the MCP tools, chat intents, jobs and fixtures slots can be empty for now). `apps/web` discovers modules at build time by scanning `modules/*/module.ts` (generated registry, git-ignored) and mounts them through a catch-all route, so a module change never edits a shared file. A sample `modules/hello` proves it: creating the folder is enough for it to appear in the rail and at `/hello`, and deleting the folder removes it cleanly.
3. **AC-3** An import-boundary rule fails CI when a module imports anything from another module except its `contracts.ts`. A test fixture with a forbidden import fails the check.
4. **AC-4** `@amax/ui` holds the design tokens as CSS variables (light and dark, contrast at least WCAG AA) and the components the mock uses: rail, top bar, cards, ticket stat cards, tables (stacked cards under 600 px), chips, segmented control, empty state, toast and live region. No component hard-codes a colour.
5. **AC-5** The shell matches the mock at 1440 px and 390 px within a 2% visual diff, with no horizontal scroll. It is keyboard-complete: skip link, `main` landmark, focus moved to the heading and announced on navigation, and reduced motion respected.
6. **AC-6** CI builds three targets on every pull request: Vercel (`vercel build`), Cloudflare (OpenNext `wrangler.jsonc` build) and a Docker image that starts and serves `/healthz`. `deploy/helm/amax` installs on k3s (checked with `helm template` and a kind or k3d smoke test).
7. **AC-7** Configuration is environment variables only, validated at boot with a clear error. `CODEOWNERS` maps `packages/` and `apps/web` to the platform team and has a commented template line per module folder. `docs/module-standard.md` is checked by a CI script that every module must pass.

## Tasks

- [ ] `T1` — Monorepo scaffold: pnpm workspaces + Turborepo, shared tsconfig, empty `packages/*` and `modules/`; move the GitHub Pages mock site to `apps/mock` and keep its deploy working (AC-1)
  Files: package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, apps/mock/**, packages/{core,db,auth,ui,mcp,chat,agents,testing}/package.json, .github/workflows/pages.yml, .gitignore
- [ ] `T2` — `@amax/ui`: design tokens (light/dark, AA contrast) and the shell components: rail, top bar, card, ticket stat card, table (stacked under 600 px), chip, segmented control, empty state, toast and live region (AC-4)
  Files: packages/ui/src/tokens.css, packages/ui/src/components/*.tsx, packages/ui/src/index.ts, packages/ui/tests/contrast.test.ts
  Depends: T1
- [ ] `T3` — `apps/web` shell matching the mock: expanding labelled rail with groups, top bar (search, Ask amax placeholder, profile menu with theme), phone tab bar with More, skip link, `main`, heading focus and announcement on navigation, reduced motion (AC-5)
  Files: apps/web/app/layout.tsx, apps/web/app/(app)/layout.tsx, apps/web/app/(app)/page.tsx, apps/web/components/shell/*.tsx, apps/web/next.config.ts
  Depends: T2
- [ ] `T4` — Module manifest type and build-time discovery: scan `modules/*/module.ts`, generate the git-ignored registry, mount through `app/(app)/[module]/[[...path]]`, nav from manifests; sample `modules/hello` (AC-2)
  Files: packages/core/src/module.ts, apps/web/scripts/gen-registry.mjs, apps/web/app/(app)/[module]/[[...path]]/page.tsx, modules/hello/**, apps/web/tests/registry.test.ts
  Depends: T3
- [ ] `T5` — Import boundaries: ESLint rule allowing modules only `@amax/*` platform packages and other modules' `contracts.ts`, with a failing fixture test (AC-3)
  Files: eslint.config.mjs, packages/testing/boundaries/**, packages/testing/tests/boundaries.test.ts
  Depends: T4
- [ ] `T6` — Config and ownership: zod-validated environment at boot with a clear error and `/healthz`; CODEOWNERS; `scripts/check-module-standard.mjs` run in CI (AC-7)
  Files: packages/core/src/env.ts, apps/web/app/healthz/route.ts, .github/CODEOWNERS, scripts/check-module-standard.mjs
  Depends: T4
- [ ] `T7` — Deploy anywhere: Vercel config, OpenNext Cloudflare build (`wrangler.jsonc`), Dockerfile (standalone, serves `/healthz`), Helm chart `deploy/helm/amax`, and a CI workflow building all three plus lint, test, boundaries, module standard and a k3d smoke install (AC-6, AC-1)
  Files: apps/web/vercel.json, apps/web/wrangler.jsonc, apps/web/open-next.config.ts, Dockerfile, deploy/helm/amax/**, .github/workflows/ci.yml
  Depends: T5, T6
- [ ] `T8` — Visual and accessibility checks: Playwright visual diff of the shell against the mock at 1440 and 390 px (≤2%), no horizontal scroll, keyboard and axe checks (AC-5)
  Files: apps/web/tests/e2e/shell.spec.ts, apps/web/playwright.config.ts, apps/web/tests/e2e/__screenshots__/**
  Depends: T3, T7

## Verify
