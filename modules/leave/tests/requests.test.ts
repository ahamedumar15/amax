import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { balancesFor } from "../contracts";
import { cancelLeave } from "../server/cancel";
import { ctxFor } from "../server/context";
import { approveLeave, rejectLeave } from "../server/decide";
import { requestLeave } from "../server/request";
import { leaveDb, T } from "./db";

describe.skipIf(!hasDb)("requests, decisions and cancellations (Postgres)", () => {
  let db: Awaited<ReturnType<typeof leaveDb>>;
  beforeAll(async () => { db = await leaveDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC2 half days, working days less Poya, balance and overlap checks; the manager approves or rejects, never the person; cancel restores the balance", async () => {
    const [maya, nimal, kasun] = await Promise.all([db.as("maya", "PM"), db.as("nimal"), db.as("kasun")]);
    const trip = await db.requestOf("nimal", "2026-10-27");
    const nimalId = (await db.q(sql`select person_id from leave.request where id = ${trip}`))[0].person_id as string;
    const annualLeft = async () => (await withTenant(db.app, T, (tx) => balancesFor(tx, nimal, nimalId, 2026))).find((b) => b.type === "annual")!.left;
    const before = await annualLeft();
    const half = await requestLeave(ctxFor(nimal), { type: "casual", startsOn: "2026-11-03", halfDay: "am" });
    expect(half).toMatchObject({ days: 0.5, status: "pending", dates: "Nov 3 (morning)" });
    await expect(requestLeave(ctxFor(nimal), { type: "annual", startsOn: "2026-10-24", endsOn: "2026-10-26" })).rejects.toThrow(/no working days/);
    await expect(requestLeave(ctxFor(nimal), { type: "annual", startsOn: "2026-10-28" })).rejects.toThrow(/already has leave/);
    await expect(requestLeave(ctxFor(nimal), { type: "casual", startsOn: "2026-12-01", endsOn: "2026-12-10" })).rejects.toThrow(/6.5 casual days left, not 8/);
    await expect(requestLeave(ctxFor(nimal), { type: "annual", startsOn: "2026-12-01", halfDay: "pm", endsOn: "2026-12-02" })).rejects.toThrow(/single day/);
    expect((await requestLeave(ctxFor(kasun), { type: "annual", startsOn: "2026-10-22" })).clashes).toEqual(["Overlaps Fleet Tracker v1.8.0 UAT retry", "Overlaps Contoso Portal v2.4.0 QA"]);

    await expect(approveLeave(ctxFor(nimal), { requestId: trip })).rejects.toThrow(/data scope/);
    await expect(approveLeave(ctxFor(kasun), { requestId: trip })).rejects.toThrow(/data scope/);
    await expect(approveLeave(ctxFor(maya), { requestId: trip })).resolves.toMatchObject({ status: "approved", chain: "manager" });
    await expect(approveLeave(ctxFor(maya), { requestId: trip })).rejects.toThrow(/approved, not pending/);
    const tharushi = await db.requestOf("tharushi", "2026-11-02");
    await expect(rejectLeave(ctxFor(maya), { requestId: tharushi, comment: " " })).rejects.toThrow(/invalid input/);
    await expect(rejectLeave(ctxFor(maya), { requestId: tharushi, comment: "Sprint demo that day" })).resolves.toMatchObject({ status: "rejected" });

    expect(await annualLeft()).toBe(before);
    await expect(cancelLeave(ctxFor(kasun), { requestId: trip })).rejects.toThrow(/data scope/);
    await expect(cancelLeave(ctxFor(nimal), { requestId: trip })).resolves.toMatchObject({ status: "cancelled", wasApproved: true });
    await expect(cancelLeave(ctxFor(nimal), { requestId: half.id })).resolves.toMatchObject({ status: "cancelled", wasApproved: false });
    expect(await annualLeft()).toBe(before + 4);

    const events = await db.q(sql`select name, payload->>'paid' as paid from core.event where name like 'leave.%' order by created_at, name`);
    expect(events.map((e) => e.name)).toEqual(["leave.requested", "leave.requested", "leave.approved", "leave.rejected", "leave.cancelled", "leave.cancelled"]);
    expect(events.find((e) => e.name === "leave.approved")?.paid).toBe("true");
    const audit = await db.q(sql`select action from core.audit_event where action like 'leave.request.%' order by seq`);
    expect(audit.map((a) => a.action)).toEqual(["leave.request.create", "leave.request.create", "leave.request.approve", "leave.request.reject", "leave.request.cancel", "leave.request.cancel"]);
  });
});
