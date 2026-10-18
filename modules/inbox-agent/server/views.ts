import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { nextFire } from "@amax/workflows/define";
import { SCAN_CRON } from "../contracts";
import { installedRoutes } from "../routes";
import { iso, ownerOf, toFind, toScan, toSource, type FindRow } from "./rows";

export const READ = "inbox-agent:read";
export const RECENT_SCANS = 8;
export const SCAN = sql`select c.*, (select count(*) from inbox_agent.find f where f.scan_id = c.id and f.record_type is not null)::int as suggested from inbox_agent.scan c`;
const SOURCE = sql`select s.*, (select count(*) from inbox_agent.find f where f.source_id = s.id)::int as finds,
  (select u.name from auth.user u where 'user:' || u.id::text = s.acts_for) as acts_for_name from inbox_agent.source s`;
const FIND = sql`select f.*, s.kind, s.label from inbox_agent.find f join inbox_agent.source s on s.id = f.source_id`;

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, READ)) throw new ForbiddenError(READ, "inbox-agent");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

// A find shows only to the person it belongs to (Admin: anyone's), who could add it in its owning
// module, and only while that module is installed.
async function visible(tx: Tx, viewer: Viewer, finds: FindRow[]) {
  const on = new Set((await installedRoutes(tx)).map((r) => r.type));
  return finds.filter((f) => f.route && on.has(f.route.type) && can(viewer, "inbox-agent:decide", { ownerUserId: ownerOf(f.actsFor) }) && canEver(viewer, f.route.permission));
}

/** The agent at a glance: consent, open finds first, the allow-list and the latest scans. */
export const inboxOverview = (viewer: Viewer) => read(viewer, async (tx) => {
  const [c] = await tx.execute(sql`select * from inbox_agent.consent`);
  const finds = await visible(tx, viewer, (await tx.execute(sql`${FIND} where f.status = 'suggested' and f.expires_at >= now() order by f.received_at desc`)).map(toFind));
  const sources = (await tx.execute(sql`${SOURCE} where s.removed_at is null order by s.kind, s.label`)).map(toSource);
  const scans = (await tx.execute(sql`${SCAN} order by c.finished_at desc limit ${RECENT_SCANS}`)).map(toScan);
  const consent = c ? { granted: c.granted === true, sandbox: c.sandbox === true, entraTenantId: (c.entra_tenant_id as string | null) ?? null, recordedBy: c.recorded_by as string, recordedAt: iso(c.recorded_at)! } : null;
  return { consent, finds, sources, scans, lastScan: scans[0] ?? null, nextScanAt: consent?.granted ? nextFire(SCAN_CRON, "UTC").toISOString() : null, every: "Hourly" };
});
export type Overview = Awaited<ReturnType<typeof inboxOverview>>;

export const getFind = (viewer: Viewer, findId: string): Promise<FindRow | null> => read(viewer, async (tx) => {
  const [f] = (await visible(tx, viewer, (await tx.execute(sql`${FIND} where f.id = ${findId}`)).map(toFind)));
  return f ?? null;
});

export const getSource = (viewer: Viewer, sourceId: string) => read(viewer, async (tx) => {
  const [s] = await tx.execute(sql`${SOURCE} where s.id = ${sourceId}`);
  return s ? { ...toSource(s), removedAt: iso(s.removed_at) } : null;
});

export const getScan = (viewer: Viewer, scanId: string) => read(viewer, async (tx) => {
  const [s] = await tx.execute(sql`${SCAN} where c.id = ${scanId}`);
  return s ? toScan(s) : null;
});
