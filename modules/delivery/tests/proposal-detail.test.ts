import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { appendAudit } from "@amax/core/server";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools, search } from "../mcp";
import { ctxFor } from "../server/context";
import { moveProposal, syncProposal } from "../server/services";
import { getProject } from "../server/queries";
import { markTaskDone } from "../server/tasks";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb, T } from "./proposal-db";

const html = async (node: Promise<unknown> | unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const getProposal = mcpTools.find((t) => t.name === "get_proposal")!.run as unknown as (v: Viewer, a: object) => Promise<Record<string, unknown> | null>;

describe.skipIf(!hasDb)("081 the proposal page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC6 the page shows the proposal's project, phase, owner, time, release, tasks and history, and says when there's none", async () => {
    await moveProposal(ctxFor(maya), { key: "FLT-015", to: "planned" });
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "FLT-015" } }));
    expect(page).toContain("FLT-015 Bulk upload");
    expect(page).toContain('href="/delivery/p/FLT"');
    expect(page).toMatch(/<dt>Owner<\/dt><dd>.*?<b>Kasun Dias<\/b><\/dd>/);
    // Amendment 4 (AC-50): history is a timeline: what happened, then who, then a live age.
    expect(page).toMatch(/<li class="moved"><svg[^>]*>.*?<\/svg><span>Moved Proposed → Planned<small class="muted"><b>Maya/);
    // AC-47: the stepper says the phase, marking the current step.
    expect(page).toMatch(/<li class="current" aria-current="step"><svg[^>]*>.*?<\/svg><b>Planned<\/b>/);
    const con = await html(ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }));
    expect(con).toMatch(/v2\.5\.0/);
    expect(con).toMatch(/<b>T1<\/b>/);
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: "CON-404" } }))).toContain("Proposal not found");
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: "planned" } }))).toContain("FLT-015");
  });

  it("AC7 the list, the board and search all lead to the proposal's page", async () => {
    expect(await html(ProposalsPage({ viewer: maya, params: {}, searchParams: { project: "CON" } }))).toContain('href="/delivery/proposals/CON-014"');
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).toContain('href="/delivery/proposals/CON-014"');
    expect((await search(maya, "CON-014")).find((h) => h.type === "proposal")).toMatchObject({ url: "/delivery/proposals/CON-014" });
  });

  it("AC8 get_proposal reads one proposal by id or key, with tasks, release stages and history, withdrawn ones too", async () => {
    const one = (await getProposal(maya, { key: "CON-014" }))!;
    expect(one).toMatchObject({ key: "CON-014", href: "/delivery/proposals/CON-014", release: "v2.5.0", withdrawn: false });
    expect((one.tasks as unknown[]).length).toBeGreaterThan(0);
    expect((one.stages as { environment: string }[]).map((s) => s.environment)).toEqual(["Dev", "QA", "UAT", "Prod"]);
    expect(await getProposal(maya, { proposalId: one.id as string, key: "CON-012" })).toBeNull();
    await db.t.owner`update delivery.proposal set withdrawn_at = now(), withdrawn_by = 'test', withdraw_reason = 'dropped' where key = 'CON-011'`;
    expect(await getProposal(maya, { key: "CON-011" })).toMatchObject({ withdrawn: true, withdrawReason: "dropped" });
  });

  it("AC28 time logged against the proposal shows in its history for the entry's owner and approvers only, and survives a rekey", async () => {
    const nimal = await db.as("nimal");
    const { id } = (await getProposal(maya, { key: "CON-017" }))! as { id: string };
    const entry = randomUUID();
    // Time's rows as Time writes them (modules/time/tests/proposal-time.test.ts AC28): the proposal, owner, day and hours in `after`.
    const audit = (action: string, after: Record<string, unknown>) =>
      withTenant(db.app, T, (tx) => appendAudit(tx, ctxFor(nimal), { action, resource: "time.entry", resourceId: entry, after }));
    const base = { userId: nimal.userId, day: "2026-10-19", proposalId: id };
    await audit("time.entry.log", { ...base, hours: 2 });
    await audit("time.entry.correct", { ...base, hours: 2.5, previousProposalId: id });
    await audit("time.entry.delete", { ...base, hours: 2.5, deleted: true });
    const lines = async (v: Viewer, key = "CON-017") => ((await getProposal(v, { key }))!.history as { text: string }[]).map((h) => h.text).filter((t) => /logged|Corrected|Removed/.test(t));
    const want = ["Removed Nimal Silva's 2.5 h for Oct 19", "Corrected Nimal Silva's entry for Oct 19 to 2.5 h", "Nimal Silva logged 2 h for Oct 19"];
    expect(await lines(nimal)).toEqual(want);
    expect(await lines(maya)).toEqual(want);
    expect(await lines(await db.as("maya", "Leadership"))).toEqual([]);
    expect(await lines(await db.as("kasun"))).toEqual([]);
    await syncProposal(ctxFor(maya), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key: "CON-017", title: "Spec 017", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "017-spec", releasedAt: null, meta: {}, committedAt: "2026-10-12T09:00:00Z" });
    const [moved] = await db.q(sql`select key from delivery.proposal where id = ${id}`);
    expect(moved.key).toMatch(/^CON-H\d{3}$/);
    expect(await lines(nimal, moved.key as string)).toEqual(want);
  });

  it("081 amendment 4 AC42 AC47 AC50 history lines carry their kind, a move its phase, a closed task who closed it; the project counts closes by agents and people", async () => {
    const before = (await getProject(maya, "CON"))!.closedBy;
    await db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title) select tenant_id, id, 'T90', 'Amendment 4 check' from delivery.proposal where key = 'CON-014'`;
    const open = { ref: "T90" };
    await markTaskDone(ctxFor(maya), { key: "CON-014", task: open.ref as string });
    const after = (await getProject(maya, "CON"))!.closedBy;
    expect(after).toEqual({ agents: before.agents, people: before.people + 1, automation: before.automation });
    const one = (await getProposal(maya, { key: "CON-014" }))! as { history: { kind: string; text: string; by: string; to?: string }[] };
    expect(one.history.find((h) => h.kind === "task" && h.text.startsWith(`${open.ref as string} `))).toMatchObject({ by: expect.stringContaining("Maya") });
    const flt = (await getProposal(maya, { key: "FLT-015" }))! as { history: { kind: string; to?: string }[] };
    expect(flt.history.find((h) => h.kind === "moved")).toMatchObject({ to: "planned" });
    expect(flt.history.every((h) => ["created", "moved", "task", "time", "edited", "withdrawn", "synced"].includes(h.kind))).toBe(true);
  });
});
