import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { acceptSuggestion } from "@amax/agents/server";
import { rejectApplication } from "../server/applications";
import { getApplication } from "../server/queries";
import { ctxFor } from "../server/read";
import { recruitmentDb, T } from "./db";

describe.skipIf(!hasDb)("screening agent (Postgres)", () => {
  let db: Awaited<ReturnType<typeof recruitmentDb>>;
  beforeAll(async () => { db = await recruitmentDb(); await db.tick(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC2 match scores are suggestions with CV-section evidence; accepting screens, and no agent can reject", async () => {
    const hr = await db.as("maya", "HR");
    const open = await db.q(sql`select s.target_id, s.proposed, s.evidence from agents.suggestion s where s.kind = 'recruitment.screen' and s.status = 'open'`);
    expect(open).toHaveLength(22);
    const [role] = await db.q(sql`select id from recruitment.role where title = 'AI engineer'`);
    const r = (await db.registry.call(hr, "add_application", { roleId: role.id, name: "Low Match (fictional)", source: "Job board",
      cv: [{ heading: "Experience", text: "Ten years of Python services. Some TypeScript." }, { heading: "Projects", text: "Built a RAG prototype." }] }, { source: "mcp" })) as { applicationId: string };
    await db.tick();
    const [s] = await db.q(sql`select id, proposed, evidence from agents.suggestion where target_id = ${r.applicationId}`);
    expect((s.proposed as { score: number }).score).toBe(43);
    expect((s.proposed as { evidence: { skill: string; section: string }[] }).evidence.map((e) => [e.skill, e.section])).toEqual([["Python", "Experience"], ["RAG", "Projects"], ["TypeScript", "Experience"]]);
    expect((s.evidence as { label: string }[]).map((e) => e.label)).toEqual(["CV section: Experience", "CV section: Projects", "CV section: Experience"]);
    expect((await getApplication(hr, r.applicationId))!.stage).toBe("applied");

    await expect(rejectApplication(contextFor.job(T, "recruitment.screen-agent"), { applicationId: r.applicationId, note: "Low match" })).rejects.toThrow(/only a person can reject/);
    await acceptSuggestion(ctxFor(hr), { id: s.id as string });
    expect(await getApplication(hr, r.applicationId)).toMatchObject({ stage: "screening", matchScore: 43, agentScore: 43 });
    expect(await db.q(sql`select 1 from recruitment.application where stage = 'rejected' and moved_by like 'job:%'`)).toEqual([]);
  }, 60_000);
});
