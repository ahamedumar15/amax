import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor, verifyAuditChain } from "../src/server";
import { placeLegalHold, purgeDue } from "../src/privacy";
import { as, PERSON, privacyDb, T } from "./privacy-fixture";

describe.skipIf(!hasDb)("032 AC-3 the daily purge", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  beforeAll(async () => void (db = await privacyDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC-3 deletes and anonymises due records, keeps a held person's, pauses rules it can't tie to a person, and audits class and count only", async () => {
    await placeLegalHold(as("hana", ["HR"]), { kind: "person", person: "ivy@example.test", reason: "Fictional employment claim" });
    const out = await purgeDue(contextFor.job(T, "privacy.purge"), {});
    expect(out.paused).toEqual(["pt.note.body"]);
    expect(out.failed).toEqual([]);
    expect(out.counts.filter((c) => c.n).map((c) => [c.rule, c.n])).toEqual([["pt.person.name", 1], ["pt.payslip.amount", 1]]);
    const people = await db.t.owner`select id, name from pt.person order by name`;
    expect(people.map((p) => [p.id, p.name])).toEqual([[PERSON.rowan, "Anonymised"], [PERSON.ivy, "Ivy Test"]]);
    expect((await db.t.owner`select person_id, amount from pt.payslip order by amount`).map((r) => [r.person_id, Number(r.amount)])).toEqual([[PERSON.ivy, 200], [PERSON.rowan, 300]]);
    expect((await db.t.owner`select count(*)::int as n from pt.note`)[0].n).toBe(2);
    const [audit] = await db.t.owner`select actor, source, after from core.audit_event where action = 'privacy.purge'`;
    expect(audit).toMatchObject({ actor: "job:privacy.purge", source: "job", after: { byClass: { personal: { anonymise: 1 }, pay: { delete: 1 } }, paused: 1, failed: [] } });
    expect(JSON.stringify(audit.after)).not.toMatch(/Rowan|Ivy|100|200/);
    expect((await db.t.owner`select label, class, action, n from privacy.purge_log order by label`).map((r) => `${r.label} ${r.class} ${r.action} ${r.n}`)).toEqual(["Leavers (fictional) personal anonymise 1", "Payslips (fictional) pay delete 1"]);
    expect(await db.tx((tx) => verifyAuditChain(tx, T))).toMatchObject({ ok: true });
    const again = await purgeDue(contextFor.job(T, "privacy.purge"), {});
    expect(again.counts.reduce((n, c) => n + c.n, 0)).toBe(0);
  }, 60_000);
});
