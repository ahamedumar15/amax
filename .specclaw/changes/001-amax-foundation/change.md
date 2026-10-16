# amax foundation: app shell, Entra sign-in, domain skeleton and MCP pattern

**Change:** 001-amax-foundation · **Created:** 2026-10-16

## Problem

Bistec Apex (`Resource_Allocation_Tool`: Angular 20 + .NET 9, ~263 REST endpoints, ~201 MCP tools) covers projects, allocations, timesheets, finance, presales and reports, but humans drive every update by hand. amax rebuilds it from scratch as a Next.js app that agents drive: specclaw proposals, commits and releases flow in, time and progress are recorded from that work, and every capability has an MCP tool that can only do what the caller's Entra role allows. This change lays the foundation every later module builds on, and the mock draws the whole app.

**In scope for the overall product:** a services ERP. The full module list and phasing are in `docs/roadmap.md`.

**What approving 001 approves:** the foundation (shell, sign-in, roles and data scopes, the data model with tenancy, entities and audit, the MCP pattern, the design system, the chat create loop) and the Projects, Proposals and Releases screens. The other screens in the mock set the direction only. In the built app they show an empty state naming the change that fills them, and each one is approved again in its own change.

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
3. **AC-3** Entra group membership maps to amax roles through config, not hard-coded IDs. The roles are Admin, Leadership, PM, Engineer, Finance, Sales, HR, Payroll and Employee, and a person can hold several. A unit test covers the mapping, including a user in no mapped group, who is denied access.
4. **AC-4** Every role has data scopes: legal entity, department, and the projects the person manages or is on. Pay fields (salary, payslip amounts, bank details) are hidden by field, everywhere, unless the role is Payroll or Admin, or the record is the user's own. A test proves a PM gets an error from both the page and the MCP tool when reading another person's pay, and sees masked values in lists.
5. **AC-5** The left navigation shows only the screens the user's roles allow, grouped as Work, People, Business and Operations. Each item has a visible label when the rail is expanded, and a tooltip when it's collapsed.
6. **AC-6** A Postgres schema created through Prisma migrations defines Tenant, LegalEntity (with country and base currency), User (linked to the Entra object ID), Role assignment, GitIdentity, Project, Proposal (with specclaw phase and a project-scoped key such as `CON-014`), Release, Environment, TimeEntry and AuditEvent. Every business table carries `tenant_id`; entity-owned tables carry `legal_entity_id`; money is stored with a currency code.
7. **AC-7** Every write records an AuditEvent: who acted, on whose behalf (for an agent, the person it acts for), when, what changed (before and after), and the source (UI, chat, MCP, pipeline or inbox agent). A record's history can be read from the page and through MCP.
8. **AC-8** One seed source (`seed/fixtures.ts`) holds all demo data, and every number shown in the mock is derived from it. A test checks the cross-screen totals: hours, utilisation (billable ÷ available), proposal phase counts, pipeline and headcount. Demo names and IDs are fictional.
9. **AC-9** The Projects, Proposals and Releases pages render seeded rows from the database. The other pages render an empty state that names the follow-up change that fills them.
10. **AC-10** `/api/mcp` serves an MCP server (Streamable HTTP) that authenticates with the same Entra token. It exposes `whoami`, `list_projects`, `list_proposals` and `create_project`.
11. **AC-11** MCP tools, server actions and the chat all call one shared service layer, which applies the same role and data-scope check and writes the AuditEvent. A test proves a user without access to a project gets the same error from the page action, the MCP tool and the chat.
12. **AC-12** The amax chat opens from ⌘K / Ctrl+K, the search box and the amax button in the top bar. Escape closes it, and focus returns to where it was. "New project" opens the chat in project mode. From text or speech, amax fills a draft, asks for missing fields, and shows a confirm card. "Add it" creates the project through the shared service, with audit source "chat". "Change something" and "Cancel" write nothing.
13. **AC-13** Agents never make a change on their own. Agent output is a suggestion with evidence, a confidence level and a source; a person with the right role accepts or dismisses it. Accepted changes can be undone for 7 days, and both the agent and the approving person are recorded in the audit.
14. **AC-14** Any card, table row or stat card can be added to the chat as context: with a labelled "Add <name> to chat" button (visible on focus and on touch, not only on hover), by dragging, or with pick mode. The chat answers using the pinned records, fetched through MCP with the user's permissions.
15. **AC-15** Design tokens (colour, type, spacing, radius) live in one place as CSS variables, with light and dark themes. The theme follows the OS setting and can be changed in the profile menu; the choice persists. No component hard-codes a colour. Text and controls meet WCAG 2.2 AA contrast in both themes.
16. **AC-16** The Overview renders its stat cards, hours chart (agents vs people) and donut from seeded data, and the Releases screen renders the release map. At 1440 px and 390 px, a visual diff against the mock stays under a 2% pixel difference, and neither width scrolls horizontally. Below 600 px, tables become stacked cards.
17. **AC-17** Every screen is keyboard-complete: switches, tabs, menus, the chat, pin buttons and board moves all work by keyboard. Changing screens moves focus to the page heading and announces it. Every screen honours `prefers-reduced-motion`, including looping animations, and scores at least 95 on Lighthouse Accessibility for Overview, Projects and Proposals.

## Tasks

## Verify
