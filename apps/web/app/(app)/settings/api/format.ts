import type { CredentialView } from "@amax/auth/credentials-read";
import type { ApiStats } from "@amax/api";
import { countWord, daysUntil, shortDate } from "../keys/format";

export const SOON_DAYS = 30;
export const PROVIDER_NAMES = { github: "GitHub", "azure-devops": "Azure DevOps", msgraph: "Microsoft Graph", amax: "amax-signed" } as const;
const CHANNEL_NOUN: Record<string, string> = { mcp: "MCP client", rest: "API client", page: "user", chat: "chat user" };
const plural = (n: number, one: string) => (n === 1 ? one : `${one}s`);

export const live = (rows: CredentialView[]) => rows.filter((r) => r.status !== "revoked");
export const expiringSoon = (r: CredentialView, now: Date) => r.status === "active" && daysUntil(new Date(r.expiresAt), now) <= SOON_DAYS;

export function expires(r: CredentialView, now: Date) {
  const at = new Date(r.expiresAt);
  if (r.status === "revoked") return { text: "Revoked", tone: "draft" };
  if (r.status === "expired") return { text: `Expired ${shortDate(at, now, true)}`, tone: "bad" };
  if (expiringSoon(r, now)) return { text: shortDate(at, now, true), tone: "warn" };
  return { text: at.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), tone: null };
}

export function lastUsed(at: string | null, now: Date) {
  if (!at) return "Never";
  const d = new Date(at);
  const day = (x: Date) => x.toISOString().slice(0, 10);
  if (day(d) === day(now)) return `${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} today`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return shortDate(d, now);
}

export const actsFor = (names: string[]) => (!names.length ? "No one" : names.length <= 2 ? names.join(" and ") : `${names.length} people`);

export function limitedNote(s: ApiStats["limited"]) {
  const top = s.byChannel[0];
  if (!top) return "None this week";
  const who = `${countWord(top.subjects)} ${plural(top.subjects, CHANNEL_NOUN[top.channel] ?? top.channel)}`;
  return s.peakDay ? `${who}, ${s.peakDay}` : who;
}

export function deliveryRate(d: ApiStats["deliveries"]) {
  const pct = d.total ? Math.round((d.ok / d.total) * 1000) / 10 : 0;
  return { pct, value: d.total ? `${pct}%` : "None", label: `${pct}% of ${d.total.toLocaleString("en-US")} delivered` };
}

export function lede(rows: CredentialView[], s: ApiStats, now: Date) {
  const n = live(rows).length;
  const head = `${countWord(n)} service credential${n === 1 ? "" : "s"} and ${countWord(s.webhooks.length).toLowerCase()} webhook${s.webhooks.length === 1 ? "" : "s"}.`;
  const rejected = s.inbound.filter((i) => i.rejected > 0);
  const total = rejected.reduce((t, i) => t + i.rejected, 0);
  const from = rejected.length === 1 ? `, all claiming to be from ${PROVIDER_NAMES[rejected[0].provider]}` : "";
  const bad = total ? ` ${total} unsigned webhook call${total === 1 ? " was" : "s were"} rejected this week${from}.` : "";
  const off = s.webhooks.find((w) => w.status === "off");
  const soon = live(rows).filter((r) => expiringSoon(r, now)).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];
  const attention = off ? ` The ${off.name} webhook was switched off after failing; ask amax to resume it once it's fixed.`
    : soon ? ` ${soon.name} expires in ${daysUntil(new Date(soon.expiresAt), now)} days; rotate or revoke it.` : "";
  return `${head}${bad}${attention}`;
}
