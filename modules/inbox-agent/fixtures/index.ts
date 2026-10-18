import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { EVENTS, SCAN_JOB } from "../contracts";
import { installedRoutes } from "../routes";
import { excerptOf, safeLink } from "../server/excerpt";
import { messageRef, writeScan } from "../server/record";
import { sandboxReader } from "../server/sandbox";
import { writeTriage } from "../server/triage";
import { DEMO_SOURCES, DEMO_TRIAGE } from "./data";

const userRef = async (tx: Tx, key: string) => ((await tx.execute(sql`select 'user:' || id::text as id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0]?.id as string | undefined) ?? `demo:${key}`;

async function seedSources(tx: Tx, tenantId: string) {
  const admin = await userRef(tx, "maya");
  await tx.execute(sql`insert into inbox_agent.consent (tenant_id, sandbox, granted, recorded_by, recorded_at) values (${tenantId}, true, true, ${admin}, now() - interval '21 days')`);
  for (const s of DEMO_SOURCES) {
    await tx.execute(sql`insert into inbox_agent.source (tenant_id, kind, address, label, acts_for, allowed_by, allowed_at, read_until)
      values (${tenantId}, ${s.kind}, ${s.address}, ${s.label}, ${await userRef(tx, s.actsFor)}, ${admin}, now() - interval '20 days', '2026-10-14T00:00:00Z')`);
  }
  return (await tx.execute(sql`select id, kind, address, label, read_until from inbox_agent.source order by allowed_at, label`))
    .map((r) => ({ id: r.id as string, kind: r.kind as "mailbox" | "channel", address: r.address as string, label: r.label as string, since: new Date(r.read_until as string).toISOString() }));
}

// The demo tenant reads the sandbox Microsoft 365 (fictional): two quiet scans and a failed one, then
// the scan 12 minutes ago that read four messages, triaged as the agent would. The triaged events
// make the 006 suggestions on the next job tick, as in the app.
export const inboxFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [done] = await tx.execute(sql`select 1 from inbox_agent.consent`);
  if (done) return;
  const sources = await seedSources(tx, tenantId);
  const ctx = contextFor.job(tenantId, SCAN_JOB);
  for (const ago of [192, 132]) await writeScan(tx, ctx, { startedAt: new Date(Date.now() - ago * 60_000).toISOString(), messages: [], sources: [] });
  await tx.execute(sql`insert into inbox_agent.scan (tenant_id, started_at, finished_at, status, failure, started_by)
    values (${tenantId}, now() - interval '72 minutes', now() - interval '71 minutes', 'failed', 'Microsoft Graph answered 503', ${`job:${SCAN_JOB}`})`);
  const raw = await sandboxReader(sources);
  const messages = raw.map((m) => ({ sourceId: m.sourceId, ref: messageRef(m.sourceId, m.id), at: new Date(m.at).toISOString(), excerpt: excerptOf(m.body), link: safeLink(m.link) }));
  const { findIds } = await writeScan(tx, ctx, { startedAt: new Date(Date.now() - 12 * 60_000).toISOString(), messages, sources: sources.map((s) => s.id) });
  const on = new Set((await installedRoutes(tx)).map((r) => r.type));
  for (const [i, findId] of findIds.entries()) {
    const demo = DEMO_TRIAGE[raw[i].id] ?? null;
    const t = demo && on.has(demo.recordType) ? demo : null;
    await writeTriage(tx, { findId, recordType: t?.recordType ?? null, fields: t?.fields ?? {}, confidence: t?.confidence ?? null });
    await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.triaged}, ${JSON.stringify({ findId, recordType: t?.recordType ?? null })}::jsonb)`);
  }
  await tx.execute(sql`update inbox_agent.scan set finished_at = started_at + interval '41 seconds' where finished_at > now() - interval '1 minute'`);
};
