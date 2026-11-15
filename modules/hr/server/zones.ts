import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { entityZoneSet } from "@amax/workflows";

/** Review round 2: HR's refusal for an entity whose today it can't know. */
export const noZone = (name: string) => `${name} has no time zone set: set one before adding people there or recording leavers`;

/**
 * 109 AC-5: today in the legal entity's own time zone, the one date HR decides joining, active and left by. Review round
 * 2: an entity with no zone set (its own, or its country's default) is refused, never counted in UTC.
 */
export async function entityToday(tx: Tx, entityId: string, now = new Date()) {
  const zone = await entityZoneSet(tx, entityId);
  if (!zone) {
    const [e] = await tx.execute(sql`select name from core.legal_entity where id = ${entityId}`);
    throw new Error(noZone(String(e?.name ?? "This legal entity")));
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 110 AC-3: the legal entities with no time zone (their own or their country's), whose people HR can't move or add. */
export async function unzonedEntities(tx: Tx): Promise<{ id: string; name: string }[]> {
  const entities = await tx.execute(sql`select id, name from core.legal_entity order by name`);
  const out: { id: string; name: string }[] = [];
  for (const e of entities) if (!(await entityZoneSet(tx, e.id as string))) out.push({ id: e.id as string, name: String(e.name) });
  return out;
}

/** The People screen's line and the status job's failure, in one wording. */
export const unzonedLine = (name: string) => `${name} has no time zone set: its joiners and leavers aren't moved, and people can't be added there`;
