import type { PayloadFields } from "@amax/core";
import type { Sensitivity } from "@amax/core/server";

export type MaskedField = { masked: true; class: Sensitivity | "undeclared" };

// A safety net inside fields declared plain (a nested object): these name patterns can add a mask,
// never remove one. The declaration decides (review 058).
const CLASSES: [RegExp, Sensitivity][] = [
  [/salary|wage|(^|_)pay($|_|[A-Z])|payslip|gross|net_?pay|bonus|compensation|epf|etf|superannuation/i, "pay"],
  [/bank|iban|bsb|account_?number|swift/i, "bank"],
  [/health|medical|sick|diagnos|disab/i, "health"],
  [/rating|performance|review_?score|appraisal/i, "performance"],
  [/candidate|interview|offer_?amount/i, "candidate"],
];

export const classOf = (field: string) => CLASSES.find(([re]) => re.test(field))?.[1];

/** The pattern net alone, for nested values. */
export function maskPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const cls = classOf(k);
    return [k, cls ? ({ masked: true, class: cls } satisfies MaskedField) : maskPayload(v)];
  }));
}

/** Fail closed (review 058): a field the emitting module declared plain is sent, one it classified is
 * masked with its class, and one it didn't declare (or an event with no declaration) is masked. */
export function maskEvent(payload: Record<string, unknown>, fields: PayloadFields | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => {
    const decl = fields?.[k];
    if (decl === "plain") return [k, maskPayload(v)];
    return [k, { masked: true, class: decl ?? "undeclared" } satisfies MaskedField];
  }));
}

export const webhookBody = (e: { id: string; name: string; payload: Record<string, unknown> }, occurredAt: string, fields?: PayloadFields) =>
  JSON.stringify({ id: e.id, event: e.name, occurredAt, data: maskEvent(e.payload, fields) });
