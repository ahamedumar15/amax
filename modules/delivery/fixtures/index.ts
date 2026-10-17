import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";

// Delivery data from fixtures.md: 3 projects; 37 proposals in flight (6 proposed, 4 planned,
// 18 building, 9 verified) and 5 released this month; the Contoso board; three releases.
const PROJECTS = [
  { key: "CON", color: "violet", sprint: "Sprint 18", done: 9, total: 16, health: "on-track", risk: null, margin: 38.2, next: "v2.5.0, Nov 28", manager: "maya" },
  { key: "FLT", color: "amber", sprint: "Sprint 11", done: 5, total: 16, health: "at-risk", risk: 71, margin: 29.6, next: "v1.8.0, retry UAT", manager: "nimal" },
  { key: "HRI", color: "pink", sprint: "Kanban", done: 14, total: 17, health: "on-track", risk: null, margin: 41.0, next: "v0.9.3, Nov 6", manager: "ayesha" },
];

type P = { key: string; title: string; phase: string; done?: number; total?: number; hours?: number; est?: number; owner?: string; agent?: string; release?: string; releasedAt?: string };

const NAMED: P[] = [
  { key: "CON-016", title: "Audit trail on approvals", phase: "proposed", est: 6, owner: "Ayesha Rahman" },
  { key: "CON-017", title: "CSV import for clients", phase: "proposed", est: 4, owner: "Nimal Silva", agent: "Claude for Nimal" },
  { key: "CON-013", title: "Dark mode", phase: "planned", done: 0, total: 3, owner: "Kasun Dias", release: "CON v2.5.0" },
  { key: "CON-014", title: "Invoice export to PDF", phase: "building", done: 3, total: 5, hours: 7.5, owner: "Nimal Silva", agent: "Claude for Nimal", release: "CON v2.5.0" },
  { key: "CON-011", title: "Global search", phase: "building", done: 1, total: 5, hours: 2, owner: "Kasun Dias", release: "CON v2.5.0" },
  { key: "CON-012", title: "SSO token refresh", phase: "verified", done: 4, total: 4, hours: 9, owner: "Ayesha Rahman", agent: "specclaw", release: "CON v2.4.0" },
  { key: "CON-010", title: "Email digest", phase: "verified", done: 6, total: 6, hours: 14, owner: "Kasun Dias", agent: "specclaw", release: "CON v2.4.0" },
  { key: "CON-009", title: "Reports v2", phase: "released", done: 8, total: 8, hours: 22.5, owner: "Nimal Silva", releasedAt: "2026-09-30T10:00:00Z" },
  { key: "FLT-015", title: "Bulk upload", phase: "proposed", hours: 0.5, owner: "Kasun Dias" },
];

const TITLES = ["Driver roster sync", "Route replay", "Geofence alerts", "Trip export", "Fuel report", "Map clustering", "Offline mode", "Vehicle health widget",
  "Maintenance reminders", "Telematics webhook", "Role-based dashboards", "Attrition trend", "Survey import", "Headcount drill-down", "Manager digest",
  "Absence heatmap", "Team pulse", "Skills matrix view", "Payroll cost chart", "Diversity report", "Org chart export", "Data refresh status", "Alert rules",
  "Saved filters", "Audit export", "Bulk tagging", "Access review", "Dashboard sharing", "Usage analytics", "Release notes page", "Retention cohort"];

function fillers(): P[] {
  const out: P[] = [];
  let t = 0;
  const add = (project: string, from: number, phases: [string, number][], extra: Partial<P> = {}) => {
    let n = from;
    for (const [phase, count] of phases) for (let i = 0; i < count; i++) {
      const total = phase === "planned" ? 3 : phase === "building" ? 5 : phase === "verified" ? 4 : 0;
      const done = phase === "building" ? 1 + (i % 3) : phase === "verified" ? total : 0;
      out.push({ key: `${project}-${String(n++).padStart(3, "0")}`, title: TITLES[t++ % TITLES.length], phase, done, total, hours: done * 2.5, ...extra,
        ...(phase === "verified" && project === "FLT" ? { release: "FLT v1.8.0" } : {}) });
    }
  };
  add("FLT", 20, [["proposed", 1], ["planned", 2], ["building", 8], ["verified", 5]], { owner: "Nimal Silva" });
  add("HRI", 1, [["proposed", 2], ["planned", 1], ["building", 8], ["verified", 2]], { owner: "Ayesha Rahman" });
  for (let i = 0; i < 4; i++) out.push({ key: `HRI-1${String(i).padStart(2, "0")}`, title: TITLES[(t++) % TITLES.length], phase: "released", done: 3, total: 3, hours: 6, owner: "Ayesha Rahman", release: "HRI v0.9.2", releasedAt: "2026-10-01T09:00:00Z" });
  out.push({ key: "HRI-104", title: "Login hotfix", phase: "released", done: 1, total: 1, hours: 1.5, owner: "Ayesha Rahman", releasedAt: "2026-10-06T15:00:00Z" });
  return out;
}

const RELEASES: { project: string; version: string; deployments: [string, string, string, string?, string?][] }[] = [
  { project: "CON", version: "v2.5.0", deployments: [] },
  { project: "CON", version: "v2.4.0", deployments: [["Dev", "deployed", "2026-10-12T09:00:00Z"], ["QA", "testing", "2026-10-15T09:00:00Z"]] },
  { project: "FLT", version: "v1.8.0", deployments: [["Dev", "deployed", "2026-10-08T09:00:00Z"], ["QA", "deployed", "2026-10-12T09:00:00Z"],
    ["UAT", "rolled-back", "2026-10-14T11:00:00Z", "Smoke test \"upload over 20 MB\" failed. Waiting on Maya, 2 d", "1190"]] },
  { project: "HRI", version: "v0.9.2", deployments: [["Dev", "deployed", "2026-09-22T09:00:00Z"], ["QA", "deployed", "2026-09-25T09:00:00Z"], ["UAT", "deployed", "2026-09-29T09:00:00Z"], ["Prod", "deployed", "2026-10-01T09:00:00Z"]] },
];

const userId = async (tx: Tx, key: string) =>
  ((await tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0]?.id as string | undefined) ?? null;

export const deliveryFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const ids: Record<string, string> = {};
  for (const [i, p] of PROJECTS.entries()) {
    const s = shared.projects.find((x) => x.key === p.key)!;
    const managerName = shared.people.find((x) => x.key === p.manager)!.name;
    const [row] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id, color, sprint, sprint_done, sprint_total,
        health, risk_pct, margin_pct, contract_value, invoiced, currency, next_release, created_at)
      values (${tenantId}, ${p.key}, ${s.name}, ${s.client}, ${s.billing}, ${managerName}, ${await userId(tx, p.manager)}, ${p.color}, ${p.sprint}, ${p.done}, ${p.total},
        ${p.health}, ${p.risk}, ${p.margin}, ${s.contractValue}, ${s.invoiced}, ${s.currency}, ${p.next}, ${new Date(Date.UTC(2026, 0, 1 + i)).toISOString()})
      on conflict (tenant_id, key) do update set name = excluded.name returning id`);
    ids[p.key] = row.id as string;
  }
  for (const [i, name] of ["Dev", "QA", "UAT", "Prod"].entries()) {
    await tx.execute(sql`insert into delivery.environment (tenant_id, name, position, is_prod) values (${tenantId}, ${name}, ${i + 1}, ${name === "Prod"}) on conflict do nothing`);
  }
  const releaseIds: Record<string, string> = {};
  for (const [i, r] of RELEASES.entries()) {
    const [row] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version, created_at)
      values (${tenantId}, ${ids[r.project]}, ${r.version}, ${new Date(Date.UTC(2026, 9, 10 - i)).toISOString()})
      on conflict (project_id, version) do update set version = excluded.version returning id`);
    releaseIds[`${r.project} ${r.version}`] = row.id as string;
    for (const [env, status, at, note, run] of r.deployments) {
      const exists = await tx.execute(sql`select 1 from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = ${row.id} and e.name = ${env}`);
      if (exists.length) continue;
      await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, at, note, pipeline_run, recorded_by)
        select ${tenantId}, ${row.id}, id, ${status}, ${at}, ${note ?? null}, ${run ?? null}, 'fixtures' from delivery.environment where name = ${env}`);
    }
  }
  for (const [i, p] of [...NAMED, ...fillers()].entries()) {
    const project = p.key.split("-")[0];
    await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, hours, estimate_hours, owner_name, agent, release_id, released_at, updated_at)
      values (${tenantId}, ${ids[project]}, ${p.key}, ${p.title}, ${p.phase}, ${p.done ?? 0}, ${p.total ?? 0}, ${p.hours ?? 0}, ${p.est ?? null}, ${p.owner ?? null}, ${p.agent ?? null},
        ${p.release ? releaseIds[p.release] : null}, ${p.releasedAt ?? null}, ${new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - i * 60_000).toISOString()})
      on conflict (tenant_id, key) do nothing`);
  }
};
