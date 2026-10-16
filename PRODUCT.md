# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, TypeScript). Chosen by the user at specclaw init (preset `nextjs`). Database proposed as Postgres + Prisma, not yet confirmed (the predecessor used SQL Server).

## Users

- **PMs and delivery leads:** check what agents did, approve proposals and timesheets, unblock releases, and rebalance allocations.
- **Leadership:** portfolio health, utilisation, revenue and forecasts.
- **Finance:** contracts, invoicing milestones and payments.
- **Engineers:** do most of their work through agents (Claude Code + specclaw + MCP). They open the UI to review their own time and work.

Most activity happens through agents over MCP. People open the UI to see, decide and correct, not to type in data.

## Product Purpose

amax is a project-delivery platform for software services companies. It combines resource allocation, time tracking, financials, presales, utilisation and forecasting (the scope of Bistec Apex, which it replaces) with lightweight sprint tracking, specclaw proposal tracking, and releases promoted across environments. Success means the bookkeeping is done by agents: commits close tasks and log time, deployments move releases. People spend their time on decisions.

## Positioning

amax is agent-native project management. Every capability is an MCP tool with role-scoped permissions, and agent work (proposals, commits, deployments) flows in as first-class records attributed to the person each agent acts for. Incumbents (Jira, Monday, Asana, Kantata) are built for humans typing updates. The ambition is a leader position in its Gartner category.

## Operating Context

- specclaw changes (proposal → plan → build → verify → release) are the unit of work.
- Git commits map to people through linked git identities. People come from Microsoft Entra ID, and roles come from Entra groups.
- Releases are promoted Dev → QA → UAT → Prod, recorded by CI/CD pipelines, MCP calls or the UI.
- Commercial SaaS, multi-tenant.

## Capabilities and Constraints

- In scope: projects and sprints, proposals, releases and environments, time and approvals, allocations and future allocations, forecasts, contracts/invoicing/payments, presales pipeline, utilisation/availability/effort-variance reports, git-identity mapping, and an MCP server covering every endpoint.
- Out of scope unless asked: onboarding/offboarding, outings, email templates (all from Apex).
- The UI must expose every capability and rich visualisations even though agents are the primary channel.
- Roles (initial): Admin, PM, Finance, Sales, Engineer.

## Brand Commitments

amax has its own product identity, independent of Bistec. There are no existing logo or brand assets.

## Evidence on Hand

No customers, testimonials or benchmarks yet. Mock data must stay clearly fictional.

## Product Principles

1. Agents record, people decide. The UI is built around review and decision, not data entry.
2. Every record says who did it: an agent acting for a person, or the person.
3. One permission model. The UI and MCP enforce the same rules.
4. Every screen leads with what needs attention, then the detail.

## Accessibility & Inclusion

WCAG 2.2 AA. Keyboard-complete. Respects reduced motion. Light and dark themes.
