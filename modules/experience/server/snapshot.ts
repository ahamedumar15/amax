import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { DIMENSIONS, type ScoreDropped } from "../contracts";
import { baseline, groupScores } from "./groups";

const keyOf = (group: string) => (group === "Other" ? "other" : group);

// AC-6: each run keeps the day's group scores. A group 1 point or more below its score four weeks
// earlier is a drop, announced once: on the first day it is down.
export async function snapshotScores(tx: Tx, ctx: ServiceContext, today: string): Promise<ScoreDropped[]> {
  const drops: ScoreDropped[] = [];
  for (const dimension of DIMENSIONS) {
    const before = await baseline(tx, dimension, today);
    for (const g of await groupScores(tx, ctx, dimension)) {
      const from = before.get(keyOf(g.group));
      const dropped = from !== undefined && Math.round(from * 10) - Math.round(g.score * 10) >= 10;
      const [prev] = await tx.execute(sql`select dropped from experience.score_snapshot where dimension = ${dimension} and group_key = ${keyOf(g.group)} and day <= ${today}::date order by day desc limit 1`);
      await tx.execute(sql`insert into experience.score_snapshot (tenant_id, day, dimension, group_key, people, score, dropped) values (${ctx.tenantId}, ${today}, ${dimension}, ${keyOf(g.group)}, ${g.people}, ${g.score}, ${dropped})
        on conflict (tenant_id, day, dimension, group_key) do update set people = excluded.people, score = excluded.score, dropped = excluded.dropped`);
      if (dropped && prev?.dropped !== true) drops.push({ dimension, group: g.group, from: from!, to: g.score, asOf: today });
    }
  }
  return drops;
}
