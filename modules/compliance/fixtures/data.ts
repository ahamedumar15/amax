// Lumen Labs' compliance registers for the demo. Every person, supplier and incident is fictional.
export const POLICIES = [
  { key: "acceptable-use", title: "Acceptable Use", version: 3, publishedOn: "2025-11-03", summary: "How staff may use company devices, accounts and AI tools (fictional demo policy)", everyone: true },
  { key: "acceptable-use", title: "Acceptable Use", version: 4, publishedOn: "2026-10-12", summary: "Adds the rule that client data never goes into unapproved AI tools (fictional demo policy)", everyone: false },
  { key: "information-security", title: "Information Security", version: 7, publishedOn: "2026-03-02", summary: "The information security policy (fictional demo policy)", everyone: true },
  { key: "privacy-notice-staff", title: "Privacy Notice for staff", version: 2, publishedOn: "2026-07-01", summary: "What Lumen Labs does with staff personal data (fictional demo policy)", everyone: true },
];
/** Acceptable Use v4 is still pending for 17 of 184 people, two of them named so the demo can acknowledge it in chat. */
export const PENDING_V4 = 17;
export const PENDING_NAMED = ["dinesh", "tharushi"];

type RiskSeed = [title: string, likelihood: number, impact: number, owner: string, treatment: string, status?: string];
export const RISKS: RiskSeed[] = [
  ["Ransomware on a build server", 3, 5, "sahan", "Immutable nightly backups and EDR on every build agent"],
  ["Client data pasted into an unapproved AI tool", 4, 4, "ravi", "Acceptable Use v4 and the AI gateway's redaction"],
  ["Phishing email leads to a stolen password", 3, 4, "ravi", "Phishing-resistant MFA for every account"],
  ["Key engineer leaves in the middle of a release", 3, 3, "maya", "Pairing and runbooks for every release"],
  ["Payroll file rejected after a bank format change", 2, 4, "sarah", "Test file sent to the bank before each change"],
  ["Backup restore not tested this quarter", 2, 4, "sahan", "Quarterly restore drill"],
  ["Shared admin account on the test environment", 2, 4, "sahan", "Named accounts through single sign-on"],
  ["A supplier's data processing agreement lapses", 2, 3, "maya", "Review dates in the supplier register"],
  ["Leavers' office access cards not revoked", 3, 2, "ravi", "Revoke cards in the leaver checklist"],
  ["Unencrypted USB drives in use", 2, 3, "ravi", "Drives blocked by device policy", "closed"],
];

export const INCIDENTS = [
  { title: "Laptop lost in transit", occurredOn: "2026-10-02", country: "LK", owner: "sahan", personalData: false, dataClass: null, impact: "encrypted", status: "resolved", resolvedOn: "2026-10-06",
    description: "A courier lost a laptop on its way to a new joiner; the disk is encrypted and the device was wiped remotely (fictional demo record)" },
  { title: "Payslip emailed to the wrong person", occurredOn: "2026-10-16", country: "AU", owner: "sarah", personalData: true, dataClass: "pay", impact: null, status: "assessing", resolvedOn: null,
    awareAt: "2026-10-16T02:00:00Z", description: "One October payslip went to a former employee's personal address (fictional demo record)" },
];

export const SUPPLIERS = [
  { name: "Northwind Payroll Bureau", service: "Payroll processing", data: "Pay and bank details", region: "Sri Lanka", subprocessor: true, dpaSignedOn: "2025-04-01", reviewOn: "2027-04-01" },
  { name: "Contoso Mail", service: "Email and calendars", data: "Names, work email, messages", region: "Australia", subprocessor: true, dpaSignedOn: "2024-08-15", reviewOn: "2026-11-30" },
  { name: "Fabrikam Backup", service: "Off-site backups", data: "All tenant records, encrypted", region: "Australia", subprocessor: true, dpaSignedOn: "2025-02-10", reviewOn: "2027-02-10" },
  { name: "Tailspin Screening", service: "Background checks", data: "Candidate details", region: "Sri Lanka", subprocessor: true, dpaSignedOn: "2026-01-20", reviewOn: "2027-01-20" },
  { name: "Adatum Couriers", service: "Device shipping", data: null, region: "Sri Lanka", subprocessor: false, dpaSignedOn: null, reviewOn: null },
];
