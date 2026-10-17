import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService, type ServiceContext } from "@amax/core/server";
import { WORKFLOWS_ADMIN } from "./control";

// Sets a legal entity's time zone (029 follow-up, 047 AC-6). The entity's per-entity schedules take
// the zone straight away and recompute their next run on the next tick; the trigger on
// workflows.entity_zone refuses an unknown zone or another tenant's entity.
const zoneService = defineService({
  name: "workflows.entity_zone.set",
  action: WORKFLOWS_ADMIN,
  resource: "workflows.entity_zone",
  input: z.object({ legalEntityId: z.uuid(), timezone: z.string().min(1).max(64) }).strict(),
  async run(tx, { legalEntityId, timezone }, ctx) {
    const [old] = await tx.execute(sql`select timezone from workflows.entity_zone where legal_entity_id = ${legalEntityId}`);
    await tx.execute(sql`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${legalEntityId}, ${ctx.tenantId}, ${timezone})
      on conflict (legal_entity_id) do update set timezone = excluded.timezone`);
    const moved = await tx.execute(sql`update workflows.schedule set timezone = ${timezone}, next_run_at = null, last_error = null, updated_at = now()
      where legal_entity_id = ${legalEntityId} returning id`);
    const after = { legalEntityId, timezone, schedules: moved.length };
    return { result: after, resourceId: legalEntityId, before: { timezone: (old?.timezone as string | undefined) ?? null }, after, events: [{ name: "workflows.entity_zone.set", payload: after }] };
  },
});

export const setEntityZone = (ctx: ServiceContext, legalEntityId: string, timezone: string) => zoneService(ctx, { legalEntityId, timezone });
