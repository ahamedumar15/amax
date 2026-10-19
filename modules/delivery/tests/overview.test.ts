import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import manifest from "../module";
import { deliveryOverview } from "../server/overview";

const T = lumen.tenant.id;

describe.skipIf(!hasDb)("delivery Overview parts (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const as = async (key: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    setViewerScopeResolvers([manifest.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, manifest], lumen);
    await withTenant(app, T, (tx) => tx.execute(sql`insert into delivery.clock_pin (tenant_id, today) values (${T}, '2026-10-16')`));
  }, 60_000);
  afterAll(() => t?.drop());

  it("068 AC-5 and AC-7 performance month over month with a top contributor, readiness rollback first, and decisions delivery waits on", async () => {
    const p = await deliveryOverview(applyViewAs(await as("maya"), "PM"));
    expect(p.tickets).toEqual([expect.objectContaining({ label: "Proposals in flight", value: "37", note: "18 building, 9 verified" })]);
    const perf = p.panels!.find((x) => x.kind === "metric");
    expect(perf).toMatchObject({ value: "5", person: { name: "Nimal Silva", note: "14 tasks closed this month, 10 by agents for them" } });
    const ready = p.panels!.find((x) => x.kind === "progress");
    if (ready?.kind !== "progress") throw new Error("no readiness");
    expect(ready.items.map((i) => [i.label, i.done, i.total, i.note, i.problem])).toEqual([
      ["Fleet v1.8.0", 2, 4, "Rolled back from UAT on Oct 14", true], ["Contoso v2.4.0", 1, 4, "In QA, UAT next", false]]);
    expect(p.waiting!.map((w) => [w.title, w.action])).toEqual(expect.arrayContaining([["v1.8.0 failed in UAT", "Retry UAT"], ["Approve proposal CON-017 CSV import for clients", "Review"]]));
    expect(p.waiting!.every((w) => w.pin.tool === "get_release" || w.pin.tool === "get_proposal")).toBe(true);

    const leader = await deliveryOverview(applyViewAs(await as("maya"), "Leadership"));
    expect(leader.waiting!.some((w) => w.title.startsWith("Approve proposal"))).toBe(false);
  });
});
