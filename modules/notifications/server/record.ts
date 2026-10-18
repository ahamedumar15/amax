import { sql } from "drizzle-orm";
import { textArray } from "@amax/db";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { CHANNELS, EVENTS } from "../contracts";

export const DELIVER_PERMISSION = "notifications:deliver";

/** The audit of what was sent, to whom and on which channel (030 AC-5): one row per settled delivery. */
export const recordDelivery = defineService({
  name: "notifications.delivery.record", action: DELIVER_PERMISSION, resource: "notifications.delivery",
  input: z.object({ ids: z.array(z.uuid()).min(1), channel: z.enum(CHANNELS), adapter: z.string().nullable(), status: z.enum(["sent", "failed", "skipped"]), attempts: z.number().int(), error: z.string().max(500).nullable() }),
  async run(tx, d) {
    const rows = await tx.execute(sql`update notifications.delivery set status = ${d.status}, adapter = ${d.adapter}, attempts = ${d.attempts}, error = ${d.error},
      sent_at = case when ${d.status} = 'sent' then now() end where id::text = any(${textArray(d.ids)}) and status in ('pending', 'digest')
      returning id, notification_id, user_id`);
    const settled = rows.map((r) => ({ deliveryId: r.id as string, notificationId: r.notification_id as string, userId: r.user_id as string }));
    return { result: { settled: settled.length }, resourceId: d.ids[0], after: { channel: d.channel, adapter: d.adapter, status: d.status, attempts: d.attempts, deliveries: settled },
      events: settled.map((s) => ({ name: EVENTS.delivered, payload: { ...s, channel: d.channel, adapter: d.adapter, status: d.status } })) };
  },
});
