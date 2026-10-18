import type { Sensitivity } from "@amax/core/server";
import type { Role } from "./roles";
import type { Viewer } from "./viewer";

/**
 * 055: `pricing` covers every money figure (AI and usage cost now; licence and contract prices later).
 * It isn't a 002 personal-data class, so the AI policy never lists it.
 */
export type FieldClass = Sensitivity | "pricing";

// Who may see each class of field. "self" = the person the record is about; "manager" = their manager.
export const SENSITIVITY_POLICY: Record<FieldClass, { roles: Role[]; self: boolean; manager: boolean }> = {
  pay: { roles: ["Payroll", "Admin"], self: true, manager: false },
  health: { roles: ["HR"], self: true, manager: false },
  bank: { roles: ["Payroll"], self: true, manager: false },
  performance: { roles: ["HR", "Leadership"], self: true, manager: true },
  candidate: { roles: ["HR"], self: false, manager: false },
  pricing: { roles: ["Admin"], self: true, manager: false },
};

export type Masked = { masked: true; class: Sensitivity };
export const isMasked = (v: unknown): v is Masked => typeof v === "object" && v !== null && (v as Masked).masked === true;
export type MaskedRecord<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | Masked };

/** Who the record is about and where it sits, for the policy check. */
export type Subject = { ownerUserId?: string | null; legalEntityId?: string | null };

export function canSee(v: Viewer, cls: FieldClass, subject: Subject) {
  const p = SENSITIVITY_POLICY[cls];
  if (p.self && subject.ownerUserId && subject.ownerUserId === v.userId) return true;
  if (p.manager && subject.ownerUserId && v.reports.includes(subject.ownerUserId)) return true;
  return v.assignments.some((a) => p.roles.includes(a.role) && (a.legalEntityIds === null || !subject.legalEntityId || a.legalEntityIds.includes(subject.legalEntityId)));
}

/** Money figures: always your own; anyone else's, or a tenant total, only with the pricing class. */
export const canSeePricing = (v: Viewer, ownerUserId?: string | null) => canSee(v, "pricing", { ownerUserId });

const PRICED = new Set(["costUsd"]);
/** The value with every money field left out, never nulled, however deep: a tool's answer for a viewer without `pricing`. */
export function withoutPricing<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutPricing) as T;
  if (value === null || typeof value !== "object" || value instanceof Date || value instanceof Map) return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !PRICED.has(k)).map(([k, x]) => [k, withoutPricing(x)])) as T;
}

/** Tenant-wide figures as this viewer may see them: unchanged with the pricing class, without money fields otherwise. */
export const pricedFor = <T>(v: Viewer, value: T): T => (canSeePricing(v) ? value : withoutPricing(value));

export function mask<T extends Record<string, unknown>, K extends keyof T & string>(v: Viewer, record: T, fields: Partial<Record<K, Sensitivity>>, subject: Subject): MaskedRecord<T, K> {
  const out: Record<string, unknown> = { ...record };
  for (const [field, cls] of Object.entries(fields) as [K, Sensitivity][]) {
    if (field in out && !canSee(v, cls, subject)) out[field] = { masked: true, class: cls } satisfies Masked;
  }
  return out as MaskedRecord<T, K>;
}
