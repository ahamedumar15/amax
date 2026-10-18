import type { RecordType, SourceKind } from "../contracts";

// The demo allow-list (fictional): 4 Teams channels and 6 mailboxes, as on the Integrations card in
// the mock. `actsFor` is the demo user the agent works for there.
export type DemoSource = { kind: SourceKind; address: string; label: string; actsFor: string };
export const TEAM = "demo-team-sales";

export const DEMO_SOURCES: DemoSource[] = [
  { kind: "channel", address: `${TEAM}/19:sales-anz@thread.example`, label: "#sales-anz", actsFor: "liam" },
  { kind: "channel", address: `${TEAM}/19:sales-lk@thread.example`, label: "#sales-lk", actsFor: "maya" },
  { kind: "channel", address: `${TEAM}/19:presales@thread.example`, label: "#presales", actsFor: "maya" },
  { kind: "channel", address: `${TEAM}/19:account-reviews@thread.example`, label: "#account-reviews", actsFor: "sarah" },
  { kind: "mailbox", address: "liam@lumenlabs.test", label: "Liam", actsFor: "liam" },
  { kind: "mailbox", address: "maya@lumenlabs.test", label: "Maya", actsFor: "maya" },
  { kind: "mailbox", address: "sarah@lumenlabs.test", label: "Sarah", actsFor: "sarah" },
  { kind: "mailbox", address: "nimal@lumenlabs.test", label: "Nimal", actsFor: "nimal" },
  { kind: "mailbox", address: "sales@lumenlabs.test", label: "the sales inbox", actsFor: "liam" },
  { kind: "mailbox", address: "bids@lumenlabs.test", label: "the bids inbox", actsFor: "maya" },
];

/** What the agent made of each sandbox message. The one that tries to give it orders is no record. */
export type DemoTriage = { recordType: RecordType; fields: Record<string, string | number>; confidence: number } | null;
export const DEMO_TRIAGE: Record<string, DemoTriage> = {
  "demo-mail-0415": { recordType: "opportunity", confidence: 0.82, fields: { client: "Adatum, Australia", title: "Payday Super payroll changes", value: 85000, currency: "AUD", ownerName: "Liam Murphy", expectedClose: "2026-12-15" } },
  "demo-post-1016": { recordType: "opportunity", confidence: 0.74, fields: { client: "Woodgrove Bank", title: "AI governance and ISO 42001 readiness", value: 60000, currency: "USD", ownerName: "Maya Fernando" } },
  "demo-mail-0416": null,
  "demo-mail-0417": { recordType: "leave", confidence: 0.9, fields: { type: "annual", startsOn: "2026-11-03", endsOn: "2026-11-05" } },
};
