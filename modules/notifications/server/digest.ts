import { sql } from "drizzle-orm";
import { contextFor } from "@amax/core/server";
import { cron, defineWorkflow, entityZone, step, StepFailedError } from "@amax/workflows";
import { DIGEST_HOUR, type Channel } from "../contracts";
import { RETRY } from "./deliver";
import { recordDelivery } from "./record";
import { localMinutes, minutes } from "./quiet";
import { inTenant, NOT_SET_UP, outgoing, recipient, sendVia } from "./send";

export const DIGEST = "notifications.digest";
type Batch = { userId: string; channel: Channel; ids: string[]; lines: string[] };

const SLOT_MINUTES = 30;

// People whose local time (their legal entity's zone) is in the digest's half-hour slot, with digest deliveries waiting.
const collect = (tenantId: string, at: Date) => inTenant(tenantId, async (tx) => {
  const rows = await tx.execute(sql`select d.user_id, d.channel, u.legal_entity_id, array_agg(d.id::text order by n.created_at) as ids, array_agg(n.title order by n.created_at) as lines
    from notifications.delivery d join notifications.notification n on n.id = d.notification_id join auth.user u on u.id = d.user_id
    where d.status = 'digest' group by d.user_id, d.channel, u.legal_entity_id`);
  const zones = new Map<string, string>();
  const due: Batch[] = [];
  for (const r of rows) {
    const entity = (r.legal_entity_id as string | null) ?? "";
    if (!zones.has(entity)) zones.set(entity, await entityZone(tx, entity || null));
    const m = localMinutes(at, zones.get(entity)!) - minutes(DIGEST_HOUR);
    if (m >= 0 && m < SLOT_MINUTES) due.push({ userId: r.user_id as string, channel: r.channel as Channel, ids: r.ids as string[], lines: r.lines as string[] });
  }
  return due;
});

async function sendBatch(tenantId: string, b: Batch, signal: AbortSignal) {
  const to = await inTenant(tenantId, (tx) => recipient(tx, b.userId));
  if (!to) return null;
  const n = b.lines.length;
  const m = outgoing(to, { title: `Your amax digest: ${n} notification${n === 1 ? "" : "s"}`, body: b.lines.map((l) => `- ${l}`).join("\n"), href: "/notifications", urgent: false });
  return sendVia(tenantId, b.channel, m, signal);
}

/** The daily digest (030 AC-3): one message per person and channel with everything that waited for it. */
export const sendDigest = defineWorkflow<{ at?: string }>({
  name: DIGEST,
  title: "Notification digest",
  async run(ctx, input) {
    const at = await step("at", async () => input?.at ?? new Date().toISOString());
    const batches = await step("collect", () => collect(ctx.tenantId, new Date(at)));
    let sent = 0;
    for (const b of batches) {
      const key = `${b.userId}:${b.channel}`;
      const r = await step(`send:${key}`, async (s) => ({ adapter: await sendBatch(ctx.tenantId, b, s.signal), attempts: s.attempt, error: null as string | null }), { timeout: "30s", retry: RETRY })
        .catch((e: unknown) => {
          if (!(e instanceof StepFailedError)) throw e;
          return { adapter: null, attempts: RETRY.maxAttempts, error: e.reason.slice(0, 500) };
        });
      const status = r.adapter ? "sent" : r.error?.includes(NOT_SET_UP) ? "skipped" : "failed";
      await step(`record:${key}`, () => recordDelivery(contextFor.job(ctx.tenantId, DIGEST), { ids: b.ids, channel: b.channel, adapter: r.adapter, status, attempts: r.attempts, error: r.error }));
      if (status === "sent") sent++;
    }
    return { ok: true, summary: `${sent} of ${batches.length} digests sent` };
  },
});

// Every half hour in UTC, so 08:00 falls in a slot in every zone, including half-hour offsets such as Colombo's.
export const digestSchedules = [
  cron({ name: "notifications.digest", title: "Notification digest", description: "Sends each person's waiting notifications as one message at 08:00 in their legal entity's zone", workflow: DIGEST, cron: `*/${SLOT_MINUTES} * * * *` }),
];
