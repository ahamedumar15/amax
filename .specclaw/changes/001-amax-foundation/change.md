# amax foundation: app shell, Entra sign-in, domain skeleton and MCP pattern

**Change:** 001-amax-foundation · **Created:** 2026-10-16

## Problem

Bistec Apex (`Resource_Allocation_Tool`: Angular 20 + .NET 9, ~263 REST endpoints, ~201 MCP tools) covers projects, allocations, timesheets, finance, presales and reports, but humans drive every update by hand. amax rebuilds it from scratch as a Next.js app that agents drive: specclaw proposals, commits and releases flow in, time and progress are recorded from that work, and every capability has an MCP tool that can only do what the caller's Entra role allows. This change lays the foundation every later module builds on, and the mock draws the whole app.

**In scope for the overall revamp:** projects and sprints, specclaw proposal tracking, releases and environments, time tracking, allocations and forecasts, financials, presales, utilisation and reporting, git-identity mapping, and the MCP server.
**Out of scope (Apex features not carried over unless asked):** onboarding/offboarding, outings, email templates.

**Planned follow-up changes (one page each, proposed later):**
002 specclaw + git ingestion (MCP write tools: `mark_task_done`, `log_time`; commit → user mapping) ·
003 releases and environment promotion ·
004 time tracking and approvals ·
005 allocations, future allocations and forecasts ·
006 financials (contracts, invoicing, payments) ·
007 presales ·
008 utilisation and availability reports ·
009 sprints and board

**Ambition:** a leader-quadrant PM product. What sets amax apart is that it's agent-native: agents do the bookkeeping and people make the decisions. The UI has to make that visible at a glance, and it has to feel better crafted than Jira, Monday or Asana.

**Design direction (set in this change, followed by every later change):**
- **Look and feel (chosen by the user from a reference dashboard):**
  - Soft and airy: a lavender-white app frame with large radii (frame 36 px, cards 28 px, controls 12 px) and tinted shadows.
  - An icon-only left rail with labels shown as tooltips.
  - Pastel stat cards with notched edges and small illustrations.
  - Smooth area charts, a donut chart, segmented tabs, outlined buttons, and a yellow main button.
  - Geometric sans type (Avenir Next) with tabular numerals.
  - Light and dark themes, plus a phone layout with a bottom tab bar.
- **Agents are always violet, people are always mint.** Every chart, row, card and time entry shows who did the work: an agent acting for a person, or the person.
- **Every screen opens with a sentence, not a widget.** "Ayesha is over-allocated in December" comes before the grid.
- **⌘K "Ask amax"** answers questions with the same MCP tools agents use and shows which tools it called.
- **The release map** (projects as lines, environments as stations) lives on the Releases screen.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

Replaces the template with the whole app on fake data. Screens switch from the left rail, and ⌘K opens Ask amax:
- **Overview:** three stat cards (hours, proposals, ready to invoice), an hours-logged chart comparing agents and people, the "Waiting on you" table, delivery performance, a "where time went" donut, release readiness, and agent activity.
- **Projects:** a project with its sprint board, where specclaw proposals are cards grouped by phase.
- **Proposals:** the proposal list with phase, release tag and the environments each proposal has reached.
- **Releases:** releases × environments (Dev → QA → Prod), showing what has been promoted where.
- **Time:** entries logged automatically from commits and MCP calls (source column), with approval status.
- **Allocations & Forecast:** a monthly grid and future projections.
- **Financials:** contracts, invoicing milestones and payments.
- **Presales:** pipeline of opportunities.
- **Reports:** utilisation and availability.
- **Integrations:** MCP server endpoint and tool catalogue by role, and the git-identity → Entra user mapping.

## Acceptance Criteria

1. **AC-1** `npm run dev` starts a Next.js (App Router, TypeScript) app. `npm run build`, `npm run lint` and `npm test` pass.
2. **AC-2** A signed-out visitor to any page is redirected to Microsoft Entra ID sign-in. After sign-in, the header shows the user's name and their amax role.
3. **AC-3** Entra group membership maps to amax roles (Admin, PM, Finance, Sales, Engineer) through config, not hard-coded IDs. A unit test covers the mapping, including the case where a user is in no mapped group and is denied access.
4. **AC-4** The left navigation lists Overview, Projects, Proposals, Releases, Time, Allocations, Financials, Presales, Reports and Integrations. Items the user's role cannot see are hidden.
5. **AC-5** A Postgres schema created through Prisma migrations defines User (linked to the Entra object ID), GitIdentity, Project, Proposal (with specclaw phase), Release, Environment and TimeEntry. A seed script loads the mock's fake data.
6. **AC-6** The Projects, Proposals and Releases pages render the seeded rows from the database. The other pages render an empty state that names the follow-up change that fills them.
7. **AC-7** `/api/mcp` serves an MCP server (Streamable HTTP) that authenticates with the same Entra token. It exposes `whoami`, `list_projects` and `list_proposals`.
8. **AC-8** MCP tools and REST/server actions call one shared service layer that applies the same role check to both. A test proves a user without access to a project gets an error from both the page action and the MCP tool.
9. **AC-9** Design tokens (colour, type, spacing, radius) live in one place as CSS variables, with light and dark themes that follow the OS setting. No component hard-codes a colour.
10. **AC-10** The Overview renders its stat cards, hours chart (agents vs people) and donut from seeded data, and the Releases screen renders the release map from seeded releases and environments. A screenshot of the built app matches the mock at 1440 px and 390 px, compared by eye, and neither width scrolls horizontally.
11. **AC-11** ⌘K / Ctrl+K opens Ask amax. Typing a page name jumps to it. Asking "list my projects" calls the `list_projects` tool and shows the tool call above the answer.
12. **AC-12** Every screen is keyboard-navigable with a visible focus ring, honours `prefers-reduced-motion`, and scores at least 95 on Lighthouse Accessibility for Overview, Projects and Proposals.

## Tasks

## Verify
