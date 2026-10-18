import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { startWorkflow } from "@amax/workflows";
import { CATEGORIES, CHANNELS, DEFAULT_PREFERENCE, EVENTS, type Channel } from "../contracts";
import { sendableAt } from "./quiet";

export const DELIVER = "notifications.deliver";
export const NOTIFY = "notifications:notify";

const message = z.object({ userId: z.uuid(), title: z.string().min(1).max(300), body: z.string().max(2000).nullable(), href: z.string().max(500).nullable() });
const input = z.object({
  eventId: z.uuid(), ruleId: z.string(), module: z.string(), moduleTitle: z.string(), urgent: z.boolean(),
  category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]), messages: z.array(message).max(1000),
});
type Input = z.infer<typeof input>;

async function channelsFor(tx: Tx, userId: string, category: string): Promise<{ channel: Channel; digest: boolean }[]> {
  const [p] = await tx.execute(sql`select email, teams, digest from notifications.preference where user_id = ${userId} and category = ${category}`);
  const pref = (p as typeof DEFAULT_PREFERENCE | undefined) ?? DEFAULT_PREFERENCE;
  return CHANNELS.filter((c) => pref[c]).map((channel) => ({ channel, digest: pref.digest }));
}

// Urgent items skip the digest; every outgoing message still waits for the person's quiet hours (030 AC-3).
async function queue(tx: Tx, tenantId: string, notificationId: string, m: Input["messages"][number], a: Input) {
  let runs = 0;
  for (const { channel, digest } of await channelsFor(tx, m.userId, a.category)) {
    const status = digest && !a.urgent ? "digest" : "pending";
    const at = status === "pending" ? await sendableAt(tx, m.userId) : new Date();
    const [d] = await tx.execute(sql`insert into notifications.delivery (tenant_id, notification_id, user_id, channel, status, not_before)
      values (${tenantId}, ${notificationId}, ${m.userId}, ${channel}, ${status}, ${at.toISOString()}) on conflict (notification_id, channel) do nothing returning id`);
    if (!d || status !== "pending") continue;
    await startWorkflow(tenantId, DELIVER, { deliveryId: d.id as string }, { tx, key: `notify:${d.id}`, startedBy: "notifications" });
    runs++;
  }
  return runs;
}

/** One rule's messages for one event: in-app items for each person (once per event), then their channel deliveries (030 AC-5). */
export const notify = defineService({
  name: "notifications.notification.create", action: NOTIFY, resource: "notifications.notification", input,
  async run(tx, a, ctx) {
    const created: string[] = [];
    let deliveries = 0;
    for (const m of a.messages) {
      const [n] = await tx.execute(sql`insert into notifications.notification (tenant_id, user_id, event_id, rule_id, module, module_title, category, urgency, title, body, href)
        values (${ctx.tenantId}, ${m.userId}, ${a.eventId}, ${a.ruleId}, ${a.module}, ${a.moduleTitle}, ${a.category}, ${a.urgent ? "urgent" : "normal"}, ${m.title}, ${m.body}, ${m.href})
        on conflict (tenant_id, event_id, user_id) do nothing returning id`);
      if (!n) continue;
      created.push(m.userId);
      deliveries += await queue(tx, ctx.tenantId, n.id as string, m, a);
    }
    return { result: { created: created.length, deliveries }, resourceId: a.eventId,
      after: { ruleId: a.ruleId, eventId: a.eventId, channel: "in_app", recipients: created, deliveries },
      events: created.map((userId) => ({ name: EVENTS.created, payload: { userId, ruleId: a.ruleId, eventId: a.eventId, category: a.category, urgent: a.urgent } })) };
  },
});
