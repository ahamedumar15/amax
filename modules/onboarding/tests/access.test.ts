import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { EVENTS, type AccessRequested } from "../contracts";
import { ctxFor } from "../server/context";
import { listChecklists } from "../server/queries";
import { completeTask } from "../server/tasks";
import { onboardingDb } from "./db";

const ON = "2026-10-16";

describe.skipIf(!hasDb)("IT access as suggestions (Postgres)", () => {
  let db: Awaited<ReturnType<typeof onboardingDb>>;
  beforeAll(async () => { db = await onboardingDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-2 a joiner asks for a grant and a leaver for a revoke, as the it-access event and an IT Admin task; nothing is revoked, with or without 021", async () => {
    const [maya, hr, ravi] = [await db.as("maya"), await db.as("maya", "HR"), await db.as("ravi")];
    const access = (name: string) => async () => (await listChecklists(maya, ON)).find((c) => c.personName === name)!.tasks.filter((t) => t.access).map((t) => [t.access, t.owner, t.dueOn, Boolean(t.doneOn)]);
    expect(await access("Mohamed Rifkhan")()).toEqual([["grant", "ITAdmin", "2026-11-01", false]]);
    expect(await access("Rizwan Farook")()).toEqual([["revoke", "ITAdmin", "2026-09-30", true]]);

    const user = sql`select u.status, (select count(*)::int from auth.role_assignment r where r.user_id = u.id) as roles from auth.user u where u.email = 'ayesha@lumenlabs.test'`;
    const before = await db.q(user);
    await db.registry.call(hr, "record_leaver", { employeeNo: "LL-0291", leftOn: "2026-10-31" }, { source: "mcp" });
    await db.tick();
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.accessRequested}`);
    expect(e.payload as AccessRequested).toEqual({ personId: expect.any(String), userId: (await db.as("ayesha")).userId, kind: "revoke", legalEntityId: expect.any(String) });
    expect(await access("Ayesha Rahman")()).toEqual([["revoke", "ITAdmin", "2026-10-31", false]]);

    // Only 021 (it-access) may take the request, and it only makes a suggestion IT approves; without it
    // the request waits on IT's task. Ticking that off records what IT did; Ayesha's sign-in and roles
    // are untouched either way.
    expect(db.modules.flatMap((m) => m.events?.handles ?? []).filter((h) => h.event === EVENTS.accessRequested).map((h) => h.id)).toEqual(
      db.modules.some((m) => m.id === "it-access") ? ["it-access.onboarding"] : []);
    const task = (await listChecklists(ravi, ON)).find((c) => c.personName === "Ayesha Rahman")!.tasks.find((t) => t.access)!;
    expect(task.canComplete).toBe(true);
    await completeTask(ctxFor(ravi), { taskId: task.id, note: "Revoked in the directory (fictional)" });
    expect(await db.q(user)).toEqual(before);
  });
});
