import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { addProposalTask, updateProposal, withdrawProposal } from "../server/lifecycle";
import { getProposal, listProposals, phaseCounts } from "../server/queries";
import { createProposal, createRelease, moveProposal, syncProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { proposalDb } from "./proposal-db";

const spec = { projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key: "FLT-301", title: "Spec change", phase: "building" as const,
  tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" };

describe.skipIf(!hasDb)("081 the lifecycle of a hand-made proposal (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await syncProposal(ctxFor(maya), spec);
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC9 update_proposal edits a hand-made proposal's title, description, estimate and owner, audited; a spec one only changes owner", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Late fees" });
    const nimal = await db.as("nimal");
    await updateProposal(ctxFor(maya), { key, title: "Late fees on overdue invoices", description: "2% a month", estimateHours: 12, ownerUserId: nimal.userId });
    expect(await db.row(key)).toMatchObject({ title: "Late fees on overdue invoices", description: "2% a month", estimate_hours: "12.0", owner_user_id: nimal.userId, owner_name: "Nimal Silva" });
    const [audit] = await db.q(sql`select before, after from core.audit_event where action = 'delivery.proposal.update' order by seq desc limit 1`);
    expect(audit).toMatchObject({ before: { title: "Late fees", estimateHours: null }, after: { title: "Late fees on overdue invoices", estimateHours: 12, owner: "Nimal Silva" } });
    await updateProposal(ctxFor(maya), { key, estimateHours: null });
    expect((await db.row(key)).estimate_hours).toBeNull();
    await expect(updateProposal(ctxFor(maya), { key: "FLT-301", title: "Renamed" })).rejects.toThrow(/comes from specclaw/);
    await updateProposal(ctxFor(maya), { key: "FLT-301", ownerUserId: nimal.userId });
    expect((await db.row("FLT-301")).owner_user_id).toBe(nimal.userId);
    await expect(updateProposal(ctxFor(await db.as("liam")), { key, title: "x" })).rejects.toThrow(/forbidden|scope/);
  });

  it("AC10 withdraw_proposal marks it withdrawn with who and why, takes it out of its release, lists and counts, and keeps it readable", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Old idea" });
    await createRelease(ctxFor(maya), { projectKey: "CON", version: "v9.0.0", proposalKeys: [key] });
    const before = (await phaseCounts(maya)).proposed;
    await expect(withdrawProposal(ctxFor(maya), { key, reason: "no" })).rejects.toThrow(/invalid input/);
    expect(await withdrawProposal(ctxFor(maya), { key, reason: "Client dropped it" })).toMatchObject({ withdrawn: true, leftRelease: "v9.0.0" });
    expect(await db.row(key)).toMatchObject({ withdraw_reason: "Client dropped it", withdrawn_by: `user:${maya.userId}`, release_id: null });
    expect(await db.q(sql`select payload->>'reason' as reason from core.event where name = 'delivery.proposal.withdrawn' and payload->>'key' = ${key}`)).toEqual([{ reason: "Client dropped it" }]);
    expect((await listProposals(maya, { projectKey: "CON" })).map((p) => p.key)).not.toContain(key);
    expect((await phaseCounts(maya)).proposed).toBe(before - 1);
    expect(await getProposal(maya, { key })).toMatchObject({ withdrawn: true });
    await expect(withdrawProposal(ctxFor(maya), { key, reason: "again please" })).rejects.toThrow(/was withdrawn/);
    await expect(moveProposal(ctxFor(maya), { key, to: "planned" })).rejects.toThrow(/withdrawn/);
    await expect(createRelease(ctxFor(maya), { projectKey: "CON", version: "v9.0.1", proposalKeys: [key] })).rejects.toThrow(/withdrawn/);
    await expect(withdrawProposal(ctxFor(maya), { key: "FLT-301", reason: "not wanted" })).rejects.toThrow(/comes from specclaw/);
  });

  it("AC11 add_proposal_task adds the next task and recounts; mark_task_done closes it; spec proposals take tasks from the repo", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statements" });
    expect(await addProposalTask(ctxFor(maya), { key, title: "Template" })).toMatchObject({ task: "T1", tasksTotal: 1 });
    expect(await addProposalTask(ctxFor(maya), { key, title: "Send monthly" })).toMatchObject({ task: "T2", tasksDone: 0, tasksTotal: 2 });
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    expect(await db.row(key)).toMatchObject({ tasks_done: 1, tasks_total: 2 });
    await expect(addProposalTask(ctxFor(maya), { key: "FLT-301", title: "x" })).rejects.toThrow(/comes from specclaw/);
  });

  it("AC12 the three tools are chat writes with their services, behind the same permissions as the screens", () => {
    const byName = Object.fromEntries(mcpTools.map((t) => [t.name, t]));
    expect([byName.update_proposal, byName.withdraw_proposal, byName.add_proposal_task].map((t) => [t.permission, t.service])).toEqual([
      ["delivery:proposal:create", updateProposal], ["delivery:proposal:move", withdrawProposal], ["delivery:task:done", addProposalTask]]);
    expect(byName.withdraw_proposal.destructive).toBe(true);
  });
});
