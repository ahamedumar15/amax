import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { notificationsDb } from "./db";

describe.skipIf(!hasDb)("081 a proposal's owner hears what others do to it (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  beforeAll(async () => { db = await notificationsDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  const bell = async (key: string, like: string) => db.q(sql`select title, href from notifications.notification where user_id = ${await db.idOf(key)} and title like ${like}`);

  it("AC19 a phase change or a finished task by someone else reaches the owner with a link; their own, or an agent's for them, doesn't", async () => {
    const [kasun, maya] = [await db.idOf("kasun"), await db.idOf("maya")];
    const [flt] = await db.q(sql`select id from delivery.project where key = 'FLT'`);
    const base = { proposalId: randomUUID(), key: "FLT-015", projectId: flt.id as string, ownerUserId: kasun };
    await db.emit("delivery.proposal.phase_changed", { ...base, from: "proposed", to: "planned", by: `user:${maya}` });
    await db.emit("delivery.proposal.phase_changed", { ...base, from: "planned", to: "building", by: `agent:claude for user:${kasun}` });
    await db.emit("delivery.task.done", { ...base, task: "T2", by: `sp:${randomUUID()} for user:${maya}` });
    await db.emit("delivery.task.done", { ...base, task: "T3", by: `user:${kasun}` });
    await db.emit("delivery.proposal.phase_changed", { ...base, ownerUserId: null, from: "building", to: "verified", by: `user:${maya}` });
    await db.drain();
    expect(await bell("kasun", "FLT-015%")).toEqual([{ title: "FLT-015 moved from proposed to planned", href: "/delivery/proposals/FLT-015" }]);
    expect(await bell("kasun", "Task % of FLT-015 is done")).toEqual([{ title: "Task T2 of FLT-015 is done", href: "/delivery/proposals/FLT-015" }]);
    expect(await bell("maya", "%FLT-015%")).toEqual([]);
  }, 120_000);
});
