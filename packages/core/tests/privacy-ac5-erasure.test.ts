import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { appendAudit, appendTrace, verifyAuditChain, verifyTraceChain } from "../src/server";
import { completePrivacyRequest, openPrivacyRequest } from "../src/privacy";
import { as, PERSON, privacyDb, T, USERS } from "./privacy-fixture";

const ROWAN = `user:${USERS.rowan}`;
const pgError = (p: Promise<unknown>) => p.then(() => "", (e) => String(e?.cause?.message ?? e?.message));

describe.skipIf(!hasDb)("032 AC-5 erasure keeps the audit chain verifiable", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  beforeAll(async () => {
    db = await privacyDb();
    const trace = { traceId: "00000000-0000-4000-8000-0000000003f5", tenantId: T, actor: ROWAN, source: "chat" as const };
    await db.tx(async (tx) => {
      await appendAudit(tx, { ...as("rowan", []), source: "ui" }, { action: "pt.person.update", resource: "pt.person", resourceId: PERSON.rowan, before: { name: "Rowan Test" }, after: { name: "Rowan T." } });
      await appendTrace(tx, trace, { kind: "turn", recordId: PERSON.rowan });
      await appendTrace(tx, { ...trace, actor: `user:${USERS.sam}`, onBehalfOf: ROWAN }, { kind: "tool_call", tool: "get_person", recordId: PERSON.rowan, args: {} });
    });
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-5 erasing a person removes their values from audit payloads and run records, and both chains still verify", async () => {
    const opened = await openPrivacyRequest(as("hana", ["HR"]), { kind: "erasure", person: "Rowan Test" });
    expect(await pgError(db.tx((tx) => tx.execute(sql`select core.erase_subject(${ROWAN})`)))).toMatch(/permission denied/);
    expect(await pgError(db.tx((tx) => tx.execute(sql`select privacy.erase_request(${opened.id})`)))).toMatch(/not an approved erasure request/);
    await completePrivacyRequest(as("sam", ["Admin"]), { id: opened.id });
    const v2 = await db.t.owner`select concat_ws(' ', actor, on_behalf_of, resource_id, before::text, after::text) as s from core.audit_event where chain_v = 2
      union all select concat_ws(' ', actor, on_behalf_of, record_id) from core.trace_event`;
    expect(v2.map((r) => r.s).join(" ")).not.toMatch(new RegExp(`${USERS.rowan}|${PERSON.rowan}|Rowan`));
    expect((await db.t.owner`select actor from core.audit_event where chain_v = 1`)[0].actor).toBe(ROWAN);
    const chains = await db.tx(async (tx) => ({ audit: await verifyAuditChain(tx, T), trace: await verifyTraceChain(tx, T) }));
    expect(chains.audit).toMatchObject({ ok: true });
    expect(chains.trace).toMatchObject({ ok: true });
    expect((chains.audit as { erased: number }).erased).toBeGreaterThanOrEqual(4);
    const [req] = await db.t.owner`select erased, status from privacy.request where id = ${opened.id}`;
    expect(req.status).toBe("completed");
    expect(req.erased).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
