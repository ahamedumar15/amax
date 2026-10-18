import { sql } from "drizzle-orm";
import { z } from "zod";
import { contextFor, defineService, logError, type Limited } from "@amax/core/server";

const record = defineService({
  name: "api.rate_limited.recorded",
  action: "api:rate:record",
  resource: "api.rate_limited",
  input: z.object({ hour: z.string(), rows: z.array(z.object({ channel: z.string(), subject: z.string(), count: z.number().int().positive() })).min(1) }),
  async run(tx, input, ctx) {
    for (const r of input.rows) {
      await tx.execute(sql`insert into api.rate_limited (tenant_id, hour, channel, subject, count) values (${ctx.tenantId}, ${input.hour}, ${r.channel}, ${r.subject}, ${r.count})
        on conflict (tenant_id, hour, channel, subject) do update set count = api.rate_limited.count + excluded.count`);
    }
    return { result: input.rows.length, resourceId: null, after: { hour: input.hour, limited: input.rows.reduce((n, r) => n + r.count, 0) } };
  },
});

const hourOf = (ms: number) => new Date(Math.floor(ms / 3_600_000) * 3_600_000).toISOString();

/**
 * Records 429s on the request path (060 AC-5): each one schedules a write right away and hands the
 * promise to `defer` (the host's after()/waitUntil), so a frozen or recycled instance can't drop the
 * counts the way a timer would. 429s in the same tick share one write.
 */
export function rateLimitRecorder(defer: (p: Promise<void>) => void = () => {}) {
  const pending = new Map<string, number>();
  let scheduled = false;
  let chain = Promise.resolve();
  async function write() {
    scheduled = false;
    const byTenant = new Map<string, { channel: string; subject: string; count: number }[]>();
    for (const [key, count] of pending) {
      const [tenantId, channel, subject] = key.split("|");
      byTenant.set(tenantId, [...(byTenant.get(tenantId) ?? []), { channel, subject, count }]);
    }
    pending.clear();
    const hour = hourOf(Date.now());
    for (const [tenantId, rows] of byTenant) await record(contextFor.job(tenantId, "api.rate-limit"), { hour, rows }).catch((e) => void logError("api.rate-limit", e));
  }
  const flush = () => (chain = chain.then(write));
  const sink = (l: Limited) => {
    const key = `${l.tenantId}|${l.channel}|${l.subject}`;
    pending.set(key, (pending.get(key) ?? 0) + 1);
    if (scheduled) return;
    scheduled = true;
    defer(flush());
  };
  return { sink, flush };
}
