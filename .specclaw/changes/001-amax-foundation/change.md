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
2. **AC-2** A module is a package with a `module.ts` manifest (id, nav entries, routes, permissions; the MCP tools, chat intents, jobs and fixtures slots can be empty for now). `apps/web` mounts modules through one registry file and a catch-all route. A sample `modules/hello` proves it: adding it is one line, and it shows up in the rail and at `/hello`.
3. **AC-3** An import-boundary rule fails CI when a module imports anything from another module except its `contracts.ts`. A test fixture with a forbidden import fails the check.
4. **AC-4** `@amax/ui` holds the design tokens as CSS variables (light and dark, contrast at least WCAG AA) and the components the mock uses: rail, top bar, cards, ticket stat cards, tables (stacked cards under 600 px), chips, segmented control, empty state, toast and live region. No component hard-codes a colour.
5. **AC-5** The shell matches the mock at 1440 px and 390 px within a 2% visual diff, with no horizontal scroll. It is keyboard-complete: skip link, `main` landmark, focus moved to the heading and announced on navigation, and reduced motion respected.
6. **AC-6** CI builds three targets on every pull request: Vercel (`vercel build`), Cloudflare (OpenNext `wrangler.jsonc` build) and a Docker image that starts and serves `/healthz`. `deploy/helm/amax` installs on k3s (checked with `helm template` and a kind or k3d smoke test).
7. **AC-7** Configuration is environment variables only, validated at boot with a clear error. `CODEOWNERS` maps `packages/` and `apps/web` to the platform team and has a commented template line per module folder.

## Tasks

## Verify
