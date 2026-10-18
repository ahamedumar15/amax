import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { contextFor, getRuntime } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { getProjectRef } from "@amax/delivery/contracts";
import { getPerson } from "@amax/hr/contracts";
import { monthLabel } from "./server/months";
import { setAllocation } from "./server/services";

const Rebalance = z.object({ personId: z.uuid(), projectKey: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}-01$/), percent: z.number().int().min(0).max(200) });
type Rebalance = z.infer<typeof Rebalance>;

const percentOf = async (tx: Parameters<typeof setAllocation>[0], p: Rebalance) => {
  const project = await getProjectRef(tx, p.projectKey);
  const [r] = project ? await tx.execute(sql`select percent from allocations.allocation where person_id = ${p.personId} and month = ${p.month}::date and project_id = ${project.id}`) : [];
  return (r?.percent as number | undefined) ?? 0;
};

async function set(tx: Parameters<typeof setAllocation>[0], ctx: Parameters<typeof setAllocation>[2], p: Rebalance, percent: number) {
  const was = await percentOf(tx, p);
  const out = await setAllocation(tx, { person: p.personId, projectKey: p.projectKey, month: p.month, percent }, ctx);
  return { applied: { was }, action: "allocations.allocation.set", resource: "allocations.allocation", resourceId: out.resourceId, before: out.before, after: out.after, events: out.events };
}

// 006: an allocation change an agent suggests. Undo restores the earlier percent until the month starts.
export const rebalance = defineSuggestionKind<Rebalance, { was: number }>({
  kind: "allocations.rebalance",
  title: "Allocation change",
  permission: "allocations:allocate",
  proposed: Rebalance,
  jobs: ["allocations.agent-check"],
  apply: (tx, ctx, p) => set(tx, ctx, p, p.percent),
  undo: (tx, ctx, p, a) => set(tx, ctx, p, a.was),
  cutoff: (p) => new Date(`${p.month}T00:00:00Z`),
});

const OVER = sql`select a.person_id, a.month::text as month, sum(a.percent)::int as total,
    (array_agg(a.project_id order by a.percent desc) filter (where a.project_id is not null))[1] as project_id,
    (array_agg(a.percent order by a.percent desc) filter (where a.project_id is not null))[1] as percent
  from allocations.allocation a where a.month > date_trunc('month', now()) and a.month <= date_trunc('month', now()) + interval '3 months'
  group by a.person_id, a.month having sum(a.percent) > 100`;

/** One pass: each person over 100% in a coming month gets a suggestion to trim their largest project, for that project's manager. */
export async function checkAllocations(tenantId: string) {
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const job = contextFor.job(tenantId, "allocations.agent-check");
    let n = 0;
    for (const r of await tx.execute(OVER)) {
      const [person, project] = [await getPerson(tx, job, r.person_id as string), r.project_id ? await getProjectRef(tx, r.project_id as string) : null];
      if (!person || !project) continue;
      const to = Math.max(0, Number(r.percent) - (Number(r.total) - 100));
      const by = contextFor.job(tenantId, "allocations.agent-check", project.managerUserId ? `user:${project.managerUserId}` : undefined);
      const made = await createSuggestion(by, {
        kind: rebalance.kind, target: { type: "allocations.slot", id: `${person.id}:${project.id}:${r.month}`, label: `${person.name}, ${project.name}, ${monthLabel(r.month as string, "long")}` },
        title: `Move ${person.name} to ${to}% on ${project.name} in ${monthLabel(r.month as string, "long")}`, detail: `${person.name} is planned at ${r.total}% that month.`,
        proposed: { personId: person.id, projectKey: project.key, month: r.month, percent: to }, confidence: 0.8, agentName: "Allocation check", scope: { projectId: project.id, legalEntityId: project.legalEntityId },
        evidence: [{ type: "record", label: `${monthLabel(r.month as string, "long")} plan`, ref: `/allocations` }],
      });
      if (!made.existing) n++;
    }
    return n;
  });
}

export const agentCheck = defineWorkflow({
  name: "allocations.agent-check",
  title: "Allocation check",
  async run(ctx) {
    const n = await step("scan", () => checkAllocations(ctx.tenantId), { timeout: "2m" });
    return { summary: n ? `${n} new suggestion${n === 1 ? "" : "s"}` : "Nobody over-allocated" };
  },
});

export const agentCheckSchedule = cron({ name: "allocations.agent-check", title: "Allocation check", description: "Suggests rebalancing people planned over 100% in the next three months", workflow: "allocations.agent-check", cron: "0 6 * * 1", enabled: false });
