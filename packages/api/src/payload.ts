import type { Sensitivity } from "@amax/core/server";

const CLASSES: [RegExp, Sensitivity][] = [
  [/salary|wage|(^|_)pay($|_|[A-Z])|payslip|gross|net_?pay|bonus|compensation/i, "pay"],
  [/bank|iban|bsb|account_?number|swift/i, "bank"],
  [/health|medical|sick|diagnos|disab/i, "health"],
  [/rating|performance|review_?score|appraisal/i, "performance"],
  [/candidate|interview|offer_?amount/i, "candidate"],
];

export const classOf = (field: string) => CLASSES.find(([re]) => re.test(field))?.[1];

export function maskPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const cls = classOf(k);
    return [k, cls ? { masked: true, class: cls } : maskPayload(v)];
  }));
}

export const webhookBody = (e: { id: string; name: string; payload: Record<string, unknown> }, occurredAt: string) =>
  JSON.stringify({ id: e.id, event: e.name, occurredAt, data: maskPayload(e.payload) });
