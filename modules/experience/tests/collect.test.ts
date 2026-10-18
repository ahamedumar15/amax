import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { COLLECTED } from "../contracts";
import { runCollect, setSecretOpener } from "../server/collect";
import { setGraphWire } from "../server/wire";
import { sharedDb, T } from "./db";

const AU = "11111111-1111-4111-8111-1111111111a2", LK = "11111111-1111-4111-8111-1111111111a1";
// AC-1: every column the schema may have. Device tables are exactly what is collected.
const ALLOWED: Record<string, readonly string[]> = {
  ...COLLECTED,
  settings: ["tenant_id", "today", "sandbox", "remediation_enabled", "remediation_script", "remediation_set_by", "remediation_set_at"],
  collection: ["tenant_id", "legal_entity_id", "notice_on", "enabled", "set_by", "set_at"],
  issue: ["id", "tenant_id", "key", "kind", "subject", "version", "title", "cause", "arrived_on", "ratio", "department", "first_seen", "devices", "confidence", "fix", "status", "suggestion_id", "found_at"],
  issue_device: ["tenant_id", "issue_id", "device_id"],
  remediation: ["id", "tenant_id", "issue_id", "status", "outcome", "approved_by", "approved_at", "applied_at"],
  pulse: ["id", "tenant_id", "question", "sent_on", "sent_by", "recipients"],
  pulse_receipt: ["tenant_id", "pulse_id", "user_id"],
  pulse_answer: ["id", "tenant_id", "pulse_id", "choice", "department", "legal_entity_id"],
  score_snapshot: ["tenant_id", "day", "dimension", "group_key", "people", "score", "dropped"],
};

// A Graph tenant answering with more than is asked for: device and user names, a window title, browsing.
const EXTRA = { deviceName: "KASUN-LAPTOP-07", userDisplayName: "Kasun Dias", windowTitle: "Payroll.xlsx", browsingHistory: ["news.example"] };
const device = (id: string, upn: string) => ({ id, userPrincipalName: upn, model: "Contoso Laptop 14 (2024)", partnerReportedThreatState: "mediumSeverity", ...EXTRA });
const PAGES: Record<string, unknown[]> = {
  managedDevices: [device("graph-dev-1", "kasun@lumenlabs.test"), device("graph-dev-2", "liam@lumenlabs.test"), device("graph-dev-3", "stranger@contoso.example")],
  userExperienceAnalyticsDevicePerformance: ["graph-dev-1", "graph-dev-2", "graph-dev-3"].map((id) => ({ id, startupPerformanceScore: 64.4, coreBootTimeInMs: 91000, ...EXTRA })),
  userExperienceAnalyticsAppHealthDevicePerformance: ["graph-dev-1", "graph-dev-2", "graph-dev-3"].map((deviceId) => ({ deviceId, deviceAppHealthScore: 71, appCrashCount: 2, appHangCount: 1, ...EXTRA })),
  userExperienceAnalyticsAppHealthAppPerformanceByAppVersionDeviceId: [{ deviceId: "graph-dev-1", appDisplayName: "Teams", appVersion: "24.10", appCrashCount: 2, ...EXTRA }],
  userExperienceAnalyticsBatteryHealthDevicePerformance: [{ deviceId: "graph-dev-1", maxCapacityPercentage: 81, ...EXTRA }],
};

describe.skipIf(!hasDb)("the daily collection (Postgres)", () => {
  const use = sharedDb();
  const opened: string[] = [];
  const hosts: string[] = [];
  const fake = () => {
    setSecretOpener((_ctx, connector, _purpose, fn) => (opened.push(connector), fn(JSON.stringify({ tenant: "contoso-sandbox", clientId: "demo-app", clientSecret: "demo-secret" }))) as never);
    setGraphWire({
      resolve: async () => [{ address: "20.190.160.1", family: 4 }],
      post: async (url) => (hosts.push(new URL(url).hostname), { status: 200, body: JSON.stringify({ access_token: "demo-token" }) }),
      get: async (url) => (hosts.push(url.hostname), { status: 200, body: JSON.stringify({ value: PAGES[url.pathname.split("/").at(-1)!] ?? [] }) }),
    });
  };
  afterEach(() => { setSecretOpener(null); setGraphWire(null); });
  const call = async (key: string, tool: string, args: object) => use().registry.call(await use().as(key), tool, args, { source: "mcp" });

  it("AC1 reads Intune and Defender through 021's msgraph-read and the egress guards, stores only the allowed fields per device, and the schema has no other column", async () => {
    const db = use();
    const cols = await db.q(sql`select table_name, column_name from information_schema.columns where table_schema = 'experience' order by table_name, ordinal_position`);
    const found = Object.fromEntries([...new Set(cols.map((c) => c.table_name as string))].map((t) => [t, cols.filter((c) => c.table_name === t).map((c) => c.column_name)]));
    expect(found).toEqual(ALLOWED);
    await db.q(sql`update experience.settings set sandbox = false`);
    fake();
    expect(await runCollect(T)).toMatchObject({ ok: true, summary: expect.stringMatching(/^2 devices in 2 entities;/) });
    expect([...new Set(opened)]).toEqual(["msgraph-read"]);
    expect([...new Set(hosts)].sort()).toEqual(["graph.microsoft.com", "login.microsoftonline.com"]);
    const stored = await db.q(sql`select d.external_id, d.model, r.startup_score, r.boot_seconds, r.app_score, r.risk, r.battery_pct from experience.device d join experience.device_day r on r.device_id = d.id where d.external_id like 'graph-dev-%' order by 1`);
    expect(stored).toEqual([{ external_id: "graph-dev-1", model: "Contoso Laptop 14 (2024)", startup_score: 64, boot_seconds: 91, app_score: 71, risk: "medium", battery_pct: 81 },
      { external_id: "graph-dev-2", model: "Contoso Laptop 14 (2024)", startup_score: 64, boot_seconds: 91, app_score: 71, risk: "medium", battery_pct: null }]);
    const dump = JSON.stringify(await db.q(sql`select to_jsonb(d) || to_jsonb(r) as row from experience.device d join experience.device_day r on r.device_id = d.id where d.external_id like 'graph-dev-%'`));
    for (const v of ["KASUN-LAPTOP", "Kasun Dias", "Payroll.xlsx", "news.example", "stranger"]) expect(dump).not.toContain(v);
  });

  it("AC2 collection is switched on per entity by an Admin only once a notice is recorded, and nothing is read for an entity without it", async () => {
    const db = use();
    await db.q(sql`update experience.settings set sandbox = false`);
    fake();
    await expect(call("ravi", "set_experience_collection", { legalEntityId: AU, enabled: false })).rejects.toThrow();
    await call("maya", "set_experience_collection", { legalEntityId: AU, enabled: false });
    await db.q(sql`update experience.collection set notice_on = null where legal_entity_id = ${AU}`);
    await expect(call("maya", "set_experience_collection", { legalEntityId: AU, enabled: true })).rejects.toThrow(/notice to staff/);
    await expect(call("maya", "set_experience_collection", { legalEntityId: AU, enabled: true, noticeOn: "2026-12-01" })).rejects.toThrow(/gone out already/);
    await db.q(sql`delete from experience.device where external_id like 'graph-dev-%'`);
    await runCollect(T);
    expect((await db.q(sql`select external_id, legal_entity_id from experience.device where external_id like 'graph-dev-%'`))).toEqual([{ external_id: "graph-dev-1", legal_entity_id: LK }]);
    await call("maya", "set_experience_collection", { legalEntityId: LK, enabled: false });
    opened.length = 0;
    expect(await runCollect(T)).toEqual({ ok: true, summary: "Skipped: no legal entity has collection on" });
    expect(opened).toEqual([]);
  });
});
