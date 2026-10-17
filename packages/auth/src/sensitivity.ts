import type { Sensitivity } from "@amax/core/server";
import type { Role } from "./roles";
import type { Viewer } from "./viewer";

// Who may see each class of field. "self" = the person the record is about; "manager" = their manager.
export const SENSITIVITY_POLICY: Record<Sensitivity, { roles: Role[]; self: boolean; manager: boolean }> = {
  pay: { roles: ["Payroll", "Admin"], self: true, manager: false },
  health: { roles: ["HR"], self: true, manager: false },
  bank: { roles: ["Payroll"], self: true, manager: false },
  performance: { roles: ["HR", "Leadership"], self: true, manager: true },
  candidate: { roles: ["HR"], self: false, manager: false },
};

export type Masked = { masked: true; class: Sensitivity };
export const isMasked = (v: unknown): v is Masked => typeof v === "object" && v !== null && (v as Masked).masked === true;
export type MaskedRecord<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | Masked };

/** Who the record is about and where it sits, for the policy check. */
export type Subject = { ownerUserId?: string | null; legalEntityId?: string | null };

export function canSee(v: Viewer, cls: Sensitivity, subject: Subject) {
  const p = SENSITIVITY_POLICY[cls];
  if (p.self && subject.ownerUserId && subject.ownerUserId === v.userId) return true;
  if (p.manager && subject.ownerUserId && v.reports.includes(subject.ownerUserId)) return true;
  return v.assignments.some((a) => p.roles.includes(a.role) && (a.legalEntityIds === null || !subject.legalEntityId || a.legalEntityIds.includes(subject.legalEntityId)));
}

export function mask<T extends Record<string, unknown>, K extends keyof T & string>(v: Viewer, record: T, fields: Partial<Record<K, Sensitivity>>, subject: Subject): MaskedRecord<T, K> {
  const out: Record<string, unknown> = { ...record };
  for (const [field, cls] of Object.entries(fields) as [K, Sensitivity][]) {
    if (field in out && !canSee(v, cls, subject)) out[field] = { masked: true, class: cls } satisfies Masked;
  }
  return out as MaskedRecord<T, K>;
}
