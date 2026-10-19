import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { OverviewPanel, OverviewPart, OverviewWaiting } from "@amax/core";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { ACTIVE, clockOf, endOfDay, listReleases, phaseCounts, type ReleaseRow } from "./queries";

const read = <T>(v: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(v, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, v.tenantId, fn);
};
const monthStart = (d: Date, by = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1)).toISOString();

/** 068 AC-5: proposals shipped to Prod this month and last, and who closed most tasks this month (a person, or agents for them). */
export const deliveryPerformance = (v: Viewer) =>
  read(v, async (tx) => {
    const now = await clockOf(tx);
    const [m] = await tx.execute(sql`select count(*) filter (where released_at >= ${monthStart(now)} and released_at < ${endOfDay(now)})::int as this_month,
        count(*) filter (where released_at >= ${monthStart(now, -1)} and released_at < ${monthStart(now)})::int as last_month
      from delivery.proposal p where p.phase = 'released' and ${ACTIVE}`);
    const [top] = await tx.execute(sql`select u.name, count(*)::int as tasks, count(*) filter (where t.done_by not like 'user:%')::int as by_agents
      from delivery.task t join auth.user u on u.id::text = substring(t.done_by from 'user:([0-9a-f-]{36})')
      where t.done_at >= ${monthStart(now)} and t.done_at < ${endOfDay(now)} group by u.id, u.name order by tasks desc, u.name limit 1`);
    const thisMonth = Number(m.this_month), lastMonth = Number(m.last_month);
    return { thisMonth, lastMonth, change: lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10 : null,
      top: top ? { name: top.name as string, tasks: Number(top.tasks), byAgents: Number(top.by_agents) } : null };
  });

const passed = (r: ReleaseRow) => r.stages.filter((s) => s.status === "deployed").length;
const rolledBack = (r: ReleaseRow) => [...r.stages].sort((a, b) => b.position - a.position).find((s) => s.status === "rolled-back");
const open = (r: ReleaseRow) => !r.stages.some((s) => s.isProd && s.status === "deployed");
const releasePin = (r: ReleaseRow) => ({ label: `${r.projectName} ${r.version}`, tool: "get_release", args: { releaseId: r.id } });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

function stageNote(r: ReleaseRow) {
  const back = rolledBack(r);
  if (back) return `Rolled back from ${back.environment} on ${day(back.at)}`;
  const stages = [...r.stages].sort((a, b) => a.position - b.position);
  const at = stages.filter((s) => s.status).at(-1), next = stages.find((s) => !s.status);
  return `${at ? `In ${at.environment}` : "Not deployed yet"}${next ? `, ${next.environment} next` : ""}`;
}

async function proposalsToApprove(tx: Tx, v: Viewer): Promise<OverviewWaiting[]> {
  const rows = await tx.execute(sql`select p.id, p.key, p.title, p.project_id, p.created_at, p.estimate_hours, p.agent, p.owner_name, pr.name as project_name,
      p.tasks_total as tasks
    from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.phase = 'proposed' and ${ACTIVE} order by p.created_at limit 20`);
  return rows.filter((r) => can(v, "delivery:proposal:move", { projectId: r.project_id as string })).map((r) => ({
    id: `delivery:proposal:${r.id as string}`, title: `Approve proposal ${r.key as string} ${r.title as string}`,
    detail: [Number(r.tasks) ? `${Number(r.tasks)} tasks` : null, r.estimate_hours ? `estimated ${Number(r.estimate_hours)} h` : null].filter(Boolean).join(", ") || null,
    context: r.project_name as string, raisedBy: (r.agent as string | null) ?? (r.owner_name as string | null) ?? "Delivery",
    agent: Boolean(r.agent), since: new Date(r.created_at as string).toISOString(), action: "Review", prompt: `Review proposal ${r.key as string} and plan it if it's ready`,
    pin: { label: `${r.key as string} ${r.title as string}`, tool: "get_proposal", args: { proposalId: r.id as string } },
  }));
}

const rollbacks = (releases: ReleaseRow[]): OverviewWaiting[] => releases.filter(open).flatMap((r) => {
  const back = rolledBack(r);
  return back ? [{ id: `delivery:release:${r.id}`, title: `${r.version} failed in ${back.environment}`, detail: back.note, context: r.projectName, raisedBy: "Pipeline", agent: false,
    since: back.at ?? new Date(0).toISOString(), action: `Retry ${back.environment}`, prompt: `Retry ${r.projectName} ${r.version} in ${back.environment}`, pin: releasePin(r) }] : [];
});

// 068: the Proposals ticket, delivery performance, release readiness and the decisions delivery waits on.
export async function deliveryOverview(v: Viewer): Promise<OverviewPart> {
  const [counts, perf, releases, toApprove] = await Promise.all([phaseCounts(v), deliveryPerformance(v), listReleases(v), read(v, (tx) => proposalsToApprove(tx, v))]);
  // Releases that need watching first: a rollback, then the furthest along; never-deployed ones wait their turn.
  const ready = releases.filter((r) => open(r) && r.stages.some((s) => s.status)).sort((a, b) => Number(Boolean(rolledBack(b))) - Number(Boolean(rolledBack(a))) || passed(b) - passed(a)).slice(0, 2);
  const panels: OverviewPanel[] = [
    { kind: "metric", key: "delivery.performance", title: "Delivery performance", slot: "aside", order: 20, label: "Proposals shipped to Prod this month", value: String(perf.thisMonth), change: perf.change,
      person: perf.top ? { name: perf.top.name, note: `${perf.top.tasks} tasks closed this month${perf.top.byAgents ? `, ${perf.top.byAgents} by agents for them` : ""}` } : null,
      pin: { label: "Proposals shipped", tool: "list_proposals", args: { phase: "released" } } },
    { kind: "progress", key: "delivery.readiness", title: "Release readiness", slot: "aside", order: 40, pin: { label: "Releases", tool: "list_releases", args: {} },
      items: ready.map((r) => ({ id: r.id, label: `${r.projectName.split(" ")[0]} ${r.version}`, done: passed(r), total: r.stages.length, note: stageNote(r), problem: Boolean(rolledBack(r)), pin: releasePin(r) })) },
  ];
  return {
    lede: `${counts.inFlight} proposals in flight, ${counts.releasedThisMonth} shipped to Prod this month.`,
    tickets: [{ key: "delivery.proposals", order: 20, tone: "info", label: "Proposals in flight", value: String(counts.inFlight), note: `${counts.building} building, ${counts.verified} verified`, pin: { label: "Proposals in flight", tool: "list_proposals", args: {} } }],
    waiting: [...rollbacks(releases), ...toApprove],
    panels,
  };
}
