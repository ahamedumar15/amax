import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { extendStanding } from "../server/standing-jobs";
import { allocationsDatabase, T } from "./setup";

describe.skipIf(!hasDb)("109 standing allocations end cleanly and keep hand removals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => {
    db = await allocationsDatabase();
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'GONE', 'Gone tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
  }, 60_000);
  afterAll(() => db?.t.drop());
  const months = async (who: string, key: string) => Object.fromEntries((await db.tx((tx) => tx.execute(sql`select to_char(a.month, 'YYYY-MM') as m, a.percent from allocations.allocation a
    join hr.person p on p.id = a.person_id join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = ${key}`))).map((r) => [r.m as string, Number(r.percent)]));
  const set = async (person: string, key: string, month: string, percent: number, standing?: boolean) => allocate(ctxFor(await db.as("maya"), "mcp"), { person, projectKey: key, month, percent, standing });

  it.each([
    ["someone who left", "Kasun Dias", "CON", async () => { await db.t.owner`update hr.person set status = 'left' where name = 'Kasun Dias'`; }],
    ["a project that closed", "Nimal Silva", "GONE", async () => { await db.t.owner`update delivery.project set status = 'closed' where key = 'GONE'`; }],
  ])("AC1 the job ends one for %s from next month, removing the months it wrote; a month set by hand stays", async (_name, who, key, stop) => {
    await set(who, key, "2027-01", 30, true);
    await set(who, key, "2027-09", 15);
    await stop();
    await extendStanding(contextFor.job(T, "allocations.standing-extend"), { today: "2027-02-05" });
    const m = await months(who, key);
    expect([m["2027-02"], m["2027-03"], m["2027-08"], m["2027-09"], m["2027-12"]]).toEqual([30, undefined, undefined, 15, undefined]);
  });

  it.each([
    ["a new percent from the same start", "2027-01", 40, { "2027-03": undefined, "2027-04": 40, "2027-11": undefined }],
    ["a later start", "2027-05", 25, { "2027-04": 30, "2027-05": 25, "2027-11": undefined }],
  ])("AC2 a re-set with %s keeps the months removed by hand", async (_name, from, percent, expected) => {
    const who = "Tharushi Wijesinghe";
    await db.t.owner`delete from allocations.standing where person_id = (select id from hr.person where name = ${who})`;
    await db.t.owner`delete from allocations.allocation where person_id = (select id from hr.person where name = ${who})`;
    await set(who, "CON", "2027-01", 30, true);
    for (const m of ["2027-03", "2027-11"]) await set(who, "CON", m, 0);
    await set(who, "CON", from, percent, true);
    const m = await months(who, "CON");
    for (const [month, value] of Object.entries(expected)) expect([month, m[month]]).toEqual([month, value]);
  });
});
