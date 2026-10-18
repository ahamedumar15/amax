import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, querySuggestion } from "@amax/agents/server";
import { approveRunHr } from "../server/runs";
import { currentRun } from "../server/queries";
import { ctxFor } from "../server/read";
import { payrollDb } from "./db";

describe.skipIf(!hasDb)("payroll agent variance (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-2 every change since last period is an explained suggestion, and Approve run stays disabled until every queried line is resolved", async () => {
    const hr = await db.as("maya", "HR");
    const run = (await currentRun(hr))!;
    expect(run.changes!.map((c) => [c.personName, c.kind, c.status, c.needsCheck])).toEqual([
      ["Ayesha Rahman", "pay", "open", true], ["Dinesh Wickrama", "joiner", "open", false], ["Nimal Silva", "pay", "open", false], ["Rizwan Farook", "leaver", "open", false]]);
    expect(run.changes!.find((c) => c.personName === "Nimal Silva")!.explanation).toMatch(/^Overtime, 6 h: 6 h weekend overtime/);
    const sugg = await db.q(sql`select target_id, detail, agent_name from agents.suggestion where kind = 'payroll.variance' order by target_label`);
    expect(sugg.map((s) => [s.target_id, s.agent_name])).toEqual(expect.arrayContaining(run.changes!.map((c) => [c.id, "Payroll agent"])));
    expect(run.next).toMatchObject({ label: "Approve run", enabled: false, hint: "Resolve the 4 open changes to approve the run" });

    const [ayesha, ...rest] = run.changes!;
    await querySuggestion(ctxFor(hr), { id: ayesha.suggestionId!, note: "Check Leave for the Oct 16 casual leave" });
    for (const c of rest) await acceptSuggestion(ctxFor(hr), { id: c.suggestionId! });
    const queried = (await currentRun(hr))!;
    expect([queried.changes![0].status, queried.open, queried.next?.enabled]).toEqual(["queried", 1, false]);
    await expect(approveRunHr(ctxFor(hr), { runId: run.id })).rejects.toThrow(/1 change is still open/);

    await acceptSuggestion(ctxFor(hr), { id: ayesha.suggestionId! });
    expect((await currentRun(hr))!.next).toMatchObject({ label: "Approve run", enabled: true, hint: null });
  }, 60_000);
});
