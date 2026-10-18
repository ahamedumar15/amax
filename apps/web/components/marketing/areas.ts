import type { ArtName } from "./Art";

export type Claim = { text: string; module?: string };
export type Planned = { text: string; module: string; words: string[] };
export type Area = { title: string; tone: string; art: ArtName; live: Claim[]; coming: Planned[] };

const PLATFORM = "platform";

export const AREAS: Area[] = [
  { title: "Delivery", tone: "info", art: "rocket", coming: [], live: [
    { text: "Projects, specclaw proposals and releases across Dev, QA, UAT and Prod", module: "delivery" },
    { text: "Time and approvals", module: "time" },
    { text: "Allocations and capacity forecasts", module: "allocations" },
  ] },
  { title: "People", tone: "good", art: "people", coming: [
    { text: "Sri Lanka payroll pack", module: "payroll-lk", words: ["sri lanka"] },
    { text: "Australia payroll pack", module: "payroll-au", words: ["australia"] },
  ], live: [
    { text: "Core HR", module: "hr" },
    { text: "Leave", module: "leave" },
    { text: "Onboarding and offboarding", module: "onboarding" },
    { text: "Payroll runs and payslips", module: "payroll" },
    { text: "Learning", module: "learning" },
    { text: "OKRs from Keyflow", module: "keyflow" },
  ] },
  { title: "Finance and sales", tone: "attention", art: "coins", coming: [
    { text: "Expenses", module: "expenses", words: ["expense"] },
    { text: "Xero, QuickBooks and Business Central", module: "accounting", words: ["xero", "quickbooks", "business central"] },
  ], live: [
    { text: "Contracts, invoicing and receivables, with invoices drafted for Finance to accept", module: "finance" },
    { text: "Presales pipeline", module: "presales" },
  ] },
  { title: "Operations", tone: "sky", art: "key", coming: [
    { text: "IT assets and access", module: "it-access", words: ["it asset", "licence"] },
    { text: "Helpdesk", module: "helpdesk", words: ["helpdesk"] },
    { text: "Insights", module: "insights", words: ["insights"] },
  ], live: [
    { text: "Compliance registers and incidents", module: "compliance" },
    { text: "Notifications", module: "notifications" },
  ] },
  { title: "Platform", tone: "problem", art: "shield", coming: [], live: [
    { text: "An MCP server for every capability", module: PLATFORM },
    { text: "Entra ID sign-in and SCIM", module: PLATFORM },
    { text: "Git identities, API keys and webhooks", module: PLATFORM },
  ] },
];

export const isPlatform = (c: Claim) => c.module === PLATFORM;
