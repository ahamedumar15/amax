import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { type ServiceContext } from "../src/server";
import { defineModule } from "../src/module";
import { completePrivacyRequest, openPrivacyRequest, type PrivacySource } from "../src/privacy";
import { as, PERSON, privacyDb, T, USERS, useTestSources } from "./privacy-fixture";

type Entry = NonNullable<PrivacySource["retention"]>[number];

const WEEK: Entry = { table: "pt.week", label: "Weeks (fictional)", subject: ["user_id", "decided_by"], subjectName: ["person_name"], fields: ["person_name", "note", "decided_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" };
const ALLOC: Entry = { table: "pt.alloc", label: "Allocations (fictional)", subject: ["person_id", "updated_by"], fields: ["person_id", "updated_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" };

describe.skipIf(!hasDb)("060 AC-2: every personal column is a subject, and erasure clears only this person's columns", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  const hana = (): ServiceContext => as("hana", ["HR"]);
  const eli = (): ServiceContext => as("eli", ["Admin"]);

  beforeAll(async () => {
    db = await privacyDb();
    await db.t.owner.unsafe(`create table pt.week (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid not null, person_name text not null, note text, decided_by text, created_at timestamptz not null default now());
      create table pt.alloc (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, person_id uuid not null, updated_by text, created_at timestamptz not null default now());
      select core.enable_tenant_rls('pt.week'); select core.enable_tenant_rls('pt.alloc'); grant select, insert, update, delete on pt.week, pt.alloc to amax_app;`);
    useTestSources([WEEK, ALLOC]);
  }, 60_000);
  afterAll(() => db?.t.drop());

  const seed = async () => {
    await db.t.owner`update privacy.request set status = 'cancelled' where status = 'open'`;
    await db.t.owner`delete from pt.week`;
    await db.t.owner`delete from pt.alloc`;
    await db.t.owner`insert into pt.week (tenant_id, user_id, person_name, note, decided_by) values (${T}, ${USERS.rowan}, 'Rowan Test', 'my week', ${`user:${USERS.sam}`})`;
    await db.t.owner`insert into pt.alloc (tenant_id, person_id, updated_by) values (${T}, ${PERSON.rowan}, ${`user:${USERS.sam}`})`;
  };
  const erase = async (person: string) => completePrivacyRequest(eli(), { id: (await openPrivacyRequest(hana(), { kind: "erasure", person })).id });
  const rows = async () => ({
    week: (await db.t.owner`select person_name, note, decided_by from pt.week`)[0],
    alloc: (await db.t.owner`select person_id::text = ${PERSON.rowan} as mine, updated_by from pt.alloc`)[0],
  });

  it.each([
    ["the employee", "rowan@example.test", { week: { person_name: "Anonymised", note: null, decided_by: `user:${USERS.sam}` }, alloc: { mine: false, updated_by: `user:${USERS.sam}` } }],
    ["the approver", "sam@example.test", { week: { person_name: "Rowan Test", note: "my week", decided_by: null }, alloc: { mine: true, updated_by: null } }],
  ])("erasing %s clears only their own columns", async (_, person, want) => {
    await seed();
    await erase(person);
    expect(await rows()).toEqual(want);
  }, 60_000);

  it("a rule that changes a personal column it can't find the person by is refused", () => {
    const retention = [{ ...WEEK, subject: ["user_id"], subjectName: [] }];
    expect(() => defineModule({ id: "pt", routes: [{ path: "" }], retention } as never)).toThrow(/changes person_name, decided_by but can't find the person/);
  });
});
