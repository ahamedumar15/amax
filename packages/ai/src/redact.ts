import type { Sensitivity } from "@amax/core/server";

export type Redactions = Record<string, number>;

// Classified fields the tenant doesn't allow are replaced before anything leaves amax (AC-2).
// Values already masked by @amax/auth ({ masked: true, class }) are never sent either.
export function redactRecord(record: Record<string, unknown>, sensitive: Partial<Record<string, Sensitivity>>, allowed: string[], counts: Redactions) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const masked = typeof v === "object" && v !== null && (v as { masked?: boolean }).masked === true;
    const cls = masked ? ((v as { class: string }).class) : sensitive[k];
    if (cls && (masked || !allowed.includes(cls))) {
      out[k] = `[redacted:${cls}]`;
      counts[cls] = (counts[cls] ?? 0) + 1;
    } else out[k] = v;
  }
  return out;
}
