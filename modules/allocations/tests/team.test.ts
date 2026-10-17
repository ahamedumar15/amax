import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { teamFor } from "../server/team";
import { allocationsDatabase, TODAY } from "./setup";

describe.skipIf(!hasDb)("project team (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  let auOnly: Viewer;
  beforeAll(async () => {
    db = await allocationsDatabase();
    const [au] = await db.tx((tx) => tx.execute(sql`select id from core.legal_entity where country = 'AU'`));
    auOnly = { ...(await db.as("sarah")), viewAs: undefined, assignments: [{ role: "HR", legalEntityIds: [au.id as string], departments: null }] };
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC3 lists this project's people for three months with role and percent, and hides people outside the viewer's hr scope", async () => {
    const leader = await teamFor(await db.as("maya", "Leadership"), "CON", TODAY);
    expect(leader!.months).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(leader!.people.length).toBeGreaterThan(0);
    const [ids] = await db.tx((tx) => tx.execute(sql`select count(distinct person_id)::int as n from allocations.allocation a join delivery.project p on p.id = a.project_id
      where p.key = 'CON' and a.month between '2026-10-01' and '2026-12-01'`));
    expect(leader!.people.length + leader!.hidden).toBe(ids.n);
    for (const p of leader!.people) {
      expect(p.role).toBeTruthy();
      expect(p.percents.some((n) => n !== null && n > 0)).toBe(true);
    }
    const other = await teamFor(await db.as("maya", "Leadership"), "AMX", TODAY);
    expect(other?.people.map((p) => p.personId) ?? []).not.toEqual(leader!.people.map((p) => p.personId));
    const limited = await teamFor(auOnly, "CON", TODAY);
    expect(limited!.people.length + limited!.hidden).toBe(ids.n);
    expect(limited!.people.length).toBeLessThan(leader!.people.length);
    await expect(teamFor(await db.as("maya", "Engineer"), "CON", TODAY)).rejects.toThrow();
  }, 60_000);
});
