import { CONNECTORS, type CredentialRow } from "@amax/core/secrets";
import { daysUntil, expiringSoon, pastExpiry } from "../../../../lib/admin/credentials";

export { daysUntil, expiringSoon, pastExpiry };
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

export const countWord = (n: number) => WORDS[n] ?? String(n);
export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

export function shortDate(d: Date, now: Date, withYear = d.getUTCFullYear() !== now.getUTCFullYear()) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(withYear ? { year: "numeric" } : {}) });
}

export const lastRotated = (r: CredentialRow, now: Date) => (!r.lastRotatedAt ? "Never" : sameDay(r.lastRotatedAt, now) ? "Rotated today" : shortDate(r.lastRotatedAt, now));

export function lastUsed(r: CredentialRow, now: Date) {
  if (r.status === "revoked" && r.revokedAt) return `${shortDate(r.revokedAt, now)}, ${r.revokeReason ?? "revoked"}`;
  if (!r.lastUsedAt) return "Never";
  const when = sameDay(r.lastUsedAt, now)
    ? `${r.lastUsedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} today`
    : shortDate(r.lastUsedAt, now);
  return r.lastUsedPurpose ? `${when}, ${r.lastUsedPurpose}` : when;
}

export function statusChip(r: CredentialRow, now: Date): { tone: string; text: string } {
  if (r.status === "revoked") return { tone: "draft", text: "Revoked" };
  if (pastExpiry(r, now)) return { tone: "bad", text: "Expired" };
  if (expiringSoon(r, now)) return { tone: "warn", text: `Expires in ${daysUntil(r.expiresAt!, now)} day${daysUntil(r.expiresAt!, now) === 1 ? "" : "s"}` };
  return { tone: "good", text: "Active" };
}

export function lede(tenantName: string, rows: CredentialRow[], now: Date) {
  const head = rows.length
    ? `${countWord(rows.length)} connector credential${rows.length === 1 ? "" : "s"}, all encrypted with ${possessive(tenantName)} own key.`
    : `No connector credentials yet. Values you add are encrypted with ${possessive(tenantName)} own key and never shown again.`;
  const expired = rows.find((r) => pastExpiry(r, now));
  if (expired) return `${head} The ${CONNECTORS[expired.connector].name} ${CONNECTORS[expired.connector].noun} has expired; rotate it now.`;
  const soon = rows.filter((r) => expiringSoon(r, now)).sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())[0];
  if (!soon) return head;
  const days = daysUntil(soon.expiresAt!, now);
  return `${head} The ${CONNECTORS[soon.connector].name} ${CONNECTORS[soon.connector].noun} expires in ${days} day${days === 1 ? "" : "s"}; rotate it before then.`;
}
