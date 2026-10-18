import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "../service";
import { open, seal } from "../secrets/crypto";
import { dataKeyFor } from "../secrets/runtime";
import { BackupError, TARGETS } from "./catalog";
import { backupConfig } from "./config";
import { regionStorage } from "./snapshot";
import { tableRows, tenantTables } from "./tables";
import { tar } from "./tar";

const encoder = new TextEncoder();
const json = (v: unknown) => encoder.encode(JSON.stringify(v, null, 2));
const aad = (tenantId: string, id: string) => `amax-export:${tenantId}:${id}`;
export const exportKey = (tenantId: string, id: string) => `exports/${tenantId}/${id}.tar.sealed`;

/** The tenant's files: today the write-once audit, trace and AI-usage exports (050), one set per day. */
async function fileEntries(tx: Tx, tenantId: string) {
  const files = backupConfig().files();
  if (!files) return [];
  const days = await tx.execute(sql`select distinct resource_id as day from core.audit_event where action = 'core.audit.export' and resource_id is not null order by 1`);
  const out: { name: string; body: Uint8Array }[] = [];
  for (const key of days.flatMap((d) => ["audit", "trace", "ai-call"].map((p) => `${p}/${tenantId}/${String(d.day).replaceAll("-", "/")}.ndjson`))) {
    const body = await files.get(key);
    if (body) out.push({ name: `files/${key}`, body });
  }
  return out;
}

/** 032/060: what the export says about privacy. Erased people are already anonymised in every row. */
async function privacyState(tx: Tx) {
  const [r] = await tx.execute(sql`select
    (select count(*)::int from privacy.request where kind = 'erasure' and status = 'completed') as erased,
    (select count(*)::int from privacy.request where kind = 'erasure' and status in ('open', 'approved')) as pending,
    (select count(*)::int from privacy.legal_hold where released_at is null) as holds`);
  return { erasedPeople: Number(r.erased), erasureRequestsOpen: Number(r.pending), legalHoldsActive: Number(r.holds), note: "People erased under 032 appear anonymised; credentials, tokens and connector secrets are never exported." };
}

async function moduleEntries(tx: Tx) {
  const modules: Record<string, Record<string, unknown[]>> = {};
  for (const t of await tenantTables(tx, "export")) (modules[t.schema] ??= {})[t.table] = await tableRows(tx, t, "export");
  const counts = Object.fromEntries(Object.entries(modules).map(([m, ts]) => [m, Object.fromEntries(Object.entries(ts).map(([t, rows]) => [t, rows.length]))]));
  return { counts, entries: Object.entries(modules).map(([m, ts]) => ({ name: `modules/${m}.json`, body: json(ts) })) };
}

/** AC-4: builds the approved export (JSON per module plus files), sealed at rest with the data key. */
export const buildExport = defineService({
  name: "backup.export.build",
  action: "backup:snapshot",
  resource: "backup.export",
  input: z.object({ id: z.uuid() }),
  async run(tx, input, ctx) {
    const [e] = await tx.execute(sql`select status, approved_by from backup.export where id = ${input.id} for update`);
    if (e?.status !== "building" || !e.approved_by) throw new BackupError(`tenant export ${input.id} isn't approved for building`);
    const [{ counts, entries }, files, privacy] = [await moduleEntries(tx), await fileEntries(tx, ctx.tenantId), await privacyState(tx)];
    const manifest = { tenantId: ctx.tenantId, exportId: input.id, builtAt: new Date().toISOString(), modules: counts, files: files.map((f) => f.name), privacy };
    const body = tar([{ name: "manifest.json", body: json(manifest) }, ...entries, ...files]);
    const { storage } = await regionStorage(tx);
    const sealed = seal(await dataKeyFor(tx, ctx.tenantId), body, aad(ctx.tenantId, input.id));
    await storage.put(exportKey(ctx.tenantId, input.id), sealed);
    await tx.execute(sql`update backup.export set status = 'ready', ready_at = now(), expires_at = now() + make_interval(hours => ${TARGETS.linkHours}), storage_key = ${exportKey(ctx.tenantId, input.id)},
      modules = ${JSON.stringify(counts)}::jsonb, files = ${files.length}, bytes = ${body.length}, privacy = ${JSON.stringify(privacy)}::jsonb where id = ${input.id}`);
    const after = { status: "ready", modules: Object.keys(counts).length, files: files.length, bytes: body.length };
    return { result: { id: input.id, ...after }, resourceId: input.id, after, events: [{ name: "backup.export.ready", payload: { id: input.id } }] };
  },
});

export const failExport = defineService({
  name: "backup.export.fail",
  action: "backup:snapshot",
  resource: "backup.export",
  input: z.object({ id: z.uuid(), error: z.string().max(500) }),
  async run(tx, input) {
    await tx.execute(sql`update backup.export set status = 'failed', error = ${input.error} where id = ${input.id} and status = 'building'`);
    return { result: { id: input.id, status: "failed" }, resourceId: input.id, after: { status: "failed" } };
  },
});

/** The plain archive behind a valid link, opened with the tenant's data key. */
export async function readExport(tx: Tx, tenantId: string, id: string, storageKey: string) {
  const { storage } = await regionStorage(tx);
  const sealed = await storage.get(storageKey);
  if (!sealed) throw new BackupError("this export's file is gone");
  return open(await dataKeyFor(tx, tenantId), new TextDecoder().decode(sealed), aad(tenantId, id));
}
