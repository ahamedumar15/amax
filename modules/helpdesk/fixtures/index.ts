import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { SUPPORT_AGENT, type Category } from "../contracts";
import { CLOCK, DUPLICATES, FIRST_RESPONSE, NAMED, OCTOBER_PEOPLE, OPEN, QUEUE_ROWS, RATINGS, REQUESTERS, RESOURCES, SCORES, SOLVED, type Seed } from "./data";

const H = 3_600_000;
const EARLIER: Category[] = ["Hardware", "Network", "Software", "HR letters", "Other", "Access"];
const TITLES: Record<Category, string> = { Access: "Access request", Hardware: "Hardware request", Network: "Network problem", Software: "Software install", "HR letters": "Letter from HR", Payroll: "Payroll question", Facilities: "Facilities request", Other: "General request" };

/** Every ticket the agent and people solved since late August, and October's duplicates, closed on their days. */
function history(now: number): Seed[] {
  const pool = OCTOBER_PEOPLE.flatMap(([c, n]) => Array<Category>(n).fill(c));
  const out: Seed[] = [];
  for (const b of SOLVED) {
    for (let k = 0; k < b.agent + b.people; k++) {
      const agent = k < b.agent;
      const day = b.days[k % b.days.length];
      const closed = Date.parse(`${day}T${String(6 + (k % 10)).padStart(2, "0")}:${String((k * 7) % 60).padStart(2, "0")}:00Z`);
      const category = agent ? "Access" : day >= "2026-10" ? pool.shift()! : EARLIER[k % EARLIER.length];
      out.push({ queue: category === "HR letters" ? "hr" : "it", title: TITLES[category], category, status: "resolved", requester: REQUESTERS[out.length % REQUESTERS.length],
        handler: agent ? "agent" : category === "HR letters" ? "maya" : k % 2 ? "ravi" : "sahan", openedH: (now - closed) / H + 2 + (k % 4), closedH: (now - closed) / H,
        resolution: agent ? "Granted by support agent after the owner approved" : "Fixed and confirmed with the requester" });
    }
  }
  for (let k = 0; k < DUPLICATES; k++) {
    const opened = Date.parse(`2026-10-0${5 + (k % 5)}T${String(9 + (k % 6)).padStart(2, "0")}:00:00Z`);
    const category = pool.shift()!;
    out.push({ queue: category === "HR letters" ? "hr" : "it", title: TITLES[category], category, status: "closed", requester: REQUESTERS[k % REQUESTERS.length], handler: "sahan",
      openedH: (now - opened) / H, closedH: (now - opened) / H - 1, resolution: "Duplicate of an open ticket" });
  }
  return out;
}

function numbered(seeds: Seed[]) {
  const next: Record<string, number> = { it: 20407, hr: 1179, facilities: 100 };
  const prefix = Object.fromEntries(QUEUE_ROWS.map((q) => [q.key, q.prefix]));
  return [...seeds].sort((a, b) => a.openedH - b.openedH).map((s) => (s.number ? s : { ...s, number: `${prefix[s.queue]}-${next[s.queue]--}` }));
}

async function userIds(tx: Tx) {
  const rows = await tx.execute(sql`select id, split_part(email, '@', 1) as key from auth.user where email like '%@lumenlabs.test'`);
  return new Map(rows.map((r) => [r.key as string, r.id as string]));
}

const bulk = (tx: Tx, rows: object[]) => tx.execute(sql`insert into helpdesk.ticket (tenant_id, queue_id, number, title, category, priority, status, channel, requester_user_id, signed_in, note, resolution,
    handled_by, created_by, origin, origin_ref, opened_at, first_response_at, triaged_at, closed_at)
  select x.tenant_id, q.id, x.number, x.title, x.category, x.priority, x.status, x.channel, x.requester_user_id, x.signed_in, x.note, x.resolution, x.handled_by, x.created_by, x.origin, x.origin_ref,
    x.opened_at, x.first_response_at, x.opened_at, x.closed_at
  from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as x(tenant_id uuid, queue text, number text, title text, category text, priority text, status text, channel text, requester_user_id uuid,
    signed_in boolean, note text, resolution text, handled_by text, created_by text, origin text, origin_ref text, opened_at timestamptz, first_response_at timestamptz, closed_at timestamptz)
  join helpdesk.queue q on q.key = x.queue`);

// Seeds the three queues and their targets, the access resources, the demo's pinned clock and every ticket and rating. Safe to re-run.
export const helpdeskFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [done] = await tx.execute(sql`select 1 from helpdesk.queue`);
  if (done) return;
  const now = Date.parse(CLOCK(shared.today));
  const ids = await userIds(tx);
  await tx.execute(sql`insert into helpdesk.clock_pin (tenant_id, now_at) values (${tenantId}, ${new Date(now).toISOString()})`);
  for (const q of QUEUE_ROWS) {
    const [row] = await tx.execute(sql`insert into helpdesk.queue (tenant_id, key, name, prefix, next_no) values (${tenantId}, ${q.key}, ${q.name}, ${q.prefix}, ${q.next}) returning id`);
    for (const [p, [resp, resol]] of Object.entries(q.sla)) await tx.execute(sql`insert into helpdesk.sla (tenant_id, queue_id, priority, response_minutes, resolution_minutes) values (${tenantId}, ${row.id}, ${p}, ${resp}, ${resol})`);
  }
  for (const r of RESOURCES) if (ids.has(r.owner)) await tx.execute(sql`insert into helpdesk.access_resource (tenant_id, key, name, owner_user_id) values (${tenantId}, ${r.key}, ${r.name}, ${ids.get(r.owner)})`);
  const at = (h: number | undefined) => (h === undefined ? null : new Date(now - h * H).toISOString());
  const rows = numbered([...NAMED.map((s) => ({ ...s, firstResponseMin: 7 })), ...OPEN, ...history(now)]).map((s, i) => ({
    tenant_id: tenantId, queue: s.queue, number: s.number, title: s.title, category: s.category, priority: s.priority ?? "normal", status: s.status, channel: s.channel ?? "chat",
    requester_user_id: ids.get(s.requester) ?? null, signed_in: s.signedIn ?? (s.channel ?? "chat") !== "email", note: s.note ?? null, resolution: s.resolution ?? null,
    handled_by: s.handler === "agent" ? SUPPORT_AGENT : s.handler && ids.has(s.handler) ? `user:${ids.get(s.handler)}` : null,
    created_by: s.origin ? `job:${s.origin}` : `user:${ids.get(s.requester)}`, origin: s.origin ?? null, origin_ref: s.origin ? "demo-joiner-rifkhan" : null,
    opened_at: at(s.openedH), first_response_at: new Date(now - s.openedH * H + (s.firstResponseMin ?? FIRST_RESPONSE[i % 5]) * 60_000).toISOString(), closed_at: at(s.closedH),
  }));
  await bulk(tx, rows);
  // 212 ratings averaging 4.7: the score pattern over whole runs of ten, then fives.
  const whole = RATINGS - (RATINGS % SCORES.length);
  await tx.execute(sql`insert into helpdesk.rating (tenant_id, ticket_id, score, rated_at)
    select ${tenantId}, r.id, case when r.n <= ${whole} then (${`{${SCORES.join(",")}}`}::int[])[1 + (r.n - 1) % ${SCORES.length}] else 5 end, r.closed_at + interval '1 hour'
    from (select id, closed_at, row_number() over (order by closed_at, number) as n from helpdesk.ticket where status = 'resolved' and number <> 'INC-20429') r where r.n <= ${RATINGS}`);
};
