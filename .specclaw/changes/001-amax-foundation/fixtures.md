# Demo fixtures (single source of truth for the mock and the AC-8 seed)

Every number in `.specclaw/mock/index.html` must come from this sheet. Totals are worked out below so they can be checked.

## Calendar

- "Today" is **Friday, Oct 16, 2026**, mid-afternoon. The Oct 17 Saturday on the clock is ignored.
- ISO week 42 runs **Mon Oct 12 to Sun Oct 18**. The Time screen covers Mon Oct 12 to Fri Oct 16. Friday is "today, in progress".
- Sprint 18 runs **Mon Oct 12 to Fri Oct 23**.
- October to date has 12 working days (Oct 1 to 16), which is 96 h available per full-time person.

## Tenant and people (all fictional)

- **Tenant:** Lumen Labs. Entities: **Lumen Labs Lanka (Pvt) Ltd** (Sri Lanka, LKR, 171 people) and **Lumen Labs Pty Ltd** (Australia, AUD, 13 people). Headcount **184**.
- **IDs:** employees `LL-0417`; devices `LL-LT-0388`.
- **Signed-in user:** **Maya Fernando** (initials MF), Delivery manager. Roles PM and Leadership, and Admin for the demo (see "View as").
- **Maya's team on the Time screen:** Nimal Silva (NS, tech lead), Kasun Dias (KD, senior engineer), Ayesha Rahman (AR, QA lead), Tharushi Wijesinghe (TW, associate engineer, probation ends Oct 31), and Dinesh Wickrama (DW, software engineer, joined Oct 5).
- **Liam Murphy** (LM) is Account director in Australia, managed by Sarah Chen. He is not on Maya's timesheet list.
- **Others:** Sahan Kumara (SK, IT, Global admin), Rizwan Farook (RF, left Sep 30), and Mohamed Rifkhan (MR, joins Nov 2).

## Team time, week 42 (Mon to Fri)

| Person | Mon | Tue | Wed | Thu | Fri | Total | From agents | Status |
|---|---|---|---|---|---|---|---|---|
| Nimal | 8.0 | 8.5 | 7.0 | 8.0 | – | 31.5 | 71% | Submitted |
| Kasun | 8.0 | 8.0 | 8.0 | 7.5 | 1.0 | 32.5 | 78% | Submitted |
| Ayesha | 7.5 | 8.0 | – | 8.0 | – | 23.5 | 44% | Submitted (on casual leave Fri) |
| Tharushi | 7.0 | 8.0 | 8.0 | 6.0 | – | 29.0 | 66% | Draft |
| Dinesh | 7.6 | 7.6 | 7.6 | 2.2 | – | 25.0 | 52% | Draft |

- **Team total 141.5 h.** Agent hours: 22.4 + 25.4 + 10.3 + 19.1 + 13.0 = **90.2 h, which is 64%**.
- **Submitted:** 3 people, **87.5 h**.
- **By project:** Contoso Portal 68.0, Fleet Tracker 51.5, HR Insights 22.0, which adds up to 141.5.
- **Per-day totals:** Mon 38.1, Tue 40.1, Wed 30.6, Thu 31.7, Fri 1.0. Allocated 200 h (5 × 40).
- **Overview uses the same team numbers.** "Hours this week 141.5, 64% logged by agents". The lede says agents logged 90 h of the team's 141.5 h this week.
- **Hours chart, weeks 31–42 (team).**
  - Agents: 52, 58, 61, 70, 74, 80, 88, 96, 101, 104, 108, **90**.
  - People: 120, 116, 112, 110, 104, 100, 96, 90, 88, 86, 84, **51.5**.
  - Week 42 is to date. Tooltip: "90 h by agents so far". Max 200.
- **Donut "Where time went", 141.5 h:** Building 41%, Reviews 18%, Meetings 23%, Support 18%.

## Utilisation (Reports): billable ÷ available, October to date

| Person | Available | Logged | Billable | Utilisation |
|---|---|---|---|---|
| Nimal | 96 h | 98.5 h | 88.0 h | 92% |
| Kasun | 80 h (2 days medical) | 78.0 h | 70.0 h | 88% |
| Ayesha | 88 h (1 day casual) | 84.0 h | 64.0 h | 73% |

- **Team: 222 ÷ 264 = 84%.** The 12-month trend ends at 84 (October to date). Target 80%.
- Where the Overview or Insights mention team utilisation, use 84%.

## Proposals (project-scoped keys)

- **In flight: 37 = Proposed 6 + Planned 4 + Building 18 + Verified 9.** Released this month: 5, counted separately.
- **"Released" means reached Prod.**
  - CON-010 Email digest is **Verified** and in QA. On the board it sits in the Verified column, which therefore has 2 cards.
  - CON-009 Reports v2 is the only Released card.
- **Keys:**
  - Contoso Portal: CON-009, CON-010, CON-011, CON-012, CON-013, CON-014, CON-016, CON-017.
  - Fleet Tracker: FLT-015.
- Use these keys everywhere: the board, Proposals, Overview, chat examples and payroll overtime text.

## Releases and event order

| Release | Dev | QA | UAT | Notes |
|---|---|---|---|---|
| Contoso v2.4.0 | Mon Oct 12 | Thu Oct 15, testing | – | Contains CON-012 (verified and tagged Tue Oct 13) and CON-010 |
| Fleet v1.8.0 | Oct 8 | Oct 12 | Rolled back Wed Oct 14 (smoke test "upload over 20 MB" failed, pipeline run 1190) | Waiting on Maya: "2 d" |
| HR Insights v0.9.2 | Sep 22 | Sep 25 | Sep 29 | Prod Oct 1 |

## Pipeline (USD base; the original currency is shown when it isn't USD)

- **Open on the board:**
  - Fabrikam, Data platform phase 2: $320,000, Qualified, 30%.
  - Northwind Insurance, Claims copilot: $180,000, Proposal, 60%.
  - Contoso, Support retainer: $96,000, Negotiation, 80%.
- **Open total $596,000; weighted $280,800, which is 47%.**
- **Suggested by the inbox agent:**
  - Adatum: AUD 85,000 (≈ $56,000).
  - Woodgrove Bank: $60,000.
- **Closed:**
  - Won: Northwind HR, HR Insights retainer, **$144,000, won Jun 2**.
  - Lost: Tailspin, $150,000, Sep 26, lost on price.
- **Pipeline chart (USD k):**
  - Total: 410, 455, 470, 520, 560, **596**.
  - Weighted: 190, 215, 236, 262, 270, **281**.
  - Label the axis "$k".
- **Win chance history for Northwind:** 10% (Aug 4) → 20% (Aug 7) → 30% (Aug 21) → 40% (Sep 12) → 60% (Oct 2).
  - Stage history and the win-chance chart must log every step.
  - Health is calculated, not typed: a high-impact open risk makes it **amber**.

## Finance (USD)

- **Contoso Portal:** fixed price $420,000, 55% invoiced ($231,000). The next invoice, $60,000, is due when v2.4.0 reaches Prod.
- **Fleet Tracker:** time and materials at $45/h, capped at $210,000, 72% invoiced ($151,200).
  - INV-0912 for $18,315 covers **September** hours. It was issued Sep 15, was due Oct 7, and is **9 days overdue**.
  - October hours to date: **$14,200**, not yet invoiced.
- **HR Insights:** retainer of $12,000 a month, $144,000 for 12 months, started Jul 1. Jul–Sep invoiced = **$36,000, which is 25%**; October's $12,000 is ready to invoice.
- **Totals:** contract value **$774,000**; invoiced **$418,200, which is 54%**; overdue **$18,315**.
- **Overview ticket "Ready to invoice": $26,200.** That is Fleet October hours $14,200 plus the HR Insights October retainer $12,000. No bar.
- **Invoiced per month ($k):** May 61, Jun 74, Jul 58, Aug 82, Sep 77, **Oct 26 (to date, partial)**. Target 80.
- **Projects ticket "Average margin":** revenue-weighted **36.4%** (Contoso 38.2%, Fleet 29.6%, HR 41.0%).

## Headcount and talent

- **Headcount growth:** 156 on Jan 1 to 184 now = **+28 net, which is 17.9%**.
- **Joiners Jan–Oct:** 5, 4, 5, 4, 4, 4, 6, 4, 3, 3, which is 42.
- **Leavers Jan–Oct:** 2, 1, 3, 1, 2, 1, 2, 1, 1, 0, which is 14.
- **Q4 so far:** 3 joiners and 0 leavers. 2 more join Nov 2.
- **Headcount series Jan–Oct:** 159, 162, 164, 167, 169, 172, 176, 179, 181, 184.
- **People with AI skills:** 12, 14, 17, 19, 24, 28, 31, 35, 39, 44.
- **Departments, adding up to 184:** Engineering 112, Quality 24, Delivery 14, Sales 9, People and Culture 8, Finance 6, IT 6, Leadership 5.
- **Bench in January: 6 people.** By skill: .NET 3, React 1, QA 1, Data 1.
  - The Insights briefing and the Allocations donut both say 6.
  - Capacity vs demand (delivery people), Oct to Mar:
    - Capacity: 140, 141, 142, 142, 143, 144.
    - Demand: 138, 140, 141, 136, 138, 141.
- **Allocations:**
  - Nimal: Contoso 50%, Fleet Tracker 50%. He manages Fleet.
  - Kasun: Fleet 80%, Contoso 20%.
  - Ayesha: Contoso 50% and HR Insights 50%, rising to 70% in December. Show per-person totals; her December total is 120%, flagged red.
- **Learning:**
  - 18 programmes.
  - **184 people did mandatory ISO 27001.**
  - **126 people (68%)** took part in optional programmes. Label the stat card "People in optional programmes".
- **Recruitment:**
  - Funnel, this quarter (cumulative): Applied 63, Screened 41, Interviewed 19, Offered 5, Hired 4.
  - Board columns show the **current** pipeline: Applied 22, Screening 9, Interviews 5, Offer 1, Hired this quarter 4. Each column shows 1–2 cards plus a "+N more" row.

## Leave

- **Everyone:** on leave today (Fri Oct 16) **6**: 3 annual, 2 casual, 1 medical.
- **Team calendar (Maya's team):** marks **today** and shows Ayesha's casual leave on Oct 16.
- **Nimal's pending request is Oct 27–30.** Use the same dates in Insights.
- **"Waiting for approval: 2, 1 clashes with a release".**
- **Unused annual leave:** 812 days ≈ **LKR 9.4M liability**. Sri Lankan entity only; label it that way.
- The leave types come from the country pack (Sri Lanka: annual 14, casual 7, medical 7, lieu).

## Payroll, Sri Lanka, October (LKR)

- **Run totals:**
  - 171 people, gross **48,620,400**, EPF base 45,000,000.
  - EPF employee 8% = 3,600,000; EPF employer 12% = 5,400,000; ETF 3% = 1,350,000.
  - APIT 5,950,400.
  - Net to banks = 48,620,400 − 3,600,000 − 5,950,400 = **39,070,000**.
- **Statutory ticket:** EPF 9.00M + ETF 1.35M + APIT 5.95M = **LKR 16.30M**. APIT is due **Nov 15**; EPF and ETF are due **by Nov 30**.
- **Donut "Where the money goes":** Net 39.07, APIT 5.95, EPF employee 3.60, totalling 48.62.
- **Payroll cost line (M):** May 45.1, Jun 45.8, Jul 46.3, Aug 47.2, Sep 47.8, Oct 48.6. Use a tight axis, 44 to 50.
- **Kasun's payslip:**
  - Basic 285,000, fixed allowance 40,000, overtime 4 h 8,250, so gross **333,250**.
  - EPF 8% on 325,000 (basic + fixed allowance) = **26,000**.
  - APIT = **27,475**. That is monthly relief 150,000, then 6% on 83,333, 18% on 41,667, 24% on 41,667, and 30% on the remaining 16,583.
  - **Net 279,775.**
  - Employer EPF 12% = 39,000; ETF 3% = 9,750.
  - The Check column shows "Overtime".
- **Changes since September (the agent explains, a person decides):**
  - Nimal: +12,400. 6 h weekend overtime for the Sep 19 release. Agent: "Explained".
  - Dinesh Wickrama: first salary. Joined Oct 5, paid pro rata for 21 of 23 days. Agent: "Explained".
  - Ayesha: −9,850. The agent found 1.5 days with no time logged and no approved leave. It also notes that Leave shows casual leave on Oct 16 that may not have synced. Agent: "**Check before deducting**". No deduction until HR accepts.
  - Rizwan Farook: −285,000. His final settlement was paid in September. Agent: "Explained".
  - Each row has a person action: **Accept** or **Query**.
  - **"Approve run" is disabled until both open queries are resolved.** Show a hint saying so.
- Tharushi's confirmation takes effect Nov 1 (after probation ends Oct 31). It is not in October.
- **Australia switch:** shows a short Australian run. Lumen Labs Pty Ltd, 13 people, fortnightly.
  - Gross AUD 118,400, PAYG AUD 31,900, super 12% AUD 14,208.
  - Super is paid with this run under Payday Super, due within 7 days.
  - STP Phase 2 lodgement status: "Ready to lodge".

## Access and licences (USD a month)

| Product | Seats | Assigned | Active 30 d | Monthly | Unused seats | Unused cost |
|---|---|---|---|---|---|---|
| Microsoft 365 E3 | 190 | 184 | 181 | $6,840 | 3 | 3 × $36 = $108 |
| Azure DevOps Basic + Test Plans | 60 | 56 | 50 | $2,912 | 6 | add-on only, 6 × $46 = $276 |
| GitHub Copilot Business | 120 | 112 | 108 | $2,280 | 4 | $76 |
| Figma Professional | 40 | 38 | 29 | $600 | 9 | $135 |
| JetBrains All Products | 30 | 27 | 25 | $870 | 1 | $29 |

- **Unused seats: 23 = $624 a month.**
- **Savings cards:**
  - Figma: $1,620 a year.
  - Test Plans: $3,312 a year.
- **The agent job reads "$7,488 a year to save".**
- **Kasun** has **4 licences and 1 device**, the same on the table and on his profile.

## Fictional data rule

- No real people or companies. Clients are Microsoft sample names (Contoso, Fabrikam, Northwind, Woodgrove, Adatum, Tailspin, Litware, Wide World Importers for Fleet Tracker).
- **Market claims carry a source, a confidence level and a date**, for example "From 27 RFP debriefs in amax and 31 public reviews; medium confidence; Oct 12".
- **Region filter:** "Australia + Sri Lanka".
- **The "14% false-positive" line becomes:** "Add the 31% faster claim triage from the Litware document-processing pilot to the demo script".
