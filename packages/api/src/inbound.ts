import { sql } from "drizzle-orm";
import { z } from "zod";
import { contextFor, defineService } from "@amax/core/server";
import { SecretNotConfiguredError, useValidSecrets, type ConnectorId } from "@amax/core/secrets";
import { PROVIDERS, verifyWebhook, type Provider, type Verdict } from "./verify";

export const SECRET_OF: Record<Provider, ConnectorId> = {
  github: "github-webhook",
  "azure-devops": "azure-devops-webhook",
  msgraph: "msgraph-webhook",
  amax: "amax-webhook",
};

const record = defineService({
  name: "api.webhook.received",
  action: "api:webhook:receive",
  resource: "api.inbound",
  input: z.object({ provider: z.enum(PROVIDERS), eventId: z.string().max(200).nullable(), verified: z.boolean(), reason: z.string().nullable() }),
  async run(tx, input, ctx) {
    const [row] = await tx.execute(sql`insert into api.inbound (tenant_id, provider, event_id, verified, reason)
      values (${ctx.tenantId}, ${input.provider}, ${input.eventId}, ${input.verified}, ${input.reason})
      on conflict (tenant_id, provider, event_id) where verified do nothing returning id`);
    return { result: Boolean(row), resourceId: (row?.id as string | undefined) ?? null, after: input };
  },
});

export type Received = Verdict | { ok: false; reason: "duplicate"; eventId: string };

async function verdictFor(tenantId: string, provider: Provider, headers: Headers, body: string): Promise<Verdict> {
  const ctx = contextFor.job(tenantId, "api.webhook-verify");
  try {
    return await useValidSecrets(ctx, { connector: SECRET_OF[provider], purpose: `verify ${provider} webhook` }, async (secrets) =>
      verifyWebhook({ provider, headers, body, secrets: secrets.map((s) => s.reveal()) }));
  } catch (e) {
    if (e instanceof SecretNotConfiguredError) return { ok: false, reason: "missing", eventId: null };
    throw e;
  }
}

export async function receiveWebhook(tenantId: string, provider: Provider, headers: Headers, body: string): Promise<Received> {
  const v = await verdictFor(tenantId, provider, headers, body);
  const ctx = contextFor.job(tenantId, "api.webhook-verify");
  if (!v.ok) {
    await record(ctx, { provider, eventId: v.eventId?.slice(0, 200) ?? null, verified: false, reason: v.reason });
    return v;
  }
  const first = await record(ctx, { provider, eventId: v.eventId.slice(0, 200), verified: true, reason: null });
  return first ? v : { ok: false, reason: "duplicate", eventId: v.eventId };
}
