import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { policyPatch } from "@amax/ai/admin";
import { keptExpiry } from "../../lib/admin/secrets";
import { auditArea } from "../../lib/admin/status";
import { adminDb, AU } from "./fixture";

// 052 module-end review of settings/admin: one table per class of finding.

describe("052 rotate_secret keeps only an expiry that is still ahead", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it.each([
    { name: "no expiry stays none", at: null, keeps: null },
    { name: "a future expiry is kept", at: new Date("2026-12-31T23:59:59Z"), keeps: "2026-12-31T23:59:59.000Z" },
    { name: "a past expiry is refused, never dropped", at: new Date("2026-10-01T23:59:59Z"), keeps: "refused" },
    { name: "one that ends this instant is past", at: now, keeps: "refused" },
  ])("$name", ({ at, keeps }) => {
    if (keeps === "refused") expect(() => keptExpiry("github", at, now)).toThrow(/has passed; give a new expiresAt/);
    else expect(keptExpiry("github", at, now)).toBe(keeps);
  });
});

describe("052 set_ai_policy takes only known regions", () => {
  it.each([
    [{ dataRegion: "AU" }, true], [{ dataRegion: "Australia" }, true], [{ aiRegion: null }, true], [{ providerRegion: "US" }, true],
    [{ dataRegion: "Mars" }, false], [{ dbRegion: "au-east-1" }, false], [{ storageRegion: "" }, true], [{ providerRegion: "somewhere" }, false], [{ aiRegion: "ZZ" }, false],
  ] as const)("%j → %s", (input, ok) => {
    expect(policyPatch.safeParse(input).success).toBe(ok);
  });
});

describe("052 the hub's Audit card leads with a broken chain", () => {
  const ok = { ok: true, length: 3 } as never;
  const bad = { ok: false, length: 3, brokenAt: 2 } as never;
  it.each([
    { audit: ok, trace: ok, tone: "info", attention: undefined },
    { audit: bad, trace: ok, tone: "bad", attention: "the audit chain no longer verifies" },
    { audit: ok, trace: bad, tone: "bad", attention: "the trace chain no longer verifies" },
    { audit: bad, trace: bad, tone: "bad", attention: "the audit and trace chains no longer verify" },
  ])("audit $audit.ok, trace $trace.ok", ({ audit, trace, tone, attention }) => {
    const a = auditArea(4, { audit, trace });
    expect(a.chip.tone).toBe(tone);
    expect(a.attention).toBe(attention);
  });
});

describe.skipIf(!hasDb)("052 admin tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
  });
  afterAll(() => db?.t.drop());

  it("a schedule title shared by per-entity schedules is refused; a full label, id or unique title resolves", async () => {
    const maya = await db.as("maya");
    const all = (await db.registry.call(maya, "list_schedules", {}, { source: "mcp" })) as { id: string; title: string; entity: string | null }[];
    const pay = all.filter((s) => s.title === "Payroll reminder");
    expect(pay.length).toBeGreaterThan(1);
    const au = pay.find((s) => s.entity === AU.name)!;
    const cases: [string, string | RegExp][] = [
      ["Payroll reminder", /names \d+ schedules; say which: 'Payroll reminder, /],
      ["payroll REMINDER", /names \d+ schedules/],
      [`Payroll reminder, ${AU.name}`, au.id],
      [au.id, au.id],
      ["Audit chain check", all.find((s) => s.title === "Audit chain check")!.id],
      ["No such schedule", /not found/],
    ];
    for (const [ref, want] of cases) {
      const call = db.registry.call(maya, "get_schedule", { schedule: ref }, { source: "mcp" });
      if (typeof want === "string") expect((await call as { id: string }).id, ref).toBe(want);
      else await expect(call, ref).rejects.toThrow(want);
    }
    await expect(db.registry.call(maya, "set_schedule_enabled", { schedule: "Payroll reminder", enabled: false }, { source: "mcp" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("each Integrations module card pins a read tool that returns that module's tools", async () => {
    const maya = await db.as("maya");
    for (const module of ["settings", "core"]) {
      const tools = (await db.registry.call(maya, "list_mcp_tools", { module }, { source: "mcp" })) as { module: string; name: string }[];
      expect(tools.length, module).toBeGreaterThan(0);
      expect(new Set(tools.map((t) => t.module))).toEqual(new Set([module]));
    }
    expect(await db.registry.call(maya, "list_mcp_tools", { module: "nothing-here" }, { source: "mcp" })).toEqual([]);
  });

  it("the Events card's pin and the Failed runs pin are accepted by their read tools", async () => {
    const maya = await db.as("maya");
    for (const args of [{ limit: 100 }, { query: "maya", chain: "audit", sinceDays: 7, limit: 100 }, { chain: "trace", limit: 100 }]) {
      await expect(db.registry.call(maya, "search_audit", args, { source: "mcp" })).resolves.toBeInstanceOf(Array);
    }
    const failed = (await db.registry.call(maya, "list_workflow_runs", { status: "failed" }, { source: "mcp" })) as { status: string }[];
    expect(failed.every((r) => r.status === "failed")).toBe(true);
  });
});
