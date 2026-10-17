import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray } from "@amax/db";
import { defineService } from "@amax/core/server";

export const WEBHOOK_MANAGE = "api:webhook:manage";
export const MAX_FAILURES = 5;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i;
export const publicHttps = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !PRIVATE_HOST.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
};

const missing = (id: string) => Object.assign(new Error(`no webhook ${id}`), { retryable: false, code: "not_found" });

export const subscribeWebhook = defineService({
  name: "api.webhook.subscribed",
  action: WEBHOOK_MANAGE,
  resource: "api.webhook",
  input: z.object({
    name: z.string().trim().min(2).max(80),
    url: z.string().max(2000).refine(publicHttps, "must be a public https URL"),
    events: z.array(z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z0-9_-]+)+$/)).min(1).max(50),
  }),
  async run(tx, input, ctx) {
    const [row] = await tx.execute(sql`insert into api.webhook (tenant_id, name, url, events, created_by)
      values (${ctx.tenantId}, ${input.name}, ${input.url}, ${textArray(input.events)}, ${ctx.actor.id}) returning id`);
    const id = row.id as string;
    return { result: { id, ...input, status: "active" }, resourceId: id, after: input, events: [{ name: "api.webhook.subscribed", payload: { id, ...input } }] };
  },
});

const setStatus = (name: string, from: string[], to: "active" | "removed") => defineService({
  name,
  action: WEBHOOK_MANAGE,
  resource: "api.webhook",
  input: z.object({ id: z.uuid() }),
  async run(tx, input) {
    const [row] = await tx.execute(sql`update api.webhook set status = ${to}, failures = 0, off_reason = null, updated_at = now()
      where id = ${input.id} and status = any(${textArray(from)}) returning name`);
    if (!row) throw missing(input.id);
    const after = { name: row.name as string, status: to };
    return { result: { id: input.id, ...after }, resourceId: input.id, after, events: [{ name, payload: { id: input.id } }] };
  },
});

export const unsubscribeWebhook = setStatus("api.webhook.unsubscribed", ["active", "off"], "removed");
export const resumeWebhook = setStatus("api.webhook.resumed", ["off"], "active");
