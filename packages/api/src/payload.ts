import { fieldKey, type Sensitivity } from "@amax/core/server";

// The modules' declared classes decide (declaredFieldClasses, review 058 B4). These name patterns are
// only a safety net for a field no module has classified yet: they can add a mask, never remove one.
const CLASSES: [RegExp, Sensitivity][] = [
  [/salary|wage|(^|_)pay($|_|[A-Z])|payslip|gross|net_?pay|bonus|compensation|epf|etf|superannuation/i, "pay"],
  [/bank|iban|bsb|account_?number|swift/i, "bank"],
  [/health|medical|sick|diagnos|disab/i, "health"],
  [/rating|performance|review_?score|appraisal/i, "performance"],
  [/candidate|interview|offer_?amount/i, "candidate"],
];

export const classOf = (field: string, declared: Record<string, Sensitivity> = {}) => declared[fieldKey(field)] ?? CLASSES.find(([re]) => re.test(field))?.[1];

export function maskPayload(value: unknown, declared: Record<string, Sensitivity> = {}): unknown {
  if (Array.isArray(value)) return value.map((v) => maskPayload(v, declared));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const cls = classOf(k, declared);
    return [k, cls ? { masked: true, class: cls } : maskPayload(v, declared)];
  }));
}

export const webhookBody = (e: { id: string; name: string; payload: Record<string, unknown> }, occurredAt: string, declared: Record<string, Sensitivity> = {}) =>
  JSON.stringify({ id: e.id, event: e.name, occurredAt, data: maskPayload(e.payload, declared) });
