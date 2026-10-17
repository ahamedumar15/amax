import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { appendAudit, contextFor, type ServiceContext } from "../src/server";
import { completePrivacyRequest, effective, EXCLUDED_BY_APPROVER, inventoryFor, loadPeriods, openPrivacyRequest, placeLegalHold, previewPurge, privacyOverview, purgeDue, releaseLegalHold, setRetentionPeriod, type PrivacySource } from "../src/privacy";
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
  it.each<[string, Entry, boolean]>([
    ["a subject column that doesn't exist", { table: "pt.person", label: "Broken subject (fictional)", subject: ["no_such_column"], fields: ["left_on"], class: "personal", period: "P1Y", start: { at: ["left_on"] }, action: "anonymise" }, false],
    ["a table that doesn't exist", { table: "pt.gone", label: "Missing table (fictional)", subject: ["id"], fields: ["body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" }, true],
    ["a name column that doesn't exist", { table: "pt.note", label: "Broken name (fictional)", subjectName: ["no_such_name"], fields: ["created_at"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" }, false],
  ])("refuses to open a request when a rule has %s, and says which", async (_, broken, purge) => {
    await withExtra(broken);
    const inv = await db.tx((tx) => inventoryFor(tx, "Rowan Test"));
    expect(inv.items.find((i) => i.label === broken.label)).toMatchObject({ unchecked: expect.stringMatching(/^could not check/) });
    await expect(openPrivacyRequest(hana(), { kind: "erasure", person: "Rowan Test" })).rejects.toThrow(`could not check ${broken.label}`);
    // B3: the screen shows the rule as unknown too, whether or not tonight's purge (which reads no
    // subject column) fails on it (review round 2).
    void purge;
    expect((await privacyOverview(hana())).unchecked).toContain(broken.label);
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

  // B1 (rounds 2 and 3): a name doesn't identify a person. Rows found only by name are never acted on
  // automatically: the approver checks them and decides, and the request records that decision.
  const nameCase = async (spelled: string, kind: "erasure" | "access") => {
    await withExtra(TASK);
    await db.t.owner`delete from pt.task`;
    await db.t.owner`insert into pt.task (tenant_id, owner_name) values (${T}, ${spelled}), (${T}, 'Ivy Test')`;
    await db.t.owner`update privacy.request set status = 'cancelled' where status = 'open'`;
    await db.t.owner`update pt.person set name = 'Rowan Test' where user_id = ${USERS.rowan}`;
    const opened = await openPrivacyRequest(hana(), { kind, person: "rowan@example.test" });
    expect(opened.inventory.find((i) => i.label === `${TASK.label}, by name`)).toMatchObject({ n: 1, review: expect.stringMatching(/^needs review/) });
    expect(opened.review).toBe(1);
    await expect(completePrivacyRequest(sam(), { id: opened.id })).rejects.toThrow(/name the person only by name/);
    expect((await db.t.owner`select status from privacy.request where id = ${opened.id}`)[0].status).toBe("open");
    return opened;
  };
  const tasks = async () => (await db.t.owner`select owner_name from pt.task order by owner_name nulls first`).map((r) => r.owner_name);

  it.each([["exact", "Rowan Test"], ["other case", "ROWAN TEST"], ["padded", "  rowan test "]])("erasure: a name-only row spelled %s waits for the approver; include erases it", async (_, spelled) => {
    const opened = await nameCase(spelled, "erasure");
    await completePrivacyRequest(sam(), { id: opened.id, byName: "include" });
    expect(await tasks()).toEqual([null, "Ivy Test"]);
  }, 60_000);

  it("erasure: exclude keeps the name-only rows as someone else's, and says so", async () => {
    const opened = await nameCase("Rowan Test", "erasure");
    const done = await completePrivacyRequest(sam(), { id: opened.id, byName: "exclude" });
    expect(await tasks()).toEqual(["Ivy Test", "Rowan Test"]);
    expect(done.kept.find((i) => i.label === `${TASK.label}, by name`)?.kept).toBe(EXCLUDED_BY_APPROVER);
    expect(done).toMatchObject({ status: "completed", review: 0 });
  }, 60_000);

  it.each([["include", ["pt.task"]], ["exclude", []]] as const)("access: %s puts the name-only rows in the package or leaves them out", async (choice, tables) => {
    const opened = await nameCase("Rowan Test", "access");
    await completePrivacyRequest(sam(), { id: opened.id, byName: choice });
    const [pkg] = await db.t.owner`select package from privacy.request where id = ${opened.id}`;
    expect(pkg.package.sections.map((x: { table: string }) => x.table).filter((t: string) => t === "pt.task")).toEqual(tables);
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

  // Review 058 round 2: a rule kept for security has a floor no tenant period goes below.
  const FLOORED: Entry = { table: "pt.note", label: "Signed call log (fictional)", fields: ["created_at"], class: "personal", period: "P90D", minimum: "P90D", start: { at: ["created_at"] }, action: "delete" };
  it.each([["P1D", false], ["P30D", false], ["P12W", false], ["P90D", true], ["P1Y", true]] as const)("setting %s on a P90D floor: allowed %s", async (period, ok) => {
    await withExtra(FLOORED);
    const set = setRetentionPeriod(hana(), { rule: FLOORED.label!, period });
    if (ok) await expect(set).resolves.toMatchObject({ period });
    else await expect(set).rejects.toThrow(/can't be kept for less than P90D/);
  }, 60_000);

  it("a period stored below the floor still runs at the floor", async () => {
    await withExtra(FLOORED);
    await db.t.owner`delete from privacy.retention_period`;
    await db.t.owner`insert into privacy.retention_period (tenant_id, rule, period, set_by) values (${T}, 'pt.note.created_at', 'P1D', 'user:test')`;
    const p = await db.tx((tx) => loadPeriods(tx));
    const rule = { id: "pt.note.created_at", class: "personal" as const, period: "P90D" as const, minimum: "P90D" as const };
    expect(effective(p, rule, null).period).toBe("P90D");
    // And the purge itself: with the P1D override stored, a 60-day-old note isn't due, a 100-day-old one is.
    await db.t.owner`insert into pt.note (tenant_id, body, created_at) values (${T}, 'floor test', now() - interval '100 days')`;
    const out = await db.tx((tx) => previewPurge(tx));
    expect(out.counts.find((c) => c.rule === "pt.note.created_at")?.n).toBe(1);
    await db.t.owner`delete from pt.note where body = 'floor test'`;
    await db.t.owner`delete from privacy.retention_period`;
  }, 60_000);
});

