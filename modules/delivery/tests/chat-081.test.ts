import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { chatSuggestions } from "../chat-suggestions";
import { ctxFor } from "../server/context";
import { createProposalCard, moveCard, proposeCreate, taskCard, updateCard } from "../server/proposal-card";
import { syncProposal } from "../server/services";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown>) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const offered = async (v: Viewer, route: string, params: Record<string, string>) => {
  const out: string[] = [];
  for (const s of chatSuggestions.filter((x) => x.routes.includes(route))) if (!s.when || (await s.when(v as never, params))) out.push(s.tool);
  return out;
};

describe.skipIf(!hasDb)("081 creating proposals from chat (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await syncProposal(ctxFor(maya), { projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key: "FLT-301", title: "Spec change", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC13 New proposal is on the global page and the project page, carrying the project; chat offers what the viewer can do on each page", async () => {
    expect(await html(ProposalsPage({ viewer: maya, params: {} }))).toContain('data-intent="delivery.new-proposal"');
    expect(await html(ProposalsPage({ viewer: await db.as("maya", "Leadership"), params: {} }))).not.toContain('data-intent="delivery.new-proposal"');
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).toContain('data-intent="delivery.new-proposal"');
    expect(await offered(maya, "p/:key", { key: "CON" })).toEqual(["create_proposal"]);
    expect(await offered(maya, "proposals/:phase", { phase: "CON-014" })).toEqual(["add_proposal_task", "update_proposal", "withdraw_proposal"]);
    expect(await offered(maya, "proposals/:phase", { phase: "FLT-301" })).toEqual([]);
    expect(await offered(maya, "proposals/:phase", { phase: "planned" })).toEqual(["create_proposal"]);
    expect(manifest.pageLabel?.({ phase: "CON-014" })).toBe("CON-014");
  });

  it("AC14 the create card shows project, title, description, estimate and owner; no card for a closed or unknown project", async () => {
    const nimal = await db.as("nimal");
    const card = await createProposalCard(maya, { projectKey: "CON", title: "Dunning", description: "Remind late payers", estimateHours: 8, ownerUserId: nimal.userId });
    expect(card.lines).toEqual([{ label: "Project", value: "Contoso Portal (CON)" }, { label: "Title", value: "Dunning" }, { label: "Description", value: "Remind late payers" },
      { label: "Estimate", value: "8 h" }, { label: "Owner", value: "Nimal Silva" }, { label: "Starts as", value: "Proposed" }]);
    expect((await createProposalCard(maya, { projectKey: "CON", title: "Mine" })).lines).toContainEqual({ label: "Owner", value: "You" });
    await expect(proposeCreate(maya, { projectKey: "NOPE", title: "x" })).rejects.toThrow(/no project NOPE/);
    await db.t.owner`update delivery.project set status = 'closed' where key = 'HRI'`;
    await expect(proposeCreate(maya, { projectKey: "HRI", title: "x" })).rejects.toThrow(/closed/);
    await expect(proposeCreate(maya, { projectKey: "CON", title: "x" })).resolves.toBeUndefined();
  });

  it("AC30 the cards for a pinned proposal's suggestions say what will happen, and their receipts what did", async () => {
    expect(await moveCard(maya, { key: "CON-017", to: "planned" })).toMatchObject({ title: "Move CON-017 to Planned",
      lines: [{ label: "Proposal", value: "CON-017 CSV import for clients" }, { label: "From", value: "Proposed" }, { label: "To", value: "Planned" }],
      look: { confirm: "Move to Planned", done: "Moved CON-017 to Planned" } });
    expect(await taskCard(maya, { key: "CON-017", title: "Draft the importer" })).toMatchObject({ title: "Add T1 to CON-017: Draft the importer", look: { confirm: "Add the task", done: "Added T1 to CON-017" } });
    const owner = await updateCard(maya, { key: "CON-017", ownerUserId: maya.userId });
    expect(owner).toMatchObject({ title: "Make Maya Fernando the owner of CON-017", lines: [{ label: "Owner", value: "Nimal Silva → you (Maya Fernando)" }], look: { confirm: "Change owner", done: "Maya Fernando now owns CON-017" } });
    expect((await updateCard(maya, { key: "CON-017", title: "CSV import", estimateHours: 6 })).look).toMatchObject({ confirm: "Save", done: "Updated CON-017" });
  });
});
