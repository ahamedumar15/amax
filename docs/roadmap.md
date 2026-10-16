# amax roadmap: from agent-native PSA to services ERP

amax is an independent, multi-tenant product for **software and professional-services companies**: delivery, people, time, payroll and money in one system. Every capability is exposed over MCP, so agents do the record-keeping and people make the decisions.

The category it competes in is **PSA + HCM + services finance**, against Kantata, Certinia, Scoro, Odoo and Zoho People/Payroll, plus point tools such as Jira, BambooHR and Xero. What sets amax apart: agents create the records (commits log time, deployments move releases, approved hours become invoices), and one permission model covers both the UI and MCP.

## Platform (cross-cutting, built first)

| Capability | Why it matters for an ERP |
|---|---|
| Multi-tenant, multi-entity, multi-currency | A customer runs several legal entities (e.g. Sri Lanka + Australia) in one tenant |
| Identity: any OIDC (Entra ID, Google Workspace, Okta), SCIM user sync | Independent product; Entra is just the first connector |
| Roles + data scopes (entity, department, project) + field-level masking (salary) | HR and payroll data need finer permissions than delivery data |
| Approval/workflow engine | Leave, timesheets, expenses, offers, pay runs and releases all use one engine |
| Audit log on every write, with the acting agent and the person it acts for | Needed for ISO 27001, SOC 2 and payroll audits |
| MCP server covering every endpoint, plus webhooks and a REST API | Core to the product's positioning |
| "Fill with amax": chat and voice capture for every create flow, producing a reviewable draft | Records come from conversation, not forms |
| Inbox agent: background ingestion from Teams and Outlook (scoped channels and mailboxes, admin consent), suggestions a person accepts | Data arrives without anyone typing it |
| Country packs | Holidays, leave rules, tax, statutory funds and filing formats, plugged in per country |
| Notifications: email, Teams, Slack; Teams/Slack app; mobile web | People act where they already are |
| Documents and e-signature (provider integration) | Contracts, offers, letters, policies |

## Modules

### 1. Delivery (PSA core): changes 001–009
Projects, sprints and board, specclaw proposals, releases and environment promotion, risk/issue (RAID), change and decision logs, milestones, git and CI ingestion, git-identity mapping.

### 2. Resource management
Allocations, future allocations, bench, skills matrix, availability, capacity vs demand forecast, "who can staff this?" search (an agent can ask it over MCP).

### 3. Time and attendance
Agent-logged timesheets and approvals. **Leave**: policies, accruals, balances, carry-over, approvals and public-holiday calendars per country. Attendance and biometric import, work-from-home logs, overtime.

### 4. HRM (core HR)
Employee record, org chart, positions, employment contracts and history, documents, probation, confirmations, transfers, promotions. Employee self-service: profile, letters (employment and salary confirmations), payslips, leave. Onboarding/offboarding checklists across HR, IT and Admin, plus exit interviews.

### 5. Payroll
Pay components, pay groups, pay runs with variance checks, payslips, bank payment files, payroll journals to the GL, final settlements.
- **Sri Lanka pack:** APIT/PAYE, EPF (8% employee, 12% employer), ETF (3%), monthly C-form and returns, gratuity.
- **Australia pack:** PAYG withholding, Superannuation Guarantee, Payday Super (super paid with wages from 1 July 2026), Single Touch Payroll Phase 2.
- Then other countries through the country-pack SDK.

Agent angle: a payroll agent explains every change from last month ("+LKR 12,400 because of 6 h overtime") before a person approves the run.

### 6. Talent
- **Recruitment (ATS):** job requisitions raised from resource demand and bench forecasts, pipeline, interviews, scorecards, offers with e-signature, hire → employee record.
- **Performance:** provided by the sister product Keyflow (see below).
- **Learning and development:** programmes, who took part, completion, hours, certifications with expiry, and skills growth linked to the skills matrix.

### 7. Finance (services finance)
- **Contracts:** fixed price, time and materials, retainers.
- **Billing:** time-and-materials invoices built from approved time; milestone invoices triggered when a release reaches Prod. Accounts receivable and collections with reminders.
- **Costs and planning:** expenses and reimbursements (receipt capture), vendor bills, procurement and approvals, budgets.
- **Project profitability:** revenue against the real cost of time, using rates from payroll.
- **Ledger:** integrate the GL first (Xero, QuickBooks, Business Central) through posted journals, rather than building a general ledger.

### 8. CRM and presales
Leads, accounts, opportunities, weighted pipeline, presales activities and RAID items, proposal tracking, win → project conversion, partner/referral programs.

### 9. IT and assets
Asset register and assignment linked to onboarding/offboarding, plus device-management sync (Intune and similar tools).

### 10. Governance and compliance
Policy library with read-and-acknowledge tracking, ISMS registers (risks, incidents, assets, suppliers), and audit evidence export (ISO 27001, SOC 2).

### 11. Access and licences
One place per person for everything they can use: Entra groups and roles, Microsoft 365 and other SaaS seats, Azure DevOps and GitHub access, cloud roles, and Intune devices. Includes licence spend, unused-seat detection, access reviews, and revocation on the person's last day.

### 12. Helpdesk
IT, HR and facilities queues with SLAs, tickets from Teams and email, and a support agent that resolves access requests, password resets and HR letters on its own.

### 13. Insights (agent intelligence)
Recurring agent jobs that write a weekly briefing:
- Projects at risk, with reasons and confidence.
- Opportunities matched against the company's skills.
- Talent growth: headcount, skills, attrition and promotions.
- Market position: win rate, share of voice, reviews against peers.
- World trends to take on, watch or skip.

Every insight links to its evidence, and people can switch each job on or off.

### Sister product: Keyflow
OKRs, check-ins, feedback and recognition live in Keyflow, which syncs both ways with amax (people and teams out; goals, review scores and recognition in).

### 14. Analytics
Utilisation, margins, revenue forecast, headcount and attrition, payroll cost, cash flow, plus executive dashboards, scheduled reports and a BI export (Power BI, Fabric).

## Proposed phasing (specclaw changes)

| Phase | Changes | Outcome |
|---|---|---|
| 1. PSA core | 001–009 | Replaces the delivery tool (projects, time, allocations, releases, presales basics) |
| 2. People | 010 core HR records, 011 leave and holidays, 012 on/offboarding with access and licences, 013 expenses | Replaces the HRIS for everything except pay |
| 3. Payroll | 014 payroll engine, 015 Sri Lanka pack, 016 Australia pack, 017 GL journal integration | Replaces the payroll system |
| 4. Talent, operations and intelligence | 018 recruitment, 019 learning and development, 020 helpdesk, 021 Keyflow sync, 022 insights agents | Replaces the ATS and the helpdesk; adds agent intelligence |
| 5. Revenue and scale | 023 CRM pipeline, 024 billing and AR, 025 self-serve tenant sign-up, 026 country-pack SDK, 027 Teams/Slack app, 028 compliance registers | Closes the quote-to-cash loop; ready for customers outside the first market |

**Tenancy and entities must be in the 001 data model** (`tenant_id` and `legal_entity_id` on every table). Adding them later means rewriting every query and permission.
