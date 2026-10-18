import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { EgressError } from "@amax/api/egress";
import { contextFor, getRuntime } from "@amax/core/server";
import { SecretNotConfiguredError } from "@amax/core/secrets";
import { SCAN_JOB, type SourceKind } from "../contracts";
import { excerptOf, safeLink } from "./excerpt";
import { readerFor, type RawMessage, type SourceToRead } from "./reader";
import { failScan, messageRef, recordScan } from "./record";
import { GraphError } from "./wire";

export type ScanResult = { ok: boolean; summary: string; findIds: string[] };
const KNOWN = [GraphError, EgressError, SecretNotConfiguredError];
const failureOf = (e: unknown) => (KNOWN.some((k) => e instanceof k) ? (e as Error).message.replace(/^secrets: /, "") : "couldn't reach Microsoft Graph");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// 025 AC-1: nothing is read without recorded consent, and only the allow-listed sources are asked.
// Whatever comes back for a source that wasn't asked about, or from before it was allowed, is dropped.
async function plan(tenantId: string) {
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const [c] = await tx.execute(sql`select granted, sandbox from inbox_agent.consent`);
    const rows = await tx.execute(sql`select id, kind, address, label, coalesce(read_until, allowed_at) as since from inbox_agent.source where removed_at is null order by allowed_at`);
    const sources: SourceToRead[] = rows.map((r) => ({ id: r.id as string, kind: r.kind as SourceKind, address: r.address as string, label: r.label as string, since: new Date(r.since as string).toISOString() }));
    return { consented: c?.granted === true, sandbox: c?.sandbox === true, sources };
  });
}

const allowed = (sources: SourceToRead[]) => {
  const since = new Map(sources.map((s) => [s.id, Date.parse(s.since)]));
  return (m: RawMessage) => since.has(m.sourceId) && Date.parse(m.at) > since.get(m.sourceId)!;
};

/** One scan for a tenant: read outside any transaction, then record only excerpts and links. */
export async function readInboxes(tenantId: string): Promise<ScanResult> {
  const ctx = contextFor.job(tenantId, SCAN_JOB);
  const p = await plan(tenantId);
  if (!p.consented) return { ok: true, summary: "Skipped: no Entra admin consent is recorded", findIds: [] };
  if (!p.sources.length) return { ok: true, summary: "Skipped: no mailbox or channel is allowed", findIds: [] };
  const startedAt = new Date().toISOString();
  let raw: RawMessage[];
  try {
    raw = await readerFor(ctx, p.sandbox)(p.sources);
  } catch (e) {
    const failure = failureOf(e);
    await failScan(ctx, { startedAt, failure });
    return { ok: false, summary: `Failed: ${failure}`, findIds: [] };
  }
  const messages = raw.filter(allowed(p.sources)).map((m) => ({ sourceId: m.sourceId, ref: messageRef(m.sourceId, m.id), at: new Date(m.at).toISOString(), excerpt: excerptOf(m.body), link: safeLink(m.link) }))
    .filter((m) => m.excerpt.length > 0);
  const out = await recordScan(ctx, { startedAt, messages, sources: p.sources.map((s) => s.id) });
  return { ok: true, summary: `Read ${plural(out.findIds.length, "new message")} from ${plural(p.sources.length, "source")}`, findIds: out.findIds };
}
