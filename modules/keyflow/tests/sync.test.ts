import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { connectKeyflow } from "../server/services";
import { ctxFor } from "../server/context";
import { setTestTransport, runSync } from "../server/sync";
import { keyflowDb, T } from "./db";
import { fakeKeyflow } from "./fake";

describe.skipIf(!hasDb)("the two-way sync against a fake Keyflow (Postgres)", () => {
  let db: Awaited<ReturnType<typeof keyflowDb>>;
  beforeAll(async () => { db = await keyflowDb(); }, 120_000);
  afterEach(() => setTestTransport(null));
  afterAll(() => db?.t.drop());
  const errors = () => db.q(sql`select kind, coalesce(person_name, external_ref) as who, runs from keyflow.sync_error where dismissed_at is null order by kind, who`);

  it("AC1 people and teams go out as deltas, goals, scores and recognition come in, and a refused person who is later accepted closes their error", async () => {
    const kasun = await db.personId("LL-0417");
    const kf = fakeKeyflow({ changes: {
      goals: [{ id: "g-new", personRef: kasun, title: "Write the on-call runbook", status: "on-track", progress: 5 }, { id: "g-bad", personRef: kasun, title: "", status: "maybe", progress: 400 }],
      reviews: [{ id: "r-new", personRef: kasun, cycle: "2026 Q3 check-in", score: 4, scale: 5, rating: null, reviewedOn: "2026-10-10" }],
      recognition: [{ id: "k-new", personRef: "kf-0001", fromName: "Someone", message: "Thanks (fictional)", givenOn: "2026-10-11" }],
    } });
    setTestTransport(kf.transport);
    expect(await runSync(T)).toEqual({ ok: true, summary: "Sent 2 people and 0 teams; got 1 goal, 1 review score and 0 recognitions; 2 errors" });
    expect(kf.pushed[0].people.map((p) => [p.name, p.status])).toEqual([["Lahiru Liyanage", "joining"], ["Mohamed Rifkhan", "joining"]]);
    expect(kf.cursors).toEqual(["sandbox:1"]);
    expect(await errors()).toEqual([{ kind: "invalid", who: null, runs: 1 }, { kind: "unmatched", who: "kf-0001", runs: 1 }, { kind: "unmatched", who: "kf-9031", runs: 1 }]);
    expect(await db.q(sql`select title, progress from keyflow.goal where external_id = 'g-new'`)).toEqual([{ title: "Write the on-call runbook", progress: 5 }]);

    await db.q(sql`update hr.person set title = 'Principal engineer' where id = ${kasun}`);
    const again = fakeKeyflow();
    setTestTransport(again.transport);
    expect((await runSync(T)).summary).toBe("Sent 1 person and 0 teams; got 0 goals, 0 review scores and 0 recognitions");
    expect(again.pushed[0].people.map((p) => [p.name, p.title])).toEqual([["Kasun Dias", "Principal engineer"]]);
    expect(again.cursors).toEqual(["c2"]);
    expect((await db.q(sql`select status, people_out, errors, started_by from keyflow.sync_run order by finished_at desc limit 1`))[0]).toEqual({ status: "completed", people_out: 1, errors: 0, started_by: "job:keyflow.sync" });
    expect((await db.q(sql`select count(*)::int as n from core.audit_event where action = 'keyflow.sync.record'`))[0].n).toBe(2);
  });

  it("AC2 a Keyflow failure, an unreachable endpoint and a missing key are failed runs with their reason, never the key", async () => {
    setTestTransport(fakeKeyflow({ fail: "Keyflow answered 503" }).transport);
    expect(await runSync(T)).toEqual({ ok: false, summary: "Failed: Keyflow answered 503" });
    setTestTransport(null);
    await connectKeyflow(ctxFor(await db.as("ravi")), { endpoint: "https://lumen.keyflow.example" });
    expect(await runSync(T)).toEqual({ ok: false, summary: "Failed: no active keyflow credential; an Admin must add one" });
    expect(await db.q(sql`select status, failure from keyflow.sync_run where status = 'failed' order by finished_at desc limit 2`)).toEqual([
      { status: "failed", failure: "no active keyflow credential; an Admin must add one" }, { status: "failed", failure: "Keyflow answered 503" }]);
    expect((await db.q(sql`select count(*)::int as n from keyflow.link`))[0].n).toBe(0);
    expect((await db.q(sql`select count(*)::int as n from core.event where name = 'keyflow.sync.failed'`))[0].n).toBe(2);
  });
});
