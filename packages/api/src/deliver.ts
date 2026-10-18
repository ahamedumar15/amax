import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { contextFor, defineService, getRuntime } from "@amax/core/server";
import { SecretNotConfiguredError, useSecret } from "@amax/core/secrets";
import { defineWorkflow, NonRetryableError, step, StepFailedError } from "@amax/workflows";
import { EgressError, safePost } from "./egress";
import { signPayload } from "./verify";
import { MAX_FAILURES } from "./webhooks";

export type DeliverInput = { webhookId: string; eventId: string; event: string; body: string };
export const DELIVER = "api.webhook-deliver";
const INACTIVE = "the webhook is no longer active";
const SETUP = "not sent: amax's setup";
export const RETRY = { maxAttempts: 5, initialInterval: "30s", backoff: 2, maxInterval: "30m" } as const;

const recordDelivery = defineService({
  name: "api.webhook.delivered",
  action: "api:webhook:deliver",
  resource: "api.delivery",
  input: z.object({ webhookId: z.uuid(), eventId: z.uuid(), event: z.string(), ok: z.boolean(), attempts: z.number().int(), status: z.number().int().nullable() }),
  async run(tx, i, ctx) {
    await tx.execute(sql`insert into api.delivery (tenant_id, webhook_id, event_id, event, ok, attempts, response_status)
      values (${ctx.tenantId}, ${i.webhookId}, ${i.eventId}, ${i.event}, ${i.ok}, ${i.attempts}, ${i.status}) on conflict (webhook_id, event_id) do nothing`);
    const [w] = await tx.execute(sql`update api.webhook set failures = case when ${i.ok} then 0 else failures + 1 end, updated_at = now(),
      status = case when not ${i.ok} and failures + 1 >= ${MAX_FAILURES} and status = 'active' then 'off' else status end,
      off_reason = case when not ${i.ok} and failures + 1 >= ${MAX_FAILURES} then ${`${MAX_FAILURES} deliveries in a row failed`} else off_reason end
      where id = ${i.webhookId} returning status, failures`);
    const off = !i.ok && w?.status === "off" && Number(w.failures) === MAX_FAILURES;
    return { result: { off }, resourceId: i.webhookId, after: i, events: off ? [{ name: "api.webhook.switched_off", payload: { id: i.webhookId } }] : [] };
  },
});

async function post(tenantId: string, input: DeliverInput, signal: AbortSignal) {
  const [w] = await withTenant(getRuntime().db, tenantId, (tx) => tx.execute(sql`select url, status from api.webhook where id = ${input.webhookId}`));
  if (!w || w.status !== "active") throw new NonRetryableError(INACTIVE);
  const t = Math.floor(Date.now() / 1000);
  const ctx = contextFor.job(tenantId, DELIVER);
  const signature = await useSecret(ctx, { connector: "amax-webhook", purpose: "sign outgoing webhook" }, async (s) => signPayload(s.reveal(), t, input.body)).catch((e: unknown) => {
    throw e instanceof SecretNotConfiguredError ? new NonRetryableError(`${SETUP}: ${e.message}`) : e;
  });
  // Checked again here on the resolved address and pinned to it (review 058 B8); never a redirect.
  const status = await safePost(String(w.url), {
    body: input.body, signal,
    headers: { "content-type": "application/json", "x-amax-event": input.event, "x-amax-delivery": input.eventId, "x-amax-signature": signature },
  }).catch((e: unknown) => {
    throw e instanceof EgressError ? new NonRetryableError(e.message) : e;
  });
  if (status < 200 || status > 299) throw new Error(`the receiver answered HTTP ${status}`);
  return status;
}

export const deliverWebhook = defineWorkflow<DeliverInput>({
  name: DELIVER,
  title: "Webhook delivery",
  async run(ctx, input) {
    const base = { webhookId: input.webhookId, eventId: input.eventId, event: input.event };
    try {
      const sent = await step("post", async (s) => ({ status: await post(ctx.tenantId, input, s.signal), attempts: s.attempt }), { timeout: "30s", retry: RETRY });
      await step("record", () => recordDelivery(contextFor.job(ctx.tenantId, DELIVER), { ...base, ok: true, ...sent }));
      return { ok: true };
    } catch (e) {
      if (!(e instanceof StepFailedError) || e.step !== "post") throw e;
      // A missing signing secret is amax's setup, not the receiver's failure: it never counts toward
      // switching the webhook off (060 AC-7).
      if (e.reason.includes(INACTIVE) || e.reason.includes(SETUP)) return { ok: false };
      await step("record", () => recordDelivery(contextFor.job(ctx.tenantId, DELIVER), { ...base, ok: false, attempts: RETRY.maxAttempts, status: null }));
      return { ok: false };
    }
  },
});
