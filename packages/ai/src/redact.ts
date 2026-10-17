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

/**
 * The same rule applied to any JSON value, at every depth (review round 1, B1): pinned records and
 * tool results reach the model through here too, so a blocked class can't slip out nested in a
 * list or behind a different path. Matching is by field name plus auth's masked markers.
 */
export function redactDeep(value: unknown, sensitive: Partial<Record<string, Sensitivity>>, allowed: string[], counts: Redactions): unknown {
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, sensitive, allowed, counts));
  if (typeof value !== "object" || value === null) return value;
  const rec = value as Record<string, unknown>;
  if (rec.masked === true && typeof rec.class === "string") {
    counts[rec.class] = (counts[rec.class] ?? 0) + 1;
    return `[redacted:${rec.class}]`;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    const cls = sensitive[k];
    if (cls && !allowed.includes(cls) && v !== null && v !== undefined) {
      out[k] = `[redacted:${cls}]`;
      counts[cls] = (counts[cls] ?? 0) + 1;
    } else out[k] = redactDeep(v, sensitive, allowed, counts);
  }
  return out;
}
