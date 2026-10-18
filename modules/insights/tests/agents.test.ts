import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { contextForViewer } from "@amax/auth";
import { setScheduleEnabled } from "@amax/workflows/server";
import { writeBriefing, BRIEFING_KIND } from "../server/agents";
import { matchSkills } from "../server/match";
import { scanRisks } from "../server/risk";
import type { Insights } from "../server/views";
import { sharedDb, T } from "./db";

const step = { recordToolCall: () => undefined, recordCost: () => undefined };
const point = (title: string, sources: { label: string; evidenceRef: string }[]) => ({ toolCalls: [{ type: "tool_use" as const, id: title, name: "propose_suggestion",
  input: { kind: BRIEFING_KIND, target: { type: "insights.briefing", id: "week", label: "This week" }, title, confidence: 0.8, proposed: { title, body: `${title}.`, suggestion: null, confidence: "medium", sources } } }] });

describe.skipIf(!hasDb)("the insights agents (Postgres)", () => {
  const use = sharedDb();
  beforeAll(async () => { await use().t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`; });

  it("AC1 the briefing reads the insights only as untrusted data, keeps each point's given sources and drops a point without one", async () => {
    const db = use();
    const provider = fakeProvider([point("Rebalance the December plan", [{ label: "allocations", evidenceRef: "/allocations" }]),
      point("Invented evidence", [{ label: "a board memo", evidenceRef: "/finance/memo" }]), point("No evidence at all", []), { text: "Done." }].map((r) => () => r));
    configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
    expect(await writeBriefing(T, step)).toEqual({ summary: "1 point, 2 without a source dropped" });
    expect(provider.calls[0].tools!.map((t) => t.name)).toEqual(["propose_suggestion"]);
    expect(provider.calls[0].system).not.toContain("Velocity down 32%");
    expect(JSON.stringify(provider.calls[0].messages[0])).toContain("Velocity down 32%");
    const r = await db.call<Insights>("maya", "get_insights", {});
    expect(r.briefing.map((b) => [b.title, b.asOf, b.sources, b.recordedBy])).toEqual([
      ["Rebalance the December plan", "2026-10-16", [{ label: "allocations", evidenceRef: "/allocations" }], expect.stringMatching(/^job:insights\.briefing for user:/)]]);
  }, 120_000);

  it("AC2 the risk scan and skills match read allocations, leave, time, hr, learning and presales through contracts as a person, and record what they find with its sources", async () => {
    const db = use();
    expect(await scanRisks(T)).toEqual({ summary: "2 projects at risk" });
    expect(await matchSkills(T)).toEqual({ summary: "1 match" });
    const r = await db.call<Insights>("maya", "get_insights", {});
    const people = r.risks.filter((x) => x.recordedBy.startsWith("job:insights.risk-scan for user:"));
    expect(people.map((x) => [x.title, x.body])).toEqual([["Contoso Portal", "Approved leave in the next 30 days: Ayesha Rahman Oct 19–Oct 21"], ["HR Insights", "Approved leave in the next 30 days: Ayesha Rahman Oct 19–Oct 21"]]);
    expect(people.every((x) => x.data.tab === "people" && x.sources.some((s) => s.evidenceRef === "/allocations"))).toBe(true);
    const bench = r.opportunities.find((o) => o.key === "bench:2027-01");
    expect([bench?.data.fit, bench?.sources.map((s) => s.evidenceRef)]).toEqual([6, ["/allocations", "/presales"]]);
  }, 120_000);

  it("AC3 recurring agent work lists every installed module's agent jobs, the inbox agent's scan among them, each switchable", async () => {
    const db = use();
    const r = await db.call<Insights>("maya", "get_insights", {});
    expect(r.jobs.map((j) => j.name).sort()).toEqual(["allocations.agent-check", "inbox-agent.scan", "insights.briefing", "insights.risk-scan", "insights.skills-match"]);
    expect(r.jobs.find((j) => j.name === "inbox-agent.scan")).toMatchObject({ title: "Teams and email scan", runs: "Hourly", enabled: true });
    expect([r.canSwitch, (await db.call<Insights>("sahan", "get_insights", {}, "PM")).canSwitch]).toEqual([true, false]);
    const [s] = await db.q(sql`select id from workflows.schedule where name = 'inbox-agent.scan'`);
    await setScheduleEnabled(contextForViewer(await db.as("maya"), "chat"), s.id as string, false);
    expect(await db.call("maya", "get_insight_job", { schedule: s.id })).toMatchObject({ name: "inbox-agent.scan", enabled: false });
  }, 60_000);
});
