import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { addPerson } from "../server/services";
import { hrDatabase } from "./setup";

// 109 AC-5: Sri Lanka is UTC+5:30 and Australia (Sydney) UTC+11 in November. At 20:00 UTC it is already the next day in
// both, and at 23:00 UTC still the same day in neither; one entity-local today decides the join date and the status.
describe.skipIf(!hasDb)("109 one today for add_person (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => {
    db = await hrDatabase();
    // ENTITY_ZONES knows only Sri Lanka; Australia's zone is the entity's own setting.
    await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone)
      select id, tenant_id, 'Australia/Sydney' from core.legal_entity where country = 'AU' on conflict (legal_entity_id) do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ["Sri Lanka, the evening before in UTC", "Sri Lanka", "2026-11-15T20:00:00Z", "2026-11-16"],
    ["Australia, the evening before in UTC", "Australia", "2026-11-15T20:00:00Z", "2026-11-16"],
    ["Sri Lanka, the same day in UTC", "Sri Lanka", "2026-11-16T06:00:00Z", "2026-11-16"],
  ])("AC5 %s: joins today, there, and is active at once", async (_name, entity, now, joined) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const name = `Test ${entity} ${now}`;
    const r = await addPerson(ctxFor(await db.as("sahan"), "mcp"), { name, title: "Engineer", department: "Engineering", entity });
    const [p] = await db.tx((tx) => tx.execute(sql`select to_char(joined_on, 'YYYY-MM-DD') as joined, status from hr.person where name = ${name}`));
    expect([r.status, p.joined, p.status]).toEqual(["active", joined, "active"]);
  });
});
