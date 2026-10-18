import { sql } from "drizzle-orm";
import { contextFor } from "@amax/core/server";
import { defineWorkflow, NonRetryableError, sleep, step, StepFailedError } from "@amax/workflows";
import type { Channel } from "../contracts";
import { DELIVER } from "./notify";
import { recordDelivery } from "./record";
import { inTenant, NOT_SET_UP, outgoing, recipient, sendVia } from "./send";

export const RETRY = { maxAttempts: 5, initialInterval: "30s", backoff: 2, maxInterval: "30m" } as const;
type Input = { deliveryId: string };

async function load(tenantId: string, deliveryId: string) {
  return inTenant(tenantId, async (tx) => {
    const [d] = await tx.execute(sql`select d.channel, d.status, d.user_id, d.not_before, n.title, n.body, n.href, n.urgency
      from notifications.delivery d join notifications.notification n on n.id = d.notification_id where d.id = ${deliveryId}`);
    if (!d || d.status !== "pending") throw new NonRetryableError("the delivery is no longer pending");
    const to = await recipient(tx, d.user_id as string);
    if (!to) throw new NonRetryableError("the recipient is no longer active");
    return { channel: d.channel as Channel, notBefore: new Date(d.not_before as string), message: outgoing(to, { title: d.title as string, body: d.body as string | null, href: d.href as string | null, urgent: d.urgency === "urgent" }) };
  });
}

/** One delivery (030 AC-5): waits out the person's quiet hours, sends with retries, then records what happened. */
export const deliverNotification = defineWorkflow<Input>({
  name: DELIVER,
  title: "Notification delivery",
  async run(ctx, { deliveryId }) {
    const wait = await step("due", async () => Math.max(0, (await load(ctx.tenantId, deliveryId)).notBefore.getTime() - Date.now()));
    if (wait > 0) await sleep("quiet-hours", wait);
    const record = (r: { channel: Channel; adapter: string | null; status: "sent" | "failed" | "skipped"; attempts: number; error: string | null }) =>
      step("record", () => recordDelivery(contextFor.job(ctx.tenantId, DELIVER), { ids: [deliveryId], ...r }));
    try {
      const sent = await step("send", async (s) => {
        const d = await load(ctx.tenantId, deliveryId);
        return { channel: d.channel, adapter: await sendVia(ctx.tenantId, d.channel, d.message, s.signal), attempts: s.attempt };
      }, { timeout: "30s", retry: RETRY });
      await record({ ...sent, status: "sent", error: null });
      return { ok: true, summary: `Sent by ${sent.channel}` };
    } catch (e) {
      if (!(e instanceof StepFailedError) || e.step !== "send") throw e;
      if (e.reason.includes("no longer")) return { ok: false, summary: e.reason };
      const channel = await step("channel", async () => (await inTenant(ctx.tenantId, (tx) => tx.execute(sql`select channel from notifications.delivery where id = ${deliveryId}`)))[0]?.channel as Channel);
      const skipped = e.reason.includes(NOT_SET_UP);
      await record({ channel, adapter: null, status: skipped ? "skipped" : "failed", attempts: skipped ? 1 : RETRY.maxAttempts, error: e.reason.slice(0, 500) });
      return { ok: false, summary: skipped ? "Skipped: the channel isn't set up" : "Failed after retries" };
    }
  },
});
