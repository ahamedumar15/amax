import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { approveWeek, rejectWeek } from "../server/decide";
import { logTime } from "../server/log";
import { reopenWeek } from "../server/reopen";
import { submitWeek } from "../server/submit";
import { timeDb } from "./db";

const W = "2026-W42";

describe.skipIf(!hasDb)("approvals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC2 the chain decides, reject needs a comment, approved weeks lock and only an audited Admin change gets through", async () => {
    const [maya, nimal, ayesha, sahan, liam, kasun] = await Promise.all([db.as("maya", "PM"), db.as("nimal"), db.as("ayesha"), db.as("sahan"), db.as("liam"), db.as("kasun")]);
    const ref = (person: string) => ({ person, week: W });
    await expect(approveWeek(ctxFor(nimal), ref("Nimal Silva"))).rejects.toThrow(/data scope/);
    await expect(approveWeek(ctxFor(nimal), ref("Ayesha Rahman"))).rejects.toThrow(/data scope/);
    await expect(approveWeek(ctxFor(liam), ref("Kasun Dias"))).rejects.toThrow(/forbidden/);
    await expect(approveWeek(ctxFor(nimal), ref("Kasun Dias"))).resolves.toMatchObject({ status: "approved", chain: "project" });
    await expect(approveWeek(ctxFor(maya), ref("Tharushi Wijesinghe"))).rejects.toThrow(/draft, not submitted/);

    await expect(rejectWeek(ctxFor(maya), { ...ref("Nimal Silva"), comment: " " })).rejects.toThrow(/invalid input/);
    await expect(rejectWeek(ctxFor(maya), { ...ref("Nimal Silva"), comment: "Split Tuesday between CON and FLT" })).resolves.toMatchObject({ status: "rejected" });
    await expect(submitWeek(ctxFor(nimal), { week: W })).resolves.toMatchObject({ status: "submitted" });

    await expect(approveWeek(ctxFor(ayesha), ref("Tharushi Wijesinghe"))).rejects.toThrow(/data scope/);
    await submitWeek(ctxFor(await db.as("tharushi")), { week: W });
    await expect(approveWeek(ctxFor(ayesha), ref("Tharushi Wijesinghe"))).rejects.toThrow(/data scope/);
    const tharushiId = await db.idOf("tharushi");
    db.useScopes([async (_tx, u) => (u.userId === ayesha.userId ? { reports: [tharushiId] } : {})]);
    await expect(approveWeek(ctxFor(await db.as("ayesha")), ref("Tharushi Wijesinghe"))).resolves.toMatchObject({ chain: "manager" });

    await expect(logTime(ctxFor(kasun), { projectKey: "CON", day: "2026-10-16", hours: 1 })).rejects.toThrow(/approved and locked/);
    await expect(logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-16", hours: 1, userId: kasun.userId })).rejects.toThrow(/data scope/);
    await expect(logTime(ctxFor(sahan), { projectKey: "CON", day: "2026-10-16", hours: 1, userId: kasun.userId })).resolves.toMatchObject({ week: W });
    expect(await db.q(sql`select actor from core.audit_event where action = 'time.week.locked_change'`)).toEqual([{ actor: `user:${sahan.userId}` }]);
    await expect(reopenWeek(ctxFor(maya), { ...ref("Kasun Dias"), reason: "Fix Friday" })).rejects.toThrow(/forbidden/);
    await expect(reopenWeek(ctxFor(sahan), { ...ref("Kasun Dias"), reason: "Fix Friday" })).resolves.toMatchObject({ status: "draft" });
    const trail = await db.q(sql`select a.decision, a.chain from time.approval a join time.week w on w.id = a.week_id where w.person_name = 'Kasun Dias' order by a.at`);
    expect(trail).toEqual([{ decision: "approved", chain: "project" }, { decision: "reopened", chain: "admin" }]);
  });
});
