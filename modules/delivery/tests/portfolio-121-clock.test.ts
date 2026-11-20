import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { afxDb } from "./afx";
import { T } from "./proposal-db";

const OLD = "2000-01-01T00:00:00Z";

describe.skipIf(!hasDb)("121 review: the at-risk clock counts real progress", () => {
  let afx: Awaited<ReturnType<typeof afxDb>>;
  const doneTask = () => afx.db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at)
    select ${T}, id, 'T1', 'Done', true, now() from delivery.proposal where key = 'AFX-002'`;
  const commitToday = () => afx.db.t.owner`insert into delivery.commit_ledger (tenant_id, user_id, proposal_id, day)
    select ${T}, gen_random_uuid(), id, now()::date from delivery.proposal where key = 'AFX-002'`;
  const resync = () => afx.db.t.owner`update delivery.proposal set updated_at = now() where key = 'AFX-002'`;

  beforeAll(async () => { afx = await afxDb(); }, 120_000);
  afterAll(() => afx?.db.t.drop());
  beforeEach(async () => {
    await afx.db.t.owner`delete from delivery.task where proposal_id in (select id from delivery.proposal where key = 'AFX-002')`;
    await afx.db.t.owner`delete from delivery.commit_ledger where proposal_id in (select id from delivery.proposal where key = 'AFX-002')`;
    await afx.db.t.owner`delete from delivery.proposal where key = 'AFX-002'`;
  });

  it.each([
    ["a build with no progress for 14 days", () => afx.proposal("AFX-002", "building", OLD), "at-risk"],
    ["the same build after a re-sync that only touches updated_at", async () => { await afx.proposal("AFX-002", "building", OLD); await resync(); }, "at-risk"],
    ["no created date, but tasks planned long ago in the repo", () => afx.proposal("AFX-002", "building", null, { repoPhases: { tasks: OLD } }), "at-risk"],
    ["an old build with a task closed today", async () => { await afx.proposal("AFX-002", "building", OLD); await doneTask(); }, "on-track"],
    ["an old build with a commit today", async () => { await afx.proposal("AFX-002", "building", OLD); await commitToday(); }, "on-track"],
    ["an old proposal whose tasks were planned today, read as {at, source}", () => afx.proposal("AFX-002", "building", OLD, { repoPhases: { tasks: { at: new Date().toISOString(), source: "main" } } }), "on-track"],
  ])("AC-3 %s", async (_, seed, health) => {
    await seed();
    expect((await afx.row()).health).toBe(health);
  });
});
