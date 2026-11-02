import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools, search } from "../mcp";
import { ctxFor } from "../server/context";
import { moveProposal } from "../server/services";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

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
    expect(page).toContain("Owner Kasun Dias");
    expect(page).toMatch(/Moved Proposed → Planned<\/td><td>Maya/);
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
});
