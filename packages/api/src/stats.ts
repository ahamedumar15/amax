import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { PROVIDERS, type Provider } from "./verify";

export type WebhookView = { id: string; name: string; url: string; events: string[]; status: "active" | "off"; offReason: string | null; failures: number; delivered: number; total: number; lastDeliveryAt: string | null };
export type InboundView = { provider: Provider; verified: number; rejected: number; lastVerifiedAt: string | null };
export type LimitedView = { total: number; byChannel: { channel: string; subjects: number; count: number }[]; peakDay: string | null };
export type ApiStats = { webhooks: WebhookView[]; inbound: InboundView[]; limited: LimitedView; deliveries: { ok: number; total: number } };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const WEEK = sql`now() - interval '7 days'`;

export async function listWebhooks(db: Db, tenantId: string): Promise<WebhookView[]> {
  const rows = await withTenant(db, tenantId, (tx) => tx.execute(sql`select w.*,
      (select count(*) filter (where d.ok) from api.delivery d where d.webhook_id = w.id and d.delivered_at > ${WEEK})::int as delivered,
      (select count(*) from api.delivery d where d.webhook_id = w.id and d.delivered_at > ${WEEK})::int as total,
      (select max(d.delivered_at) from api.delivery d where d.webhook_id = w.id) as last_at
    from api.webhook w where w.status <> 'removed' order by w.status = 'off' desc, w.created_at`));
  return rows.map((r) => ({
    id: r.id as string, name: r.name as string, url: r.url as string, events: r.events as string[], status: r.status as "active" | "off",
    offReason: (r.off_reason as string | null) ?? null, failures: Number(r.failures), delivered: Number(r.delivered), total: Number(r.total), lastDeliveryAt: iso(r.last_at),
  }));
}

export async function apiStats(db: Db, tenantId: string): Promise<ApiStats> {
  return withTenant(db, tenantId, async (tx) => {
    const inbound = await tx.execute(sql`select provider, count(*) filter (where verified)::int as ok, count(*) filter (where not verified)::int as bad,
      max(received_at) filter (where verified) as last from api.inbound where received_at > ${WEEK} group by provider`);
    const limited = await tx.execute(sql`select channel, count(distinct subject)::int as subjects, sum(count)::int as n from api.rate_limited where hour > ${WEEK} group by channel order by n desc`);
    const [peak] = await tx.execute(sql`select to_char(date_trunc('day', hour), 'FMDay') as day from api.rate_limited where hour > ${WEEK}
      group by date_trunc('day', hour) order by sum(count) desc limit 1`);
    const [d] = await tx.execute(sql`select count(*) filter (where ok)::int as ok, count(*)::int as total from api.delivery where delivered_at > ${WEEK}`);
    const byChannel = limited.map((r) => ({ channel: r.channel as string, subjects: Number(r.subjects), count: Number(r.n) }));
    return {
      webhooks: await listWebhooks(db, tenantId),
      inbound: PROVIDERS.map((provider) => {
        const r = inbound.find((x) => x.provider === provider);
        return { provider, verified: Number(r?.ok ?? 0), rejected: Number(r?.bad ?? 0), lastVerifiedAt: iso(r?.last) };
      }),
      limited: { total: byChannel.reduce((n, c) => n + c.count, 0), byChannel, peakDay: (peak?.day as string | undefined) ?? null },
      deliveries: { ok: Number(d?.ok ?? 0), total: Number(d?.total ?? 0) },
    };
  });
}
