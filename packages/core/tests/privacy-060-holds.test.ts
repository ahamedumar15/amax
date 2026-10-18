import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "../src/server";
import { completePrivacyRequest, HOLD_KEPT, openPrivacyRequest, placeLegalHold, purgeDue, releaseLegalHold, type Item, type PrivacySource } from "../src/privacy";
import { as, PERSON, privacyDb, T, USERS, useTestSources } from "./privacy-fixture";

type Entry = NonNullable<PrivacySource["retention"]>[number];

const WORK: Entry = { table: "pt.work", label: "Work items (fictional)", subject: ["person_id", "project_id"], fields: ["body"], class: "personal", period: "P1Y", start: { at: ["created_at"] }, action: "delete" };
const PROJECT = { held: "00000000-0000-4000-8000-0000000003f1", free: "00000000-0000-4000-8000-0000000003f2" };
const LATER = "00000000-0000-4000-8000-0000000003f9";

describe.skipIf(!hasDb)("060 AC-1: one hold predicate for purge and erasure", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  const hana = (): ServiceContext => as("hana", ["HR"]);
  const sam = (): ServiceContext => as("sam", ["Admin"]);
  const left = async (person: string) => (await db.t.owner`select project_id::text as p from pt.work where person_id = ${person} order by p`).map((r) => r.p as string);

  beforeAll(async () => {
    db = await privacyDb();
    await db.t.owner.unsafe(`create table pt.work (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, person_id uuid not null, project_id uuid not null, body text, created_at timestamptz not null);
      select core.enable_tenant_rls('pt.work'); grant select, insert, update, delete on pt.work to amax_app;`);
    useTestSources([WORK]);
  }, 60_000);
  afterAll(() => db?.t.drop());

  const reset = async () => {
    await db.t.owner`update privacy.legal_hold set released_at = now() where released_at is null`;
    await db.t.owner`update privacy.request set status = 'cancelled' where status = 'open'`;
    await db.t.owner`delete from pt.work`;
    await db.t.owner`delete from pt.person where id = ${LATER}`;
    for (const person of [PERSON.rowan, PERSON.ivy]) for (const project of [PROJECT.held, PROJECT.free]) {
      await db.t.owner`insert into pt.work (tenant_id, person_id, project_id, body, created_at) values (${T}, ${person}, ${project}, 'old work', now() - interval '3 years')`;
    }
  };

  const purge = () => purgeDue(contextFor.job(T, "privacy.purge"), {});
  const erase = async (person: string) => {
    const opened = await openPrivacyRequest(hana(), { kind: "erasure", person });
    return completePrivacyRequest(sam(), { id: opened.id });
  };

  it.each<[string, () => Promise<unknown>, () => Promise<unknown>, string[]]>([
    ["a person hold placed before", () => placeLegalHold(hana(), { kind: "person", person: "ivy@example.test", reason: "Fictional claim" }), purge, [PROJECT.held, PROJECT.free]],
    ["a matter hold on a project", () => placeLegalHold(hana(), { kind: "matter", matter: "Fictional matter", ids: [PROJECT.held], reason: "Fictional dispute" }), purge, [PROJECT.held]],
    ["a matter hold on a project", () => placeLegalHold(hana(), { kind: "matter", matter: "Fictional matter", ids: [PROJECT.held], reason: "Fictional dispute" }), () => erase("ivy@example.test"), [PROJECT.held]],
  ])("%s keeps what it holds through %#", async (_, hold, act, kept) => {
    await reset();
    await hold();
    await act();
    expect(await left(PERSON.ivy)).toEqual(kept.sort());
  }, 60_000);

  it("a person hold also holds ids the person gained after it was placed, and refuses their erasure", async () => {
    await reset();
    const hold = await placeLegalHold(hana(), { kind: "person", person: "ivy@example.test", reason: "Fictional claim" });
    await db.t.owner`insert into pt.person (id, tenant_id, user_id, name) values (${LATER}, ${T}, ${USERS.ivy}, 'Ivy Test')`;
    await db.t.owner`insert into pt.work (tenant_id, person_id, project_id, body, created_at) values (${T}, ${LATER}, ${PROJECT.free}, 'later work', now() - interval '3 years')`;
    await purge();
    expect(await left(LATER)).toEqual([PROJECT.free]);
    await expect(erase("ivy@example.test")).rejects.toThrow(/legal hold/);
    await releaseLegalHold(hana(), { id: hold.id });
  }, 60_000);

  it("erasure records the rows a matter hold kept", async () => {
    await reset();
    await placeLegalHold(hana(), { kind: "matter", matter: "Fictional matter", ids: [PROJECT.held], reason: "Fictional dispute" });
    const done = await erase("rowan@example.test");
    const [row] = await db.t.owner`select inventory from privacy.request where id = ${done.id}`;
    expect((row.inventory as Item[]).find((i) => i.kept === HOLD_KEPT)).toMatchObject({ label: WORK.label, n: 1 });
    expect(await left(PERSON.rowan)).toEqual([PROJECT.held]);
  }, 60_000);
});
