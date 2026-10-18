import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import { getApplication, pipelineView } from "../server/queries";
import { sharedDb } from "./db";

describe.skipIf(!hasDb)("recruitment pipeline (Postgres)", () => {
  const use = sharedDb(true);

  it("AC1 roles, candidates, applications, interviews and offers give fixtures.md's numbers; candidate fields are HR's alone; writes are audited tools", async () => {
    const db = use();
    const [hr, admin, leadership, nimal] = [await db.as("maya", "HR"), await db.as("sahan"), await db.as("maya", "Leadership"), await db.as("nimal")];
    const p = await pipelineView(hr);
    expect(p.roles.map((r) => [r.title, r.openings])).toEqual([["AI engineer", 1], ["QA engineer", 1], ["Senior .NET engineer", 2]]);
    expect(p.stats).toMatchObject({ openings: 4, fromDemand: 2, demandReason: "January demand on Fleet Tracker phase 2", candidates: 63, screened: 41, timeToHire: 31, previousTimeToHire: 40, offersAccepted: 4, offers: 5 });
    expect(p.lanes.map((l) => [l.label, l.count, typeof l.cards[0].name === "string" ? l.cards[0].name : null])).toEqual([
      ["Applied", 22, "Dinithi Fernando"], ["Screening", 9, "Sachini Perera"], ["Interviews", 5, "Ravindu Jayasuriya"], ["Offer", 1, "Hasini Gunawardena"], ["Hired this quarter", 4, "Mohamed Rifkhan"]]);
    expect(p.funnel.map((f) => f.count)).toEqual([63, 41, 19, 5, 4]);
    expect(p.monthly.map((m) => [m.label, m.hires])).toEqual([["May", 4], ["Jun", 4], ["Jul", 6], ["Aug", 4], ["Sep", 3], ["Oct", 3]]);

    for (const v of [admin, leadership]) {
      const q = await pipelineView(v);
      expect([q.stats.candidates, q.seesCandidates, q.lanes[0].cards.every((c) => isMasked(c.name) && isMasked(c.email) && isMasked(c.evidence))]).toEqual([63, false, true]);
      expect(JSON.stringify(q)).not.toContain("Dinithi");
      expect(isMasked((await getApplication(v, p.lanes[0].cards[0].id))!.cv)).toBe(true);
    }
    await expect(pipelineView(nimal)).rejects.toThrow(/recruitment:read/);
    expect(db.modules.find((m) => m.id === "recruitment")!.mcpTools!.filter((t) => t.scope === "read").every((t) => t.sensitive?.name === "candidate" && t.sensitive?.cv === "candidate")).toBe(true);

    const r = (await db.registry.call(hr, "add_application", { roleId: p.roles[0].id, name: "Test Candidate (fictional)", source: "Referral", cv: [{ heading: "Skills", text: "Python and RAG." }] }, { source: "mcp" })) as { applicationId: string };
    await expect(db.registry.call(leadership, "add_application", { roleId: p.roles[0].id, name: "Nobody", source: "Referral" }, { source: "mcp" })).rejects.toThrow(/forbidden/);
    const [audit] = await db.q(sql`select action from core.audit_event where resource_id = ${r.applicationId}`);
    expect(audit.action).toBe("recruitment.application.add");
    const [e] = await db.q(sql`select payload from core.event where name = 'recruitment.application.received' and payload->>'applicationId' = ${r.applicationId}`);
    expect(Object.keys(e.payload as object).sort()).toEqual(["applicationId", "by", "legalEntityId", "roleId"]);
  }, 60_000);
});
