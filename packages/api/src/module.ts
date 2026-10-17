import { sql } from "drizzle-orm";
import type { EventHandlerDef, ModuleManifest, PayloadFields, RetentionEntry } from "@amax/core";
import type { WorkflowEngine } from "@amax/workflows/server";
import { deliverWebhook, DELIVER } from "./deliver";
import { webhookBody } from "./payload";

// 032: the API's logs are kept by the privacy purge, which honours tenant periods and legal holds.
// No job of its own deletes them (review 058 B4).
export const apiRetention: RetentionEntry[] = [
  { table: "api.rate_limited", label: "Rate-limited requests", subject: ["subject"], fields: ["subject"], class: "personal", period: "P90D", start: { at: ["hour"] }, action: "delete" },
  // The dedupe rows are GitHub's only replay protection (it sends no timestamp), so no tenant period
  // may delete them sooner (review 058 round 2).
  { table: "api.inbound", label: "Incoming webhook calls", fields: ["event_id"], class: "personal", period: "P90D", minimum: "P90D", start: { at: ["received_at"] }, action: "delete" },
  { table: "api.delivery", label: "Outgoing webhook deliveries", fields: ["event"], class: "personal", period: "P1Y", start: { at: ["delivered_at"] }, action: "delete" },
];

function fanOut(event: string, engine: () => Promise<WorkflowEngine>, fields: PayloadFields | undefined): EventHandlerDef {
  return {
    id: `api.webhooks:${event}`,
    event,
    async handle({ tx, tenantId, event: e }) {
      const hooks = await tx.execute(sql`select id from api.webhook where status = 'active' and ${event} = any(events)`);
      if (!hooks.length) return;
      const body = webhookBody(e, new Date().toISOString(), fields);
      const run = await engine();
      for (const h of hooks) {
        const input = { webhookId: h.id as string, eventId: e.id, event, body };
        await run.start(tenantId, DELIVER, input, { key: `webhook:${h.id}:${e.id}`, tx, startedBy: "api.webhooks" });
      }
    },
  };
}

/** An event a module emits, with its declared payload fields (declarePayload); undeclared fields are masked. */
export type WebhookEvent = { name: string; fields?: PayloadFields };

/** The webhook events of these manifests: what each emits, with the payload it declared for it. */
export function webhookEvents(modules: Pick<ModuleManifest, "events">[]): WebhookEvent[] {
  const out = new Map<string, WebhookEvent>();
  for (const m of modules) for (const name of m.events?.emits ?? []) out.set(name, { name, fields: stricter(out.get(name)?.fields, m.events?.payloads?.[name], out.has(name)) });
  return [...out.values()];
}

// Two modules emitting one event: a field is plain only if every declaration says so, and an emitter
// with no declaration makes the whole event undeclared (review 058 round 3).
function stricter(a: PayloadFields | undefined, b: PayloadFields | undefined, seen: boolean): PayloadFields | undefined {
  if (!seen) return b;
  if (!a || !b) return undefined;
  const merged: PayloadFields = {};
  for (const k of Object.keys(a)) if (k in b) merged[k] = a[k] === "plain" ? b[k] : a[k];
  return merged;
}

export const apiPlatform = (events: WebhookEvent[], engine: () => Promise<WorkflowEngine>) => ({
  id: "api",
  workflows: [deliverWebhook],
  retention: apiRetention,
  events: { handles: events.map((e) => fanOut(e.name, engine, e.fields)) },
});
