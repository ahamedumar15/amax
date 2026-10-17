import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { completePrivacyRequest, openPrivacyRequest, V1_KEPT } from "../src/privacy";
import { as, privacyDb } from "./privacy-fixture";

describe.skipIf(!hasDb)("032 AC-4 access and erasure requests", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  beforeAll(async () => void (db = await privacyDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC-4 lists the person's records, keeps what the law requires with the reason, and needs a second Admin or HR person to complete", async () => {
    const hana = as("hana", ["HR"]);
    const opened = await openPrivacyRequest(hana, { kind: "erasure", person: "Rowan Test" });
    expect(opened.inventory.map((i) => [i.label, i.n, i.action, i.kept ?? null])).toEqual([
      ["Leavers (fictional)", 1, "anonymise", null],
      ["Payslips (fictional)", 2, "delete", "kept: statutory minimum, 7y (Pay and EPF/ETF records, Sri Lanka country pack)"],
      ["Audit log, before 2026-10-17", 1, "erase", V1_KEPT],
      ["Sign-in account", 1, "erase", expect.stringMatching(/^kept: /)],
    ]);
    expect(V1_KEPT).toMatch(/^kept: pre-2026-10-17 audit format/);
    await expect(openPrivacyRequest(hana, { kind: "erasure", person: "rowan@example.test" })).rejects.toThrow(/already has an open erasure request/);
    await expect(completePrivacyRequest(hana, { id: opened.id })).rejects.toThrow(/a different person must complete this request/);
    await expect(completePrivacyRequest({ ...as("sam", ["Admin"]), actor: { id: "agent:helper", kind: "agent", roles: ["Admin"] } }, { id: opened.id })).rejects.toThrow(/a person must complete/);
    await expect(completePrivacyRequest(as("eli", []), { id: opened.id })).rejects.toThrow(/forbidden/);
    expect((await db.t.owner`select status from privacy.request`)[0].status).toBe("open");
    const done = await completePrivacyRequest(as("sam", ["Admin"]), { id: opened.id });
    expect(done).toMatchObject({ status: "completed", kind: "erasure" });
    expect((await db.t.owner`select name from pt.person where user_id is not null order by name`).map((r) => r.name)).toEqual(["Anonymised", "Ivy Test"]);
    expect((await db.t.owner`select count(*)::int as n from pt.payslip`)[0].n).toBe(3);
    const [row] = await db.t.owner`select subject_label, approved_by, opened_by from privacy.request where id = ${opened.id}`;
    expect(row).toMatchObject({ subject_label: "Erased person", approved_by: as("sam", []).actor.id, opened_by: hana.actor.id });

    const access = await openPrivacyRequest(as("sam", ["Admin"]), { kind: "access", person: "ivy@example.test" });
    await completePrivacyRequest(hana, { id: access.id });
    const [pkg] = await db.t.owner`select package from privacy.request where id = ${access.id}`;
    expect(pkg.package.sections.map((s: { label: string; rows: unknown[] }) => [s.label, s.rows.length])).toEqual([["Leavers (fictional)", 1], ["Payslips (fictional)", 1]]);
  }, 60_000);
});
