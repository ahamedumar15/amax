import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { PRIORITIES, QUEUES } from "../contracts";
import { inQueue, MANAGE } from "./read";

// AC-1: each queue has its own response and resolution targets per priority. AC-2: the resource
// catalogue names who approves an access request. Both change only through these audited services.
export const setQueueSla = defineService({
  name: "helpdesk.sla.set", action: MANAGE, resource: "helpdesk.sla",
  input: z.object({ queue: z.enum(QUEUES), priority: z.enum(PRIORITIES), responseMinutes: z.number().int().min(1).max(10080), resolutionMinutes: z.number().int().min(1).max(43200) })
    .refine((a) => a.resolutionMinutes >= a.responseMinutes, "the resolution target can't be shorter than the response target"),
  async run(tx, a, ctx) {
    if (!inQueue(ctx, a.queue)) throw new Error(`you don't work in the ${a.queue} queue`);
    const [before] = await tx.execute(sql`select s.response_minutes, s.resolution_minutes from helpdesk.sla s join helpdesk.queue q on q.id = s.queue_id where q.key = ${a.queue} and s.priority = ${a.priority}`);
    const [row] = await tx.execute(sql`insert into helpdesk.sla (tenant_id, queue_id, priority, response_minutes, resolution_minutes)
      select ${ctx.tenantId}, id, ${a.priority}, ${a.responseMinutes}, ${a.resolutionMinutes} from helpdesk.queue where key = ${a.queue}
      on conflict (tenant_id, queue_id, priority) do update set response_minutes = excluded.response_minutes, resolution_minutes = excluded.resolution_minutes returning queue_id`);
    if (!row) throw new Error(`no ${a.queue} queue`);
    const after = { responseMinutes: a.responseMinutes, resolutionMinutes: a.resolutionMinutes };
    return { result: { queue: a.queue, priority: a.priority, ...after }, resourceId: `${row.queue_id as string}:${a.priority}`,
      before: before ? { responseMinutes: before.response_minutes, resolutionMinutes: before.resolution_minutes } : null, after };
  },
});

export const setAccessResource = defineService({
  name: "helpdesk.resource.set", action: MANAGE, resource: "helpdesk.access_resource",
  input: z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/, "a short key like fleet-tracker-repo"), name: z.string().trim().min(2).max(120), ownerUserId: z.uuid() }),
  async run(tx, a, ctx) {
    const [owner] = await tx.execute(sql`select id from auth.user where id = ${a.ownerUserId} and status = 'active'`);
    if (!owner) throw new Error("the owner must be an active person");
    const [before] = await tx.execute(sql`select name, owner_user_id from helpdesk.access_resource where key = ${a.key}`);
    const [row] = await tx.execute(sql`insert into helpdesk.access_resource (tenant_id, key, name, owner_user_id) values (${ctx.tenantId}, ${a.key}, ${a.name}, ${a.ownerUserId})
      on conflict (tenant_id, key) do update set name = excluded.name, owner_user_id = excluded.owner_user_id, set_at = now() returning id`);
    return { result: { id: row.id as string, key: a.key, name: a.name }, resourceId: row.id as string,
      before: before ? { name: before.name, ownerUserId: before.owner_user_id } : null, after: { name: a.name, ownerUserId: a.ownerUserId } };
  },
});
