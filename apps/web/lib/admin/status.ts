import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { aiConfigured, blockedReason, REGIONS } from "@amax/ai";
import { aiStats } from "@amax/ai/admin";
import { auditStatus, type AuditStatus } from "@amax/core/server";
import { CONNECTORS, EXPIRY_WINDOW_DAYS, listCredentials } from "@amax/core/secrets";
import { connectedClients } from "@amax/mcp/admin";
import { listRuns, listSchedules } from "@amax/workflows/server";
import type { Viewer } from "@amax/auth";
import { ctxFor, type AdminDeps } from "./tool";

export type Tone = "good" | "warn" | "bad" | "info";
export type Area = { id: string; title: string; href: string | null; blurb: string; stat: string; chip: { tone: Tone; text: string }; attention?: string };

const DAY = 86_400_000;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

async function keys(v: Viewer): Promise<Area> {
  const base = { id: "keys", title: "Connections and keys", href: "/settings/keys", blurb: "Connector credentials, encrypted with your own key, with rotation and expiry." };
  const data = await listCredentials(ctxFor(v, "ui"));
  const live = data.rows.filter((r) => r.status !== "revoked");
  const expired = live.filter((r) => r.status === "expired");
  const soon = live.filter((r) => r.status === "active" && r.expiresAt && r.expiresAt.getTime() - Date.now() <= EXPIRY_WINDOW_DAYS * DAY);
  const stat = plural(live.length, "credential");
  if (!data.key) return { ...base, stat, chip: { tone: "bad", text: "No key service" }, attention: "no key service is configured, so credentials are off" };
  if (expired.length) return { ...base, stat, chip: { tone: "bad", text: `${expired.length} expired` }, attention: `the ${CONNECTORS[expired[0].connector].name} credential has expired` };
  if (soon.length) {
    const days = Math.ceil((soon[0].expiresAt!.getTime() - Date.now()) / DAY);
    return { ...base, stat, chip: { tone: "warn", text: `${soon.length} expiring` }, attention: `the ${CONNECTORS[soon[0].connector].name} credential expires in ${plural(days, "day")}` };
  }
  return { ...base, stat, chip: { tone: "good", text: "All current" } };
}

async function ai(d: AdminDeps, v: Viewer): Promise<Area[]> {
  const s = await aiStats(d.db(), v.tenantId);
  const blocked = blockedReason(s.policy) ?? (aiConfigured() ? null : "no API key is configured on the server");
  const region = s.policy.dataRegion ? (REGIONS as Record<string, string>)[s.policy.dataRegion] ?? s.policy.dataRegion : "No data region";
  return [
    { id: "ai", title: "AI and data", href: "/settings/ai", blurb: "Where your data lives, which AI provider and region, and what may be sent to it.", stat: region,
      chip: blocked ? { tone: "bad", text: "AI off" } : s.policy.dataRegion ? { tone: "good", text: "In region" } : { tone: "warn", text: "No region set" }, ...(blocked ? { attention: `AI is off: ${blocked}` } : {}) },
    { id: "ai-usage", title: "AI usage", href: "/settings/ai/usage", blurb: "What chat and agents cost this month, by person, feature and model.", stat: plural(s.calls, "call"), chip: { tone: "info", text: `$${s.costUsd.toFixed(2)} this month` } },
  ];
}

async function scheduler(d: AdminDeps, v: Viewer): Promise<Area> {
  const [schedules, runs] = await Promise.all([listSchedules(d.db(), d.workflows(), v.tenantId), listRuns(d.db(), d.workflows(), v.tenantId, () => false, { limit: 50 })]);
  const failed = runs.filter((r) => r.status === "failed").length;
  const noZone = schedules.filter((s) => s.enabled && !s.timezone).length;
  const off = schedules.filter((s) => !s.enabled).length;
  const base = { id: "scheduler", title: "Scheduler", href: "/settings/workflows", blurb: "Recurring agent work and every run, with pause, resume, cancel and retry.", stat: `${schedules.length - off} of ${schedules.length} on` };
  if (failed) return { ...base, chip: { tone: "bad", text: `${failed} failed` }, attention: `${plural(failed, "workflow run")} failed` };
  if (noZone) return { ...base, chip: { tone: "warn", text: `${noZone} not scheduled` }, attention: `${plural(noZone, "schedule")} wait for an entity's time zone` };
  return { ...base, chip: off ? { tone: "warn", text: `${off} paused` } : { tone: "good", text: "All on" } };
}

async function integrations(d: AdminDeps, v: Viewer): Promise<Area> {
  const clients = await connectedClients(d.db(), v.tenantId);
  return { id: "integrations", title: "Integrations", href: "/settings/integrations", blurb: "Every amax capability as an MCP tool, and the clients people have connected.", stat: `${d.tools().all.length} tools`, chip: { tone: "good", text: plural(clients.length, "client") } };
}

/** The Audit card: a chain that no longer verifies comes first on the hub (052 review). */
export function auditArea(today: number, s: Pick<AuditStatus, "audit" | "trace">): Area {
  const base = { id: "audit", title: "Audit and trace", href: "/settings/audit", blurb: "Who did what, and which agent acted for them, in a tamper-evident log.", stat: "Read-only" };
  const broken = [s.audit.ok ? null : "audit", s.trace.ok ? null : "trace"].filter((c): c is string => !!c);
  if (broken.length) return { ...base, chip: { tone: "bad", text: "Chain broken" }, attention: `the ${broken.join(" and ")} chain${broken.length > 1 ? "s" : ""} no longer verif${broken.length > 1 ? "y" : "ies"}` };
  return { ...base, chip: { tone: "info", text: `${today} today` } };
}

async function audit(d: AdminDeps, v: Viewer): Promise<Area> {
  // The cached chain walk (the screen's "Verify now" refreshes it), so the hub stays cheap.
  const [today, status] = await withTenant(d.db(), v.tenantId, async (tx) => {
    const [r] = await tx.execute(sql`select count(*)::int as n from core.audit_event where occurred_at >= date_trunc('day', now())`);
    return [Number(r?.n ?? 0), await auditStatus(tx, v.tenantId)] as const;
  });
  return auditArea(today, status);
}

const SOON: Area[] = [
  { id: "retention", title: "Data retention", href: null, blurb: "How long each kind of data is kept, legal holds, and access and erasure requests.", stat: "032", chip: { tone: "info", text: "Coming soon" } },
  { id: "backups", title: "Backups and export", href: null, blurb: "Point-in-time recovery, weekly restore drills, and exporting all your data.", stat: "034", chip: { tone: "info", text: "Coming soon" } },
  { id: "api", title: "API and webhooks", href: null, blurb: "Service credentials for CI and tools, signed webhooks, and rate limits.", stat: "035", chip: { tone: "info", text: "Coming soon" } },
];

/** The Settings hub, attention first: each admin screen with a live status (047 AC-1). */
export async function settingsStatus(d: AdminDeps, v: Viewer): Promise<Area[]> {
  const [k, i, a, s, t] = await Promise.all([keys(v), integrations(d, v), ai(d, v), scheduler(d, v), audit(d, v)]);
  return [k, i, ...a, s, t, ...SOON];
}
