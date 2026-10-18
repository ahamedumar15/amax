import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Insights } from "../server/views";
import { sharedDb, T } from "./db";

const AU = "11111111-1111-4111-8111-1111111111a2";
const SOURCE = { label: "the presales board", evidenceRef: "/presales" };
const shown = (r: Insights) => [...r.briefing, ...r.risks, ...r.opportunities, ...r.trends];

describe.skipIf(!hasDb)("insights (Postgres)", () => {
  const use = sharedDb();

  it("AC1 every insight shown has a source linking to its evidence, a confidence and a date; one without a source is refused and never shown", async () => {
    const db = use();
    const r = await db.call<Insights>("maya", "get_insights", {});
    expect(r.briefing.map((b) => [b.title, b.confidence, b.asOf, b.sources.length])).toEqual([
      ["Fleet Tracker is drifting", "high", "2026-10-12", 3], ["You're ahead on agentic AI", "medium", "2026-10-12", 3], ["Bench risk in January", "medium", "2026-10-12", 2]]);
    expect(r.risks.filter((x) => x.data.tab === "delivery").map((x) => [x.title, x.data.percent])).toEqual([["Fleet Tracker", 71], ["Contoso Portal", 34], ["HR Insights", 12]]);
    expect(r.talent.headcount.value).toMatchObject({ start: 156, now: 184, growth: 17.9, attrition: 8.4, series: [159, 162, 164, 167, 169, 172, 176, 179, 181, 184] });
    expect([r.talent.certifications?.value, r.talent.promoted?.data.count, r.market.win?.data.winRate, r.market.position?.data.shareOfVoice, r.trends.length]).toEqual([{ valid: 41, expiring: 6 }, 23, 38, 4.2, 4]);
    expect(shown(r).every((i) => i.sources.length && i.sources.every((s) => /^(\/|https:\/\/)/.test(s.evidenceRef)) && i.confidence && i.asOf)).toBe(true);

    await expect(db.call("maya", "record_insight", { kind: "trend", title: "Unsourced", body: "No evidence", confidence: "low", asOf: "2026-10-16", sources: [] })).rejects.toThrow(/at least one source/);
    await expect(db.t.owner.begin(async (tx) => tx`insert into insights.insight (tenant_id, kind, title, body, confidence, as_of, recorded_by) values (${T}, 'trend', 'Raw', '', 'low', '2026-10-16', 'test')`)).rejects.toThrow(/has no source/);
    await db.t.owner`alter table insights.insight disable trigger insight_has_source`;
    await db.t.owner`insert into insights.insight (tenant_id, kind, title, body, confidence, as_of, recorded_by) values (${T}, 'trend', 'Slipped past the check', '', 'low', '2026-10-16', 'test')`;
    await db.t.owner`alter table insights.insight enable trigger insight_has_source`;
    const after = await db.call<Insights>("maya", "get_insights", { horizon: "12m" });
    expect(after.trends.map((t) => t.title)).not.toContain("Slipped past the check");
    expect(after.trends).toHaveLength(5);

    const { insightId } = await db.call<{ insightId: string }>("maya", "record_insight", { kind: "trend", title: "=HYPERLINK(\"x\")", body: "Sourced", confidence: "low", asOf: "2026-10-16", data: { verdict: "watch" }, sources: [SOURCE] });
    const pack = await db.call<{ csv: string }>("maya", "get_insights", { format: "board-pack-csv" });
    expect(pack.csv).toContain(`"trend","'=HYPERLINK(""x"")","Sourced","","low","2026-10-16","the presales board </presales>"`);
    await db.call("maya", "dismiss_insight", { insightId });
    expect((await db.call<Insights>("maya", "get_insights", {})).trends.map((t) => t.id)).not.toContain(insightId);
    expect((await db.q(sql`select name from core.event where name like 'insights.%' order by created_at`)).map((e) => e.name)).toEqual(["insights.insight.recorded", "insights.insight.dismissed"]);
  }, 120_000);

  it("AC2 reads other modules through their contracts as the viewer: a narrower scope sees less", async () => {
    const db = use();
    await db.t.owner`update auth.role_assignment set legal_entity_ids = ${[AU]}::uuid[] where user_id = (select id from auth.user where email = 'sarah@lumenlabs.test')`;
    const sarah = await db.call<Insights>("sarah", "get_insights", {});
    expect(sarah.talent.headcount.value).toMatchObject({ now: 13 });
    expect(sarah.talent.certifications!.value.valid).toBeLessThan(41);
    expect([sarah.risks, sarah.briefing.map((b) => b.title)]).toEqual([[], ["You're ahead on agentic AI", "Bench risk in January"]]);
    const pm = await db.call<Insights>("sahan", "get_insights", {}, "PM");
    expect(pm.risks.some((x) => x.data.tab === "people")).toBe(true);
    expect([(await db.call<Insights>("maya", "get_insights", {})).market.utilisation?.value, pm.market.utilisation?.value]).toEqual([84, null]);
    await expect(db.call("nimal", "get_insights", {})).rejects.toThrow(/forbidden/);
  }, 120_000);
});
