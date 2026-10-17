import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { appendAudit, contextFor, type ServiceContext } from "../src/server";
import { completePrivacyRequest, inventoryFor, openPrivacyRequest, placeLegalHold, privacyOverview, purgeDue, releaseLegalHold, type PrivacySource } from "../src/privacy";
import { as, privacyDb, T, USERS, useTestSources } from "./privacy-fixture";

type Entry = NonNullable<PrivacySource["retention"]>[number];

const TASK: Entry = { table: "pt.task", label: "Tasks by name (fictional)", subjectName: ["owner_name"], fields: ["owner_name"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "anonymise" };
const withExtra = async (...extra: Entry[]) => useTestSources(extra);

describe.skipIf(!hasDb)("058 review: privacy requests fail closed and reach every row about the person", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  const hana = (): ServiceContext => as("hana", ["HR"]);
  const sam = (): ServiceContext => as("sam", ["Admin"]);

  beforeAll(async () => {
    db = await privacyDb();
    await db.t.owner.unsafe(`create table pt.task (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_name text, created_at timestamptz not null default now());
      select core.enable_tenant_rls('pt.task'); grant select, insert, update, delete on pt.task to amax_app;`);
  }, 60_000);
  afterAll(() => db?.t.drop());

  // B3: a rule that can't be counted is "could not check", and the request refuses to open.
  // `purge`: whether tonight's purge (which doesn't use the subject columns) also fails on it.
  it.each<[string, Entry, boolean]>([
    ["a subject column that doesn't exist", { table: "pt.person", label: "Broken subject (fictional)", subject: ["no_such_column"], fields: ["name"], class: "personal", period: "P1Y", start: { at: ["left_on"] }, action: "anonymise" }, false],
    ["a table that doesn't exist", { table: "pt.gone", label: "Missing table (fictional)", subject: ["id"], fields: ["body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" }, true],
    ["a name column that doesn't exist", { table: "pt.note", label: "Broken name (fictional)", subjectName: ["no_such_name"], fields: ["body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" }, false],
  ])("refuses to open a request when a rule has %s, and says which", async (_, broken, purge) => {
    await withExtra(broken);
    const inv = await db.tx((tx) => inventoryFor(tx, "Rowan Test"));
    expect(inv.items.find((i) => i.label === broken.label)).toMatchObject({ unchecked: expect.stringMatching(/^could not check/) });
    await expect(openPrivacyRequest(hana(), { kind: "erasure", person: "Rowan Test" })).rejects.toThrow(`could not check ${broken.label}`);
    // B3: the screen shows a rule its preview couldn't count as unknown, never as 0.
    if (purge) expect((await privacyOverview(hana())).unchecked).toContain(broken.label);
    expect((await db.t.owner`select count(*)::int as n from privacy.request`)[0].n).toBe(0);
  }, 60_000);

  it("refuses to complete a request when a rule breaks after it was opened, and leaves it open", async () => {
    await withExtra();
    const opened = await openPrivacyRequest(hana(), { kind: "access", person: "Ivy Test" });
    await withExtra({ table: "pt.gone", label: "Missing table (fictional)", subject: ["id"], fields: ["body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" });
    await expect(completePrivacyRequest(sam(), { id: opened.id })).rejects.toThrow(/could not check Missing table/);
    expect((await db.t.owner`select status from privacy.request where id = ${opened.id}`)[0].status).toBe("open");
    await db.t.owner`update privacy.request set status = 'cancelled' where id = ${opened.id}`;
  }, 60_000);

  // B1: rows that record the person only by name are found, erased and held by that name.
  it.each([["exact", "Rowan Test"], ["other case", "ROWAN TEST"], ["padded", "  rowan test "]])("erasure reaches a name-only row spelled %s", async (_, spelled) => {
    await withExtra(TASK);
    await db.t.owner`delete from pt.task`;
    await db.t.owner`insert into pt.task (tenant_id, owner_name) values (${T}, ${spelled}), (${T}, 'Ivy Test')`;
    await db.t.owner`delete from privacy.request`;
    await db.t.owner`update pt.person set name = 'Rowan Test' where user_id = ${USERS.rowan}`;
    const opened = await openPrivacyRequest(hana(), { kind: "erasure", person: "rowan@example.test" });
    expect(opened.inventory.find((i) => i.label === TASK.label)).toMatchObject({ n: 1 });
    await completePrivacyRequest(sam(), { id: opened.id });
    expect((await db.t.owner`select owner_name from pt.task order by owner_name nulls first`).map((r) => r.owner_name)).toEqual([null, "Ivy Test"]);
  }, 60_000);

  it("a person hold keeps their name-only rows out of the purge", async () => {
    await withExtra(TASK);
    await db.t.owner`delete from pt.task`;
    await db.t.owner`insert into pt.task (tenant_id, owner_name, created_at) values (${T}, 'Ivy Test', now() - interval '90 days'), (${T}, 'Eli Test', now() - interval '90 days')`;
    const hold = await placeLegalHold(hana(), { kind: "person", person: "ivy@example.test", reason: "Fictional claim" });
    const out = await purgeDue(contextFor.job(T, "privacy.purge"), {});
    expect(out.paused).not.toContain("pt.task.owner_name");
    expect((await db.t.owner`select owner_name from pt.task order by owner_name nulls first`).map((r) => r.owner_name)).toEqual([null, "Ivy Test"]);
    await releaseLegalHold(hana(), { id: hold.id });
  }, 60_000);

  // B1: ids resolved after the request was opened are erased, held and stored with it.
  it("erases and stores the ids the person gained after the request was opened", async () => {
    await withExtra();
    await db.t.owner`delete from privacy.request`;
    const opened = await openPrivacyRequest(hana(), { kind: "erasure", person: "eli@example.test" });
    const [later] = await db.t.owner`insert into pt.person (id, tenant_id, user_id, legal_entity_id, name, left_on) values (gen_random_uuid(), ${T}, ${USERS.eli}, null, 'Eli Test', now() - interval '3 years') returning id::text`;
    await db.tx((tx) => appendAudit(tx, { ...as("hana", []), source: "ui" }, { action: "pt.person.create", resource: "pt.person", resourceId: later.id, after: { name: "Eli Test" } }));
    const hold = await placeLegalHold(hana(), { kind: "matter", matter: "Fictional matter", ids: [later.id], reason: "Fictional dispute" });
    await expect(completePrivacyRequest(sam(), { id: opened.id })).rejects.toThrow(/legal hold/);
    await releaseLegalHold(hana(), { id: hold.id });
    await completePrivacyRequest(sam(), { id: opened.id });
    const [req] = await db.t.owner`select subjects from privacy.request where id = ${opened.id}`;
    expect(req.subjects).toContain(later.id);
    expect((await db.t.owner`select name from pt.person where id = ${later.id}`)[0].name).toBe("Anonymised");
    expect((await db.t.owner`select count(*)::int as n from core.audit_event where chain_v = 2 and resource_id = ${later.id}`)[0].n).toBe(0);
  }, 60_000);
});
