import type { ArtName } from "./Art";

export type Claim = { text: string; module?: string };
export type Area = { title: string; tone: string; art: ArtName; live: Claim[]; coming: string[] };

const PLATFORM = "platform";

export const AREAS: Area[] = [
  { title: "Delivery", tone: "info", art: "rocket", coming: [], live: [
    { text: "Projects, specclaw proposals and releases across Dev, QA, UAT and Prod", module: "delivery" },
    { text: "Time and approvals", module: "time" },
    { text: "Allocations and capacity forecasts", module: "allocations" },
  ] },
  { title: "People", tone: "good", art: "people", coming: ["Onboarding and offboarding", "Payroll for Sri Lanka and Australia"], live: [
    { text: "Core HR", module: "hr" },
    { text: "Leave", module: "leave" },
    { text: "Learning", module: "learning" },
    { text: "OKRs from Keyflow", module: "keyflow" },
  ] },
  { title: "Finance and sales", tone: "attention", art: "coins", coming: ["Contracts and billing", "Expenses", "Xero, QuickBooks and Business Central"], live: [
    { text: "Presales pipeline", module: "presales" },
  ] },
  { title: "Operations", tone: "sky", art: "key", coming: ["IT assets and access", "Helpdesk", "Insights"], live: [
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
