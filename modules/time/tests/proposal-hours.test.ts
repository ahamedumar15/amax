import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { getProposalRef } from "@amax/delivery/contracts";
import { EVENTS } from "../contracts";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { proposalHoursHandlers } from "../server/proposal-hours";
import { reopenWeek } from "../server/reopen";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("081 proposal hours (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const hours = async (key: string) => Number((await db.q(sql`select hours from delivery.proposal where key = ${key}`))[0].hours);
  const deliver = (event: string, payload: Record<string, unknown>) =>
    withTenant(db.app, T, async (tx) => { for (const h of proposalHoursHandlers.filter((x) => x.event === event)) await h.handle({ tx, tenantId: T, event: { id: randomUUID(), name: event, payload } }); });

  it("AC4 a proposal's hours are its approved entries: approving the week adds them, reopening it takes them away", async () => {
    const con014 = await withTenant(db.app, T, (tx) => getProposalRef(tx, "CON-014"));
    expect(con014).toMatchObject({ key: "CON-014", projectKey: "CON", withdrawn: false });
    expect(await hours("CON-014")).toBe(0);

    const ref = { person: "Nimal Silva", week: "2026-W42" };
    const weekId = (await db.q(sql`select id from time.week where person_name = 'Nimal Silva'`))[0].id as string;
    await approveWeek(ctxFor(await db.as("maya", "PM")), ref);
    await deliver(EVENTS.weekApproved, { weekId });
    expect([await hours("CON-014"), await hours("CON-011"), await hours("CON-012")]).toEqual([15.5, 0, 0]);

    const sahan = await db.as("sahan");
    await reopenWeek(ctxFor(sahan), { ...ref, reason: "Split Tuesday" });
    await deliver(EVENTS.weekReopened, { weekId });
    expect(await hours("CON-014")).toBe(0);
  });
});
