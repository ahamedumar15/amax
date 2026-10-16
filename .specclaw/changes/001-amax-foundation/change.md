# amax foundation: app shell, Entra sign-in, domain skeleton and MCP pattern

**Change:** 001-amax-foundation · **Created:** 2026-10-16

## Problem

Bistec Apex (`Resource_Allocation_Tool`: Angular 20 + .NET 9, ~263 REST endpoints, ~201 MCP tools) covers projects, allocations, timesheets, finance, presales and reports, but humans drive every update by hand. amax rebuilds it from scratch as a Next.js app that agents drive: specclaw proposals, commits and releases flow in, time and progress are recorded from that work, and every capability has an MCP tool that can only do what the caller's Entra role allows. This change lays the foundation every later module builds on, and the mock draws the whole app.

**In scope for the overall product:** a services ERP. The full module list and phasing are in `docs/roadmap.md`. This change only builds the foundation; every other screen in the mock shows an empty state naming the change that fills it.

**Planned follow-up changes (one page each, proposed later):**
- **Delivery:** 002 specclaw + git ingestion (`mark_task_done`, `log_time`, commit → person mapping) · 003 releases and environment promotion · 004 time tracking and approvals · 005 allocations and forecasts · 006 financials · 007 presales · 008 reports · 009 sprints and board
- **People:** 010 core HR records · 011 leave and holidays · 012 onboarding/offboarding with access and licences · 013 expenses
- **Payroll:** 014 payroll engine · 015 Sri Lanka rules (EPF, ETF, APIT) · 016 Australia rules (PAYG, super, STP) · 017 accounting journals
- **Talent and operations:** 018 recruitment · 019 learning and development · 020 helpdesk · 021 Keyflow sister-product sync
- **Intelligence:** 022 insights agents (project risk, skills-to-opportunity, market position, world trends, recurring agent jobs)

**Ambition:** a leader-quadrant PM product. What sets amax apart is that it's agent-native: agents do the bookkeeping and people make the decisions. The UI has to make that visible at a glance, and it has to feel better crafted than Jira, Monday or Asana.

**Design direction (set in this change, followed by every later change):**
- **Look and feel (chosen by the user from a reference dashboard):**
  - Soft and airy: a lavender-white app frame with large radii (frame 36 px, cards 28 px, controls 12 px) and tinted shadows.
  - An icon-only left rail with labels shown as tooltips.
  - Pastel stat cards with notched edges and small illustrations.
  - Smooth area charts, a donut chart, segmented tabs, outlined buttons, and a yellow main button.
  - Geometric sans type (Avenir Next) with tabular numerals.
  - Light and dark themes, plus a phone layout with a bottom tab bar.
- **Every screen uses the home screen's design:** illustrated stat cards with progress bars, a chart wherever there are numbers (area lines, bars, donuts, funnels), illustrated faces for every person, coloured status labels with icons, and coloured sticker icons on stages (board lanes, proposal phases, hiring stages, pipeline stages).
- **Agents are always violet, people are always mint.** Every chart, row, card and time entry shows who did the work: an agent acting for a person, or the person.
- **Every screen opens with a sentence, not a widget.** "Ayesha is over-allocated in December" comes before the grid.
- **⌘K "Ask amax"** answers questions with the same MCP tools agents use and shows which tools it called.
- **"Fill with amax" instead of blank forms.** Creating a record opens a chat panel where you type or speak (browser speech recognition, in Sri Lankan and Australian English). amax pulls out the fields, shows a draft that fills in live, asks for what's missing, and adds the record. "Use a form" stays available, and the chat can hand its draft to the form for checking. The mock shows this for presales opportunities; the same pattern applies to people, leave, tickets, activities and time.
- **The inbox agent fills data from Teams and email in the background.** It suggests records (here, new opportunities) with their source shown, and a person accepts, opens in chat, or dismisses each one. Nothing is saved without acceptance.
- **The release map** (projects as lines, environments as stations) lives on the Releases screen.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

Replaces the template with the whole app on fake data. Screens switch from the left rail, which is grouped into Work, People, Business and Operations; ⌘K opens Ask amax. Every module screen is a team- or company-level list; one person or one project opens on its own detail page (with a breadcrumb back) or in a side panel:
- **Overview:** three stat cards, an hours chart (agents vs people), "Waiting on you", agent insights, delivery performance, a "where time went" donut, release readiness and agent activity.
- **Insights:** the weekly agent briefing, projects at risk with reasons, opportunities matched to the company's skills, talent growth, market position against peers, world trends to act on, and recurring agent jobs with on/off switches.
- **Projects:** the portfolio (health, progress, margin, next release); each project opens its own page with the sprint board.
- **Proposals, Releases, Allocations:** the proposal list, the release map and table, and the allocation grid.
- **Time:** team hours per day (agents vs people) and every person's timesheet for the week, with approve and remind; a switch for my own timesheet.
- **People:** headcount stats and the directory; each person opens a profile page with employment (pay masked), documents, leave balance, and their access and licences.
- **Leave:** team stats (on leave today, pending, booked, unused balance), a team calendar with holidays and pending requests, and approvals with clash checks.
- **Payroll:** pay-run steps, gross, net and statutory totals, changes explained by the payroll agent, run totals, and the payslip list; one payslip opens in a side panel (Sri Lanka, with an Australia switch).
- **Recruitment:** roles raised from demand, hiring stats and a candidate pipeline with agent match scores.
- **Learning:** programmes created, how many people took part, completion, certifications, a monthly participation chart and expiring certifications.
- **Presales** (modelled on Apex presales): "Found by agents in Teams and email" suggestions (Add, Open in chat, Dismiss), "Fill with amax" chat with voice, and a board by sales stage (New idea, Lead, Qualified, Proposal, Negotiation, Closed as won or lost) where you add an opportunity from a side panel, move it between stages, or remove it with confirmation. It also shows pipeline stats, pipeline value, and a feed of stage changes. Each opportunity has its own page with a stage stepper, details (client, account manager, presales lead, service, cost centre, value and currency, estimate, expected close, lead source, competitor), stage history with time in each stage and win-chance changes, activities, tasks, risks and issues, a win-chance chart, an agent's next-step suggestion, "Mark as lost" with a reason, and "Promote to delivery".
- **Financials, Reports:** contracts and invoicing, and utilisation.
- **Access and licences:** licence inventory (seats, assigned, active, cost, unused), agent savings suggestions, the Intune device summary, and a people-and-access table (groups, licences, devices, admin roles, last review, leavers, contractors).
- **Helpdesk:** IT, HR and facilities queues with SLA, plus tickets resolved by the support agent.
- **Integrations:** Keyflow as a two-way-sync sister product; Entra ID, Azure DevOps, Intune, Teams, Zoho Sign and accounting connectors; the MCP tool catalogue; and commit-author mapping.

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
