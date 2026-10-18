import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";

const one = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute(q))[0];
const user = (tx: Tx, key: string) => one(tx, sql`select 'user:' || id::text as id from auth.user where email = ${`${key}@lumenlabs.test`}`);
const person = (tx: Tx, no: string) => one(tx, sql`select id, name from hr.person where employee_no = ${no}`);
const project = (tx: Tx, key: string) => one(tx, sql`select id, name, legal_entity_id from delivery.project where key = ${key}`);

type Demo = { no: string; key: string; month: string; percent: number; title: string; detail: string; agent: string; actsFor: string; confidence: number; hours: number;
  source?: { channel: "email"; label: string; ref: string }; accepted?: { by: string; was: number } };

// 006: the demo's suggestions, consistent with the allocations fixtures (Ayesha is planned at 120% in
// December). All names and addresses are fictional. Safe to re-run: nothing is added once any exist.
const DEMO: Demo[] = [
  { no: "LL-0291", key: "HRI", month: "2026-12-01", percent: 50, title: "Move Ayesha Rahman to 50% on HR Insights in December", detail: "Ayesha Rahman is planned at 120% that month.", agent: "Allocation check", actsFor: "ayesha", confidence: 0.82, hours: 24 * 6 },
  { no: "LL-0417", key: "FLT", month: "2026-12-01", percent: 50, title: "Move Kasun Dias to 50% on Fleet Tracker in December", detail: "The client says the next phase is paused until January.", agent: "Inbox agent", actsFor: "nimal", confidence: 0.64, hours: 20,
    source: { channel: "email", label: "Email from a.lee@wideworld.test (fictional)", ref: "demo-msg-0042" } },
  { no: "LL-0233", key: "CON", month: "2027-01-01", percent: 50, title: "Move Nimal Silva to 50% on Contoso Portal in January", detail: "Contoso Portal needs a tech lead through January.", agent: "Allocation check", actsFor: "maya", confidence: 0.77, hours: 24 * 6, accepted: { by: "maya", was: 50 } },
];

export const agentsFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [tables] = await tx.execute(sql`select to_regclass('hr.person') is not null and to_regclass('delivery.project') is not null as ok`);
  const [existing] = await tx.execute(sql`select 1 from agents.suggestion limit 1`);
  if (existing || !tables.ok) return;
  for (const d of DEMO) {
    const [p, pr, acts] = [await person(tx, d.no), await project(tx, d.key), await user(tx, d.actsFor)];
    if (!p || !pr || !acts) continue;
    const by = d.accepted ? (await user(tx, d.accepted.by))?.id : null;
    const source = d.source ?? { channel: "internal", label: null, ref: null };
    await tx.execute(sql`insert into agents.suggestion (tenant_id, kind, target_type, target_id, target_label, title, detail, proposed, evidence, confidence, agent, agent_name, acts_for,
        source_channel, source_label, source_ref, scope, status, decided_by, decided_at, applied, undo_until, expires_at, created_at)
      values (${tenantId}, 'allocations.rebalance', 'allocations.slot', ${`${p.id}:${pr.id}:${d.month}`}, ${`${p.name}, ${pr.name}`}, ${d.title}, ${d.detail},
        ${JSON.stringify({ personId: p.id, projectKey: d.key, month: d.month, percent: d.percent })}::jsonb, ${JSON.stringify([{ type: "link", label: "The plan on Allocations", ref: "/allocations" }])}::jsonb,
        ${d.confidence}, ${d.agent === "Inbox agent" ? "job:agents.run:inbox.triage" : "job:allocations.agent-check"}, ${d.agent}, ${acts.id}, ${source.channel}, ${source.label}, ${source.ref},
        ${JSON.stringify({ projectId: pr.id, legalEntityId: pr.legal_entity_id })}::jsonb, ${d.accepted ? "accepted" : "open"}, ${by ?? null}, ${d.accepted ? sql`now() - interval '1 day'` : null},
        ${d.accepted ? JSON.stringify({ was: d.accepted.was }) : null}::jsonb, ${d.accepted ? sql`now() + interval '6 days'` : null}, now() + make_interval(hours => ${d.hours}), now() - interval '1 day')`);
  }
};
