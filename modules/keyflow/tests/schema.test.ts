import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import manifest from "../module";
import { syncOverview } from "../server/overview";
import { keyflowDb } from "./db";

describe.skipIf(!hasDb)("keyflow schema and the sync screen's numbers (Postgres)", () => {
  let db: Awaited<ReturnType<typeof keyflowDb>>;
  beforeAll(async () => { db = await keyflowDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC2 the tables are tenant-isolated, retention names real columns, and the sandbox fixtures show three errors, a failed run and what synced", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const cols = async (table: string) => new Set((await db.t.owner`select column_name from information_schema.columns where table_schema = 'keyflow' and table_name = ${table}`).map((c) => c.column_name as string));
    for (const r of manifest.retention ?? []) {
      const have = await cols(r.table.split(".")[1]);
      expect([...r.fields, ...r.start.at, ...(r.subject ?? []), ...(r.subjectName ?? [])].filter((c) => !have.has(c)), r.label).toEqual([]);
    }
    expect(manifest.retention?.find((r) => r.table === "keyflow.review_score")?.class).toBe("performance");
    const o = await syncOverview(await db.as("ravi"));
    expect(o.connection).toMatchObject({ sandbox: true, endpoint: null });
    expect(o.errors.map((e) => [e.kind, e.personName ?? e.externalRef, e.runs])).toEqual([["refused", "Lahiru Liyanage", 2], ["refused", "Mohamed Rifkhan", 2], ["unmatched", "kf-9031", 1]]);
    expect(o.runs.map((r) => [r.status, r.peopleOut, r.teamsOut, r.goalsIn + r.reviewsIn + r.recognitionIn, r.errors])).toEqual([
      ["completed-with-errors", 0, 0, 0, 2], ["failed", 0, 0, 0, 0], ["completed-with-errors", 184, 8, 22, 3]]);
    expect([o.out, o.in]).toEqual([{ people: 184, teams: 8 }, { goals: 11, reviews: 5, recognition: 6 }]);
    const other = "22222222-2222-4222-8222-222222222222";
    expect(await withTenant(db.app, other, (tx) => tx.execute(sql`select count(*)::int as n from keyflow.goal`))).toEqual([{ n: 0 }]);
  });
});
