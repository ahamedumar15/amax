import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer } from "@amax/auth";
import { setScheduleEnabled, syncSchedules, workflowRegistry } from "@amax/workflows/server";
import manifest from "../module";
import { allowSource, recordConsent, removeSource } from "../server/admin";
import { setTestReader, type SourceToRead } from "../server/reader";
import { readInboxes } from "../server/scan";
import { sharedDb, T } from "./db";

const ENTRA = "5f1c2a9e-0d3b-4c41-9a77-1e2f3a4b5c6d";

describe.skipIf(!hasDb)("the hourly scan (Postgres)", () => {
  const use = sharedDb();
  afterEach(() => setTestReader(null));
  const ctx = async (key: string) => contextForViewer(await use().as(key), "mcp");

  it("AC1 reads nothing without consent, then only the allow-listed sources, from when each was allowed; only managers change the list", async () => {
    const db = use();
    let asked: SourceToRead[] = [];
    setTestReader(async (sources) => {
      asked = sources;
      const now = new Date().toISOString();
      return [...sources.map((s) => ({ sourceId: s.id, id: `m-${s.id}`, at: now, body: `Hello from ${s.label}`, link: null })),
        { sourceId: "00000000-0000-4000-8000-000000000000", id: "spoof", at: now, body: "not allowed", link: null },
        { sourceId: sources[0].id, id: "old", at: "2020-01-01T00:00:00Z", body: "before it was allowed", link: null }];
    });
    await recordConsent(await ctx("maya"), { entraTenantId: ENTRA, granted: false });
    expect(await readInboxes(T)).toMatchObject({ ok: true, summary: "Skipped: no Entra admin consent is recorded" });
    expect(asked).toEqual([]);
    await recordConsent(await ctx("maya"), { entraTenantId: ENTRA, granted: true });
    await expect(allowSource(await ctx("liam"), { kind: "mailbox", address: "liam.private@lumenlabs.test" })).rejects.toThrow();
    await allowSource(await ctx("ravi"), { kind: "mailbox", address: "deals@lumenlabs.test", label: "the deals inbox" });
    const [gone] = await db.q(sql`select id from inbox_agent.source where label = 'Sarah'`);
    await removeSource(await ctx("maya"), { sourceId: gone.id as string });
    const out = await readInboxes(T);
    const live = await db.q(sql`select id from inbox_agent.source where removed_at is null`);
    expect(asked.map((s) => s.id).sort()).toEqual(live.map((s) => s.id).sort());
    expect(asked.map((s) => s.label)).not.toContain("Sarah");
    expect(out).toMatchObject({ ok: true, summary: "Read 10 new messages from 10 sources" });
    expect(await db.q(sql`select count(*)::int as n from inbox_agent.find where excerpt in ('not allowed', 'before it was allowed')`)).toEqual([{ n: 0 }]);
  });

  it("AC3 the scan is an hourly 029 schedule that can be switched off", async () => {
    const db = use();
    const registry = workflowRegistry([manifest]);
    expect([...registry.schedules.values()].map((s) => [s.name, s.title, s.cron])).toEqual([["inbox-agent.scan", "Teams and email scan", "0 * * * *"]]);
    await syncSchedules(db.app, registry);
    const [s] = await db.q(sql`select id, enabled from workflows.schedule where name = 'inbox-agent.scan'`);
    expect(s.enabled).toBe(true);
    await setScheduleEnabled(await ctx("maya"), s.id as string, false);
    expect((await db.q(sql`select enabled from workflows.schedule where id = ${s.id}`))[0].enabled).toBe(false);
  });

  it("AC5 only a plain-text excerpt and a safe link are stored, and a missing Graph credential fails the scan without a secret", async () => {
    const db = use();
    const body = `<style>p{}</style><p onclick="x()">Quote <b>please</b> &amp; thanks</p><script>steal()</script>${" more".repeat(80)}`;
    setTestReader(async (sources) => [{ sourceId: sources[0].id, id: "html-1", at: new Date().toISOString(), body, link: "javascript:alert(1)" }]);
    await readInboxes(T);
    const [f] = await db.q(sql`select excerpt, link from inbox_agent.find where excerpt like 'Quote please%'`);
    expect(f.link).toBeNull();
    expect(String(f.excerpt)).toMatch(/^Quote please & thanks more more .*…$/);
    expect(String(f.excerpt).length).toBeLessThanOrEqual(280);
    expect(String(f.excerpt)).not.toMatch(/[<>]|steal|onclick/);
    setTestReader(null);
    await db.q(sql`update inbox_agent.consent set sandbox = false`);
    expect(await readInboxes(T)).toMatchObject({ ok: false, summary: "Failed: no active msgraph-read credential; an Admin must add one" });
    expect((await db.q(sql`select failure from inbox_agent.scan order by finished_at desc limit 1`))[0].failure).toBe("no active msgraph-read credential; an Admin must add one");
  });
});
