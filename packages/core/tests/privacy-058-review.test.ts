import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { appendAudit, contextFor, type ServiceContext } from "../src/server";
import { completePrivacyRequest, effective, EXCLUDED_BY_APPROVER, requestNameRows, inventoryFor, loadPeriods, openPrivacyRequest, placeLegalHold, previewPurge, privacyOverview, purgeDue, releaseLegalHold, setRetentionPeriod, type PrivacySource } from "../src/privacy";
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
    for (const table of ["task", "risk"]) {
      await db.t.owner.unsafe(`create table pt.${table} (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_name text, created_at timestamptz not null default now());
        select core.enable_tenant_rls('pt.${table}'); grant select, insert, update, delete on pt.${table} to amax_app;`);
    }
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

  // B1 (rounds 2 to 4): a name doesn't identify a person. Rows found only by name are never acted on
  // automatically: the approver sees each one and decides row by row, across every table, and a
  // namesake's row with the very same spelling is kept while the person's own is acted on.
  const RISK: Entry = { table: "pt.risk", label: "Risks by name (fictional)", subjectName: ["owner_name"], fields: ["owner_name"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "anonymise" };
  const setup = async (kind: "erasure" | "access") => {
    await withExtra(TASK, RISK);
    await db.t.owner`delete from pt.task`;
    await db.t.owner`delete from pt.risk`;
    // Two "Rowan Test" tasks: one is Rowan's, one a namesake's (a client contact). One risk is Rowan's.
    const [own, namesake] = await db.t.owner`insert into pt.task (tenant_id, owner_name) values (${T}, 'Rowan Test'), (${T}, 'rowan test') returning id::text`;
    const [risk] = await db.t.owner`insert into pt.risk (tenant_id, owner_name) values (${T}, ' ROWAN TEST ') returning id::text`;
    await db.t.owner`insert into pt.task (tenant_id, owner_name) values (${T}, 'Ivy Test')`;
    await db.t.owner`update privacy.request set status = 'cancelled' where status = 'open'`;
    await db.t.owner`update pt.person set name = 'Rowan Test' where user_id = ${USERS.rowan}`;
    const opened = await openPrivacyRequest(hana(), { kind, person: "rowan@example.test" });
    expect(opened.review).toBe(3);
    const listed = await db.tx((tx) => requestNameRows(tx, opened.id));
    expect(listed.map((l) => [l.label, l.rows.map((r) => r.id).sort()])).toEqual([[`${TASK.label}, by name`, [own.id, namesake.id].sort()], [`${RISK.label}, by name`, [risk.id]]]);
    return { opened, own: own.id, namesake: namesake.id, risk: risk.id };
  };
  const owners = async (table: "task" | "risk") => (await db.t.owner.unsafe(`select id::text, owner_name from pt.${table}`)).reduce((m, r) => ({ ...m, [r.id]: r.owner_name }), {} as Record<string, string | null>);

  it.each([
    ["no decision", (_: Awaited<ReturnType<typeof setup>>) => undefined, /still need a decision: Tasks by name \(fictional\), by name \(2\), Risks by name \(fictional\), by name \(1\)/],
    ["one table decided, the other not", (x: Awaited<ReturnType<typeof setup>>) => ({ include: [x.own], exclude: [x.namesake] }), /still need a decision: Risks by name/],
    ["one row of a table left out", (x: Awaited<ReturnType<typeof setup>>) => ({ include: [x.own, x.risk], exclude: [] }), /still need a decision: Tasks by name \(fictional\), by name \(1\)/],
    ["an id the request didn't list", (x: Awaited<ReturnType<typeof setup>>) => ({ include: [x.own, x.risk, "00000000-0000-4000-8000-00000000dead"], exclude: [x.namesake] }), /aren't rows this request found by name/],
    ["a row in both lists", (x: Awaited<ReturnType<typeof setup>>) => ({ include: [x.own, x.risk, x.namesake], exclude: [x.namesake] }), /can't be both/],
  ])("refuses to complete with %s, and the request stays open", async (_, decision, error) => {
    const x = await setup("erasure");
    await expect(completePrivacyRequest(sam(), { id: x.opened.id, nameRows: decision(x) as never })).rejects.toThrow(error);
    expect((await db.t.owner`select status from privacy.request where id = ${x.opened.id}`)[0].status).toBe("open");
  }, 60_000);

  it("erasure acts on exactly the rows the approver included, across tables, and keeps the namesake's", async () => {
    const x = await setup("erasure");
    const done = await completePrivacyRequest(sam(), { id: x.opened.id, nameRows: { include: [x.own, x.risk], exclude: [x.namesake] } });
    expect(await owners("task")).toMatchObject({ [x.own]: null, [x.namesake]: "rowan test" });
    expect(await owners("risk")).toEqual({ [x.risk]: null });
    expect(done.kept.find((i) => i.kept === EXCLUDED_BY_APPROVER)).toMatchObject({ n: 1, rows: [x.namesake] });
    expect(done).toMatchObject({ status: "completed", review: 0 });
  }, 60_000);

  it("access exports exactly the included rows", async () => {
    const x = await setup("access");
    await completePrivacyRequest(sam(), { id: x.opened.id, nameRows: { include: [x.own], exclude: [x.namesake, x.risk] } });
    const [pkg] = await db.t.owner`select package from privacy.request where id = ${x.opened.id}`;
    const named = pkg.package.sections.filter((p: { table: string }) => p.table === "pt.task" || p.table === "pt.risk");
    expect(named.map((p: { table: string; rows: unknown[] }) => [p.table, p.rows.length])).toEqual([["pt.task", 1]]);
    expect(await owners("task")).toMatchObject({ [x.own]: "Rowan Test", [x.namesake]: "rowan test" });
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

