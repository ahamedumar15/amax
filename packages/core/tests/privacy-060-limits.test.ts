import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { type ServiceContext } from "../src/server";
import { completePrivacyRequest, openPrivacyRequest, requestNameRows, type PrivacySource } from "../src/privacy";
import { as, PERSON, privacyDb, T, useTestSources } from "./privacy-fixture";

type Entry = NonNullable<PrivacySource["retention"]>[number];

const TASK: Entry = { table: "pt.task", label: "Tasks by name (fictional)", subjectName: ["owner_name"], fields: ["owner_name"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "anonymise" };

describe.skipIf(!hasDb)("060 AC-3: name rows and access packages never truncate silently", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  const hana = (): ServiceContext => as("hana", ["HR"]);
  const sam = (): ServiceContext => as("sam", ["Admin"]);

  beforeAll(async () => {
    db = await privacyDb();
    await db.t.owner.unsafe(`create table pt.task (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, owner_name text, created_at timestamptz not null default now());
      select core.enable_tenant_rls('pt.task'); grant select, insert, update, delete on pt.task to amax_app;`);
  }, 60_000);
  afterAll(() => db?.t.drop());

  const open = async (kind: "erasure" | "access") => {
    await db.t.owner`update privacy.request set status = 'cancelled' where status = 'open'`;
    return openPrivacyRequest(hana(), { kind, person: "rowan@example.test" });
  };

  it.each<[string, () => Promise<void>, "erasure" | "access", RegExp]>([
    ["501 rows recorded by name only", async () => {
      useTestSources([TASK]);
      await db.t.owner`insert into pt.task (tenant_id, owner_name) select ${T}, 'Rowan Test' from generate_series(1, 501)`;
    }, "erasure", /Tasks by name \(fictional\), by name has 501 rows recorded by name only, more than the 500/],
    ["an access package section over 5000 rows", async () => {
      useTestSources();
      await db.t.owner`delete from pt.task`;
      await db.t.owner`insert into pt.payslip (tenant_id, person_id, amount, pay_year_end) select ${T}, ${PERSON.rowan}, 1, now() from generate_series(1, 5001)`;
    }, "access", /Payslips \(fictional\) has 5003 rows, more than the 5000 one access package holds/],
  ])("%s is refused with the reason, and the request stays open", async (_, seed, kind, reason) => {
    await seed();
    const opened = await open(kind);
    if (kind === "erasure") await expect(db.tx((tx) => requestNameRows(tx, opened.id))).rejects.toThrow(reason);
    await expect(completePrivacyRequest(sam(), { id: opened.id })).rejects.toThrow(reason);
    expect((await db.t.owner`select status from privacy.request where id = ${opened.id}`)[0].status).toBe("open");
  }, 60_000);
});
