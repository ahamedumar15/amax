export type Card = { id: string; tone: string; mark: string; title: string; detail: string; by: string; action: string; done: string };

export const ROLES = ["PM", "Finance", "HR", "Engineer"] as const;
export type Role = (typeof ROLES)[number];

export const QUEUES: Record<Role, Card[]> = {
  PM: [
    { id: "pm1", tone: "v1", mark: "W", title: "Liam Walsh submitted 2026-W42", detail: "32.5 h on Contoso Portal (fictional), all matched to commits", by: "Submitted by Liam Walsh", action: "Approve week", done: "Approved by you, Chloe Harris · in chat" },
    { id: "pm2", tone: "v4", mark: "R", title: "Fleet Tracker v1.9.0 passed UAT", detail: "3 proposals verified · recorded by the CI pipeline", by: "CI pipeline, for Jack O'Brien", action: "Promote", done: "Promoted to Prod by you · deployment recorded · in chat" },
    { id: "pm3", tone: "v5", mark: "A", title: "Sophie Nguyen is at 120% in November", detail: "Suggestion: trim her largest project, Contoso Portal, to clear the overbooking", by: "Allocations agent, for Chloe Harris", action: "Accept", done: "Accepted by you · allocation updated · in chat" },
  ],
  Finance: [
    { id: "fi1", tone: "v3", mark: "$", title: "Invoice drafted: Contoso Portal, milestone 3", detail: "Unlocked by v2.4.0 reaching Prod (fictional amounts)", by: "Billing agent, for Priya Raman", action: "Issue invoice", done: "Issued by you, Priya Raman · audit entry chained · in chat" },
    { id: "fi2", tone: "v2", mark: "E", title: "Expense claim: taxi to the client office", detail: "Approved by the manager, Chloe Harris", by: "Claimed by Liam Walsh", action: "Approve", done: "Approved by you · queued for payment · in chat" },
  ],
  HR: [
    { id: "hr1", tone: "v5", mark: "L", title: "Sophie Nguyen requested 3 days of leave", detail: "Nov 3–5 · balance after: 11 days", by: "Requested in chat by Sophie Nguyen", action: "Approve leave", done: "Approved by you · team calendar updated · in chat" },
    { id: "hr2", tone: "v2", mark: "O", title: "Mateo Rossi starts on Nov 10", detail: "Onboarding checklist: laptop, accounts and induction", by: "Hired in recruitment by Chloe Harris", action: "Start onboarding", done: "Started by you · tasks sent to their owners · in chat" },
  ],
  Engineer: [
    { id: "en1", tone: "v2", mark: "h", title: "Add 2.5 h on Contoso Portal for Wed", detail: "Drafted from commit 4f2c1e9 · AMX-142 Export the invoice list", by: "Git ingestion, for Liam Walsh", action: "Accept", done: "Accepted by you, Liam Walsh · drafted by Git ingestion · in chat" },
    { id: "en2", tone: "v1", mark: "W", title: "Submit 2026-W42", detail: "32.5 h, all matched to commits", by: "Your week", action: "Submit week", done: "Submitted by you · sent to Chloe Harris to approve · in chat" },
  ],
};
