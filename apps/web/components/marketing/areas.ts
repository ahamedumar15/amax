export type Claim = { text: string; module?: string };
export type Planned = { text: string; module: string; words: string[] };
export type Area = { title: string; pitch: string; tone: string; open?: boolean; live: Claim[]; coming: Planned[] };

const PLATFORM = "platform";

export const AREAS: Area[] = [
  { title: "Delivery", pitch: "Delivery that updates itself.", tone: "v1", open: true, coming: [], live: [
    { text: "Projects, specclaw proposals and releases across Dev, QA, UAT and Prod", module: "delivery" },
    { text: "Time and approvals", module: "time" },
    { text: "Allocations and capacity forecasts", module: "allocations" },
    { text: "Utilisation and availability reports", module: "reports" },
  ] },
  { title: "People and payroll", pitch: "People records, kept current.", tone: "v2", open: true, coming: [
    { text: "Sri Lanka payroll pack", module: "payroll-lk", words: ["sri lanka"] },
    { text: "Australia payroll pack", module: "payroll-au", words: ["australia"] },
  ], live: [
    { text: "Core HR", module: "hr" },
    { text: "Leave", module: "leave" },
    { text: "Onboarding and offboarding", module: "onboarding" },
    { text: "Payroll runs and payslips", module: "payroll" },
    { text: "Recruitment, from open role to hire", module: "recruitment" },
    { text: "Learning", module: "learning" },
    { text: "OKRs from Keyflow", module: "keyflow" },
  ] },
  { title: "Finance and sales", pitch: "Invoices drafted from approved time.", tone: "v3", coming: [
    { text: "Xero, QuickBooks and Business Central", module: "accounting", words: ["xero", "quickbooks", "business central"] },
  ], live: [
    { text: "Contracts, invoicing and receivables, with invoices drafted for Finance to accept", module: "finance" },
    { text: "Expense claims, approved by the manager and then Finance", module: "expenses" },
    { text: "Presales pipeline", module: "presales" },
  ] },
  { title: "Operations", pitch: "Compliance and incidents, on the record.", tone: "v4", coming: [
    { text: "Helpdesk", module: "helpdesk", words: ["helpdesk"] },
    { text: "Insights", module: "insights", words: ["insights"] },
  ], live: [
    { text: "IT access and licences, with every grant and revoke decided by a person", module: "it-access" },
    { text: "Compliance registers and incidents", module: "compliance" },
    { text: "Notifications", module: "notifications" },
  ] },
  { title: "Platform", pitch: "Every capability is an MCP tool.", tone: "v5", coming: [], live: [
    { text: "Claude Code, CI and your own agents use the same tools and permissions as the UI", module: PLATFORM },
    { text: "Entra ID sign-in and SCIM", module: PLATFORM },
    { text: "Git identities, API keys and webhooks", module: PLATFORM },
  ] },
];

export const isPlatform = (c: Claim) => c.module === PLATFORM;
