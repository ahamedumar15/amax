import type { ModuleManifest, RetentionEntry, StatutoryMinimum } from "../module";

export type PrivacySource = Pick<ModuleManifest, "id" | "retention" | "statutory" | "subjectIds">;
export type Rule = RetentionEntry & { id: string; module: string };

export const PRIVACY_READ = "privacy:read";
export const PRIVACY_MANAGE = "privacy:manage";

export const STATUTORY_DEFAULTS: StatutoryMinimum[] = [
  { country: "LK", class: "pay", period: "P7Y", reason: "Pay and EPF/ETF records, Sri Lanka country pack" },
  { country: "AU", class: "pay", period: "P7Y", reason: "Pay records under the Fair Work Act, Australia country pack" },
];

export const TENANT_DEFAULTS = {
  candidate: { label: "Candidates not hired", period: "P12M", starts: "Decision", action: "delete", ships: "Recruitment" },
  inbox: { label: "Inbox agent excerpts", period: "P30D", starts: "Suggestion closed", action: "delete", ships: "Inbox agent" },
  chat: { label: "amax chat conversations", period: "P90D", starts: "Last message", action: "delete", ships: "chat" },
  agentRuns: { label: "Agent run logs", period: "P180D", starts: "Run ends", action: "delete", ships: "workflows" },
} as const;

export const APPEND_ONLY = [
  { table: "core.audit_event", label: "Audit log", starts: "Each write" },
  { table: "core.trace_event", label: "Trace of chat turns and tool calls", starts: "Each step" },
  { table: "ai.call", label: "AI usage ledger", starts: "Each model call" },
];

const privacyOwn: PrivacySource = {
  id: "privacy",
  retention: [
    { table: "privacy.request", label: "Access packages", subject: ["subject_user_id"], fields: ["package"], class: "personal", period: "P30D", start: { at: ["completed_at"] }, action: "anonymise" },
    { table: "privacy.request", label: "Closed requests' names", subject: ["subject_user_id"], fields: ["subject_label"], class: "personal", period: "P1Y", start: { at: ["completed_at"] }, action: "anonymise" },
    { table: "privacy.legal_hold", label: "Released legal holds", subject: ["id"], fields: ["label"], class: "personal", period: "P1Y", start: { at: ["released_at"] }, action: "anonymise" },
  ],
};

let sources: PrivacySource[] = [privacyOwn];

export function setPrivacySources(list: PrivacySource[]) {
  sources = [privacyOwn, ...list];
}

export const ruleId = (e: RetentionEntry) => `${e.table}.${e.fields[0]}`;

export const privacyRules = (): Rule[] => sources.flatMap((s) => (s.retention ?? []).map((e) => ({ ...e, id: ruleId(e), module: s.id })));

export const statutoryMinimums = (): StatutoryMinimum[] => [...STATUTORY_DEFAULTS, ...sources.flatMap((s) => s.statutory ?? [])];

export const subjectResolvers = () => sources.flatMap((s) => (s.subjectIds ? [s.subjectIds] : []));

export const privacyGrants: Pick<ModuleManifest, "grants"> = { grants: { HR: [PRIVACY_READ, PRIVACY_MANAGE] } };
