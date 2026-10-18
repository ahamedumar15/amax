import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { writeInsight } from "../server/write";
import { INSIGHTS } from "./data";

// Seeds the demo's "today" (Oct 16), Maya as the person the briefing is written for, and the mock's
// insights, each written by the agent job that would have made it. Safe to re-run.
export const insightsFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const maya = (await listPeople(tx, contextFor.job(tenantId, "insights.fixtures"))).find((p) => p.name === shared.people.find((x) => x.key === "maya")?.name)?.userId ?? null;
  await tx.execute(sql`insert into insights.settings (tenant_id, today, briefing_for) values (${tenantId}, ${shared.today}, ${maya})
    on conflict (tenant_id) do update set today = excluded.today, briefing_for = coalesce(insights.settings.briefing_for, excluded.briefing_for)`);
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from insights.insight`);
  if (Number(n) > 0) return;
  const lk = shared.entities.find((e) => e.key === "lk")?.id ?? null;
  for (const { by, lk: local, sources, ...i } of INSIGHTS)
    await writeInsight(tx, contextFor.job(tenantId, by), { ...i, scope: local ? lk : null, sources: sources.map(([label, evidenceRef]) => ({ label, evidenceRef })) });
};
