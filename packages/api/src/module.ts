import { sql } from "drizzle-orm";
import type { EventHandlerDef, RetentionEntry } from "@amax/core";
import type { Sensitivity } from "@amax/core/server";
import type { WorkflowEngine } from "@amax/workflows/server";
import { deliverWebhook, DELIVER } from "./deliver";
import { webhookBody } from "./payload";

// 032: the API's logs are kept by the privacy purge, which honours tenant periods and legal holds.
// No job of its own deletes them (review 058 B4).
export const apiRetention: RetentionEntry[] = [
  { table: "api.rate_limited", label: "Rate-limited requests", subject: ["subject"], fields: ["subject"], class: "personal", period: "P90D", start: { at: ["hour"] }, action: "delete" },
  { table: "api.inbound", label: "Incoming webhook calls", fields: ["event_id"], class: "personal", period: "P90D", start: { at: ["received_at"] }, action: "delete" },
  { table: "api.delivery", label: "Outgoing webhook deliveries", fields: ["event"], class: "personal", period: "P1Y", start: { at: ["delivered_at"] }, action: "delete" },
];

function fanOut(event: string, engine: () => Promise<WorkflowEngine>, classes: Record<string, Sensitivity>): EventHandlerDef {
  return {
    id: `api.webhooks:${event}`,
    event,
    async handle({ tx, tenantId, event: e }) {
      const hooks = await tx.execute(sql`select id from api.webhook where status = 'active' and ${event} = any(events)`);
      if (!hooks.length) return;
      const body = webhookBody(e, new Date().toISOString(), classes);
      const run = await engine();
      for (const h of hooks) {
        const input = { webhookId: h.id as string, eventId: e.id, event, body };
        await run.start(tenantId, DELIVER, input, { key: `webhook:${h.id}:${e.id}`, tx, startedBy: "api.webhooks" });
      }
    },
  };
}

/** `classes`: the installed modules' declared field classes (declaredFieldClasses), which mask payloads. */
export const apiPlatform = (emits: string[], engine: () => Promise<WorkflowEngine>, classes: Record<string, Sensitivity> = {}) => ({
  id: "api",
  workflows: [deliverWebhook],
  retention: apiRetention,
  events: { handles: [...new Set(emits)].map((e) => fanOut(e, engine, classes)) },
});
