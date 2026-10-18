import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { getRuntime } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { TRIAGE_JOB } from "./contracts";
import { triage } from "./server/triage";

export const TRIAGE_CRON = "*/5 * * * *";

const untriaged = (tenantId: string) => withTenant(getRuntime().db, tenantId, async (tx) =>
  (await tx.execute(sql`select id from helpdesk.ticket where triaged_at is null and status in ('open', 'waiting') order by opened_at limit 50`)).map((r) => r.id as string));

// 006 agent work is a 029 workflow, never a request handler that waits: each new ticket is triaged in
// its own checkpointed step, so a retry never triages or suggests twice. Steps carry ids only.
export const triageWorkflow = defineWorkflow({
  name: TRIAGE_JOB,
  title: "Support agent triage",
  async run(ctx) {
    const ids = await step("find", () => untriaged(ctx.tenantId), { timeout: "1m" });
    let suggested = 0;
    for (const id of ids) suggested += await step(`triage-${id}`, (s) => triage(ctx.tenantId, id, s), { timeout: "2m", retry: { maxAttempts: 2 } });
    return { summary: `Triaged ${ids.length} ticket${ids.length === 1 ? "" : "s"}; ${suggested} access suggestion${suggested === 1 ? "" : "s"}` };
  },
});

export const triageSchedule = cron({ name: TRIAGE_JOB, title: "Support agent triage", workflow: TRIAGE_JOB, cron: TRIAGE_CRON, description: "New helpdesk tickets: category, priority and access requests" });
