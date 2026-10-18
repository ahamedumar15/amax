import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { day, uuids } from "./read";

// AC-5: what the experience agent finds in the last 7 days of readings. An app version whose crashes
// or hangs show on 2 or more devices, a model that takes over 4 minutes to boot, and worn batteries.
type Found = { key: string; kind: "app" | "boot" | "battery"; subject: string; version: string | null; title: string; cause: string; arrivedOn: string | null; ratio: number | null;
  firstSeen: string; devices: string[]; confidence: number; fix: "remediation" | "ticket" };

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SLOW_BOOT = 240;

async function apps(tx: Tx, today: string): Promise<Found[]> {
  const rows = await tx.execute(sql`with recent as (select * from experience.device_app_day where day > ${today}::date - 7 and day <= ${today}::date)
    select app, app_version, count(distinct device_id)::int as on_version, array_agg(distinct device_id) filter (where crashes > 0) as crashing, array_agg(distinct device_id) filter (where hangs > 0) as hanging,
      (min(day) filter (where crashes > 0 or hangs > 0))::text as first_seen, (select min(x.day)::text from experience.device_app_day x where x.app = r.app and x.app_version = r.app_version) as arrived,
      exists (select 1 from experience.device_app_day x where x.app = r.app and x.app_version <> r.app_version) as updated
    from recent r group by app, app_version`);
  return rows.flatMap((r) => {
    const crashing = (r.crashing as string[] | null) ?? [], hanging = (r.hanging as string[] | null) ?? [];
    const crash = crashing.length >= 2, devices = crash ? crashing : hanging;
    if (devices.length < 2) return [];
    const app = r.app as string, version = r.app_version as string;
    return [{ key: `app:${app}:${version}`, kind: "app" as const, subject: app, version, arrivedOn: r.arrived as string, ratio: null, firstSeen: r.first_seen as string, devices,
      title: crash ? `${app} crashes${r.updated ? " after update" : ""}` : `${app} keeps hanging`, cause: `${app} ${version}${r.updated ? ` arrived on ${short(r.arrived as string)}` : ` since ${short(r.first_seen as string)}`}`,
      confidence: Math.round((devices.length / Number(r.on_version)) * 100) / 100, fix: "remediation" as const }];
  });
}

async function hardware(tx: Tx, today: string): Promise<Found[]> {
  const latest = await tx.execute(sql`select distinct on (r.device_id) r.device_id, d.model, r.boot_seconds, r.battery_pct from experience.device_day r join experience.device d on d.id = r.device_id
    where r.day <= ${today}::date and r.day > ${today}::date - 7 order by r.device_id, r.day desc`);
  const boots = latest.map((r) => Number(r.boot_seconds)).sort((a, b) => a - b);
  const median = boots[Math.floor(boots.length / 2)] ?? 0;
  const out: Found[] = [];
  for (const model of new Set(latest.map((r) => r.model as string))) {
    const slow = latest.filter((r) => r.model === model && Number(r.boot_seconds) > SLOW_BOOT);
    const secs = slow.map((r) => Number(r.boot_seconds)).sort((a, b) => a - b)[Math.floor(slow.length / 2)];
    if (slow.length >= 2) out.push({ key: `boot:${model}`, kind: "boot", subject: model, version: null, arrivedOn: null, ratio: median ? Math.round((secs / median) * 10) / 10 : null, firstSeen: today,
      devices: slow.map((r) => r.device_id as string), title: `Slow boots on ${model.match(/\((\d{4})\)/)?.[1] ?? model} laptops`, cause: `Boot takes ${Math.floor(secs / 60)} min ${secs % 60} s on ${model}`, confidence: 0.9, fix: "ticket" });
  }
  const worn = latest.filter((r) => r.battery_pct !== null && Number(r.battery_pct) < 60);
  if (worn.length >= 2) out.push({ key: "battery", kind: "battery", subject: "Battery", version: null, arrivedOn: null, ratio: null, firstSeen: today, devices: worn.map((r) => r.device_id as string),
    title: `Battery health, ${worn.length} laptops`, cause: "Battery under 60% of its capacity", confidence: 0.9, fix: "ticket" });
  return out;
}

/** Records what was found (updating an open issue, closing one that's gone) and returns the issues. */
export async function findIssues(tx: Tx, tenantId: string, today: string) {
  const found = [...(await apps(tx, today)), ...(await hardware(tx, today))];
  for (const f of found) {
    const [dept] = await tx.execute(sql`select min(department) as d, count(distinct department)::int as n from experience.device where id = any(${uuids(f.devices)}::uuid[])`);
    const [i] = await tx.execute(sql`insert into experience.issue (tenant_id, key, kind, subject, version, title, cause, arrived_on, ratio, department, first_seen, devices, confidence, fix)
      values (${tenantId}, ${f.key}, ${f.kind}, ${f.subject}, ${f.version}, ${f.title}, ${f.cause}, ${f.arrivedOn}, ${f.ratio}, ${Number(dept.n) === 1 ? dept.d : null}, ${f.firstSeen}, ${f.devices.length}, ${f.confidence}, ${f.fix})
      on conflict (tenant_id, key) do update set title = excluded.title, cause = excluded.cause, ratio = excluded.ratio, department = excluded.department, devices = excluded.devices,
        confidence = excluded.confidence, first_seen = least(experience.issue.first_seen, excluded.first_seen), found_at = now() returning id, first_seen`);
    await tx.execute(sql`delete from experience.issue_device where issue_id = ${i.id}`);
    await tx.execute(sql`insert into experience.issue_device (tenant_id, issue_id, device_id) select ${tenantId}, ${i.id}, unnest(${uuids(f.devices)}::uuid[])`);
    Object.assign(f, { firstSeen: day(i.first_seen) });
  }
  await tx.execute(sql`update experience.issue set status = 'done' where status = 'open' and not (key = any(${`{${found.map((f) => JSON.stringify(f.key)).join(",")}}`}::text[]))`);
  return found;
}
