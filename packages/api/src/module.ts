import { sql } from "drizzle-orm";
import type { EventHandlerDef, JobDef, RetentionEntry } from "@amax/core";
import type { WorkflowEngine } from "@amax/workflows/server";
import { deliverWebhook, DELIVER } from "./deliver";
import { webhookBody } from "./payload";

export const apiRetention: RetentionEntry[] = [
  { table: "api.rate_limited", fields: ["subject"], class: "personal", period: "P90D", start: { at: ["hour"] }, action: "delete" },
];

const pruneJob: JobDef = {
  name: "api.prune",
  cron: "23 3 * * *",
  async run({ tx }) {
    await tx.execute(sql`delete from api.rate_limited where hour < now() - interval '90 days'`);
    await tx.execute(sql`delete from api.inbound where received_at < now() - interval '90 days'`);
    await tx.execute(sql`delete from api.delivery where delivered_at < now() - interval '1 year'`);
  },
};

function fanOut(event: string, engine: () => Promise<WorkflowEngine>): EventHandlerDef {
  return {
    id: `api.webhooks:${event}`,
    event,
    async handle({ tx, tenantId, event: e }) {
      const hooks = await tx.execute(sql`select id from api.webhook where status = 'active' and ${event} = any(events)`);
      if (!hooks.length) return;
      const body = webhookBody(e, new Date().toISOString());
      const run = await engine();
      for (const h of hooks) {
        const input = { webhookId: h.id as string, eventId: e.id, event, body };
        await run.start(tenantId, DELIVER, input, { key: `webhook:${h.id}:${e.id}`, tx, startedBy: "api.webhooks" });
      }
    },
  };
}

export const apiPlatform = (emits: string[], engine: () => Promise<WorkflowEngine>) => ({
  id: "api",
  workflows: [deliverWebhook],
  jobs: [pruneJob],
  retention: apiRetention,
  events: { handles: [...new Set(emits)].map((e) => fanOut(e, engine)) },
});
