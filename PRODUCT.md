# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router, TypeScript, standalone output) in a pnpm and Turborepo monorepo. Each business area is a module package that a separate team can own. Postgres through Drizzle, Auth.js with OIDC (Entra ID first), S3-compatible files, jobs and events kept in Postgres.

Must deploy unchanged to Vercel, Cloudflare (OpenNext) or k3s (Docker image and Helm chart); no host-specific APIs in module code. See `docs/architecture.md`.

## Users

- **HR and payroll teams:** employee records, leave, pay runs and statutory filings.
- **Employees:** self-service for leave, payslips, letters and expenses.
- **PMs and delivery leads:** check what agents did, approve proposals and timesheets, unblock releases, and rebalance allocations.
- **Leadership:** portfolio health, utilisation, revenue and forecasts.
- **Finance:** contracts, invoicing milestones and payments.
- **Engineers:** do most of their work through agents (Claude Code + specclaw + MCP). They open the UI to review their own time and work.

Most activity happens through agents over MCP. People open the UI to see, decide and correct, not to type in data.

## Product Purpose

amax is an ERP for software and professional-services companies, covering delivery, people, payroll and money. It combines resource allocation, time tracking, financials, presales, utilisation and forecasting (the scope of Bistec Apex, which it replaces) with lightweight sprint tracking, specclaw proposal tracking, and releases promoted across environments. Success means the bookkeeping is done by agents: commits close tasks and log time, deployments move releases. People spend their time on decisions.

## Positioning

amax is agent-native project management. Every capability is an MCP tool with role-scoped permissions, and agent work (proposals, commits, deployments) flows in as first-class records attributed to the person each agent acts for. Incumbents (Jira, Monday, Asana, Kantata) are built for humans typing updates. The ambition is a leader position in its Gartner category.

## Operating Context

- specclaw changes (proposal → plan → build → verify → release) are the unit of work.
- Git commits map to people through linked git identities. People come from Microsoft Entra ID, and roles come from Entra groups.
- Releases are promoted Dev → QA → UAT → Prod, recorded by CI/CD pipelines, MCP calls or the UI.
- Commercial SaaS, multi-tenant.

## Capabilities and Constraints

- In scope (ERP for services firms, phased in `docs/roadmap.md`):
  - **Delivery (PSA):** projects and sprints, proposals, releases and environments, time and approvals, allocations and future allocations, forecasts.
  - **People:** HRM (core HR, org, onboarding/offboarding), leave and attendance, payroll with country packs (Sri Lanka and Australia first), recruitment, performance/OKRs, learning.
  - **Finance and sales:** contracts, billing and receivables, expenses, procurement, CRM and presales.
  - **Operations:** IT assets, compliance registers, analytics.
  - **Platform:** git-identity mapping and an MCP server covering every endpoint.
- Out of scope unless asked: staff outings, a native general ledger (integrate Xero, QuickBooks or Business Central instead).
- Multi-tenant and multi-entity from the first data model.
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
