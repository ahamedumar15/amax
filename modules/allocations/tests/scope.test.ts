import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { getPerson } from "@amax/hr/contracts";
import { CAPACITY, DEMAND } from "../fixtures/plan";
import { listAllocations, personMonthTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { forecastFor } from "../server/forecast";
import { gridFor } from "../server/grid";
import { allocate, copyMonth, MAX_MONTHS } from "../server/services";
import { allocationsDatabase, T, TODAY } from "./setup";

// Review round 1 (010): hr data scope on the screens and contract reads, fail-closed allocation, ranges.
describe.skipIf(!hasDb)("allocations data scope (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  let auOnly: Viewer;
  const sys = () => contextFor.job(T, "allocations.test");
  beforeAll(async () => {
    db = await allocationsDatabase();
    const [au] = await db.tx((tx) => tx.execute(sql`select id from core.legal_entity where country = 'AU'`));
    auOnly = { ...(await db.as("sarah")), viewAs: undefined, assignments: [{ role: "HR", legalEntityIds: [au.id as string], departments: null }] };
  }, 60_000);
  afterAll(() => db?.t.drop());

  it.each([
    { who: "Leadership", viewer: () => db.as("maya", "Leadership"), hidden: false },
    { who: "PM", viewer: () => db.as("maya", "PM"), hidden: false },
    { who: "HR limited to Australia", viewer: async () => auOnly, hidden: true },
  ])("the forecast counts every member whatever the viewer's hr scope; the grid says who it hides: $who", async ({ viewer, hidden }) => {
    const v = await viewer();
    const f = await forecastFor(v, { today: TODAY });
    expect(f.months.map((m) => m.capacity)).toEqual(CAPACITY);
    expect(f.months.map((m) => m.demand)).toEqual(DEMAND);
    const g = await gridFor(v, { today: TODAY, everyone: true });
    const all = await gridFor(await db.as("maya", "Leadership"), { today: TODAY, everyone: true });
    expect(g.people.length + g.hidden).toBe(all.people.length);
    expect(g.hidden > 0).toBe(hidden);
    if (hidden) expect(g.people.map((p) => p.name)).not.toContain("Kasun Dias");
  });

  it.each([
    { who: "system job", reader: () => sys(), rows: 2, hidden: 0 },
    { who: "Leadership", reader: () => db.as("maya", "Leadership"), rows: 2, hidden: 0 },
    { who: "HR limited to Australia, asking for Ayesha", reader: async () => auOnly, rows: 0, hidden: 1 },
  ])("contract reads return only the people the reader may see, and count the rest: $who", async ({ reader, rows, hidden }) => {
    const r = await reader();
    await db.tx(async (tx) => {
      const ayesha = (await getPerson(tx, sys(), "LL-0291"))!;
      const list = await listAllocations(tx, r, { from: "2026-12-01", to: "2026-12-31", personIds: [ayesha.id] });
      expect([list.rows.length, list.hidden]).toEqual([rows, hidden]);
      const totals = await personMonthTotals(tx, r, { from: "2026-12-01", to: "2026-12-01", personIds: [ayesha.id] });
      expect([totals.rows.length, totals.hidden]).toEqual([rows ? 1 : 0, hidden]);
    });
  });

  it.each([
    { who: "a principal with no viewer", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "sp:x", kind: "service" }, source: "api", principal: {} } as never), ok: false },
    { who: "a hand-built system literal", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "job:x", kind: "system" }, source: "job" }), ok: false },
    { who: "a system job core issued", ctx: () => sys(), ok: true },
    { who: "a PM on a project they manage", ctx: async () => ctxFor(await db.as("maya", "PM")), ok: true },
  ])("allocating without a viewer fails closed: $who", async ({ ctx, ok }) => {
    const run = allocate(await ctx(), { person: "LL-0417", projectKey: "CON", month: "2027-05", percent: 10 });
    if (ok) await expect(run).resolves.toMatchObject({ months: ["2027-05-01"] });
    else await expect(run).rejects.toThrow(/forbidden|data scope/);
  });

  it.each([
    { who: "a principal with no viewer", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "sp:x", kind: "service" }, source: "api", principal: {} } as never), copies: false },
    { who: "a hand-built system literal", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "job:x", kind: "system" }, source: "job" }), copies: false },
    { who: "a system job core issued", ctx: () => sys(), copies: true },
  ])("Copy to next month copies nothing without a viewer unless core issued the context: $who", async ({ ctx, copies }) => {
    // Fixtures plan December, and some of it isn't in January yet, so there is something to copy.
    const r = await copyMonth(await ctx(), { from: "2026-12" }).catch((e: Error) => ({ error: e.message }));
    if (copies) expect(r).toMatchObject({ skipped: 0, copied: expect.any(Number) });
    else if ("copied" in r) expect(r.copied === 0 && r.skipped > 0).toBe(true);
    else expect(r.error).toMatch(/forbidden/);
  });

  it.each([
    { month: "2027-03", through: "2027-01", ok: false, why: /before month/ },
    { month: "2027-01", through: "2029-01", ok: false, why: /at most 24 months/ },
    { month: "2027-01", through: "2028-12", ok: true, months: MAX_MONTHS },
    { month: "2027-01", through: "2027-03", ok: true, months: 3 },
  ])("allocate ranges: $month to $through", async ({ month, through, ok, why, months }) => {
    const run = allocate(sys(), { person: "LL-0417", work: "Range check", month, through, percent: 5 });
    if (ok) expect((await run).months).toHaveLength(months!);
    else await expect(run).rejects.toThrow(why);
  });
});
