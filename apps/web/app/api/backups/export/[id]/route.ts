import { z } from "zod";
import { can } from "@amax/auth";
import { withTenant } from "@amax/db";
import { BACKUP_MANAGE, BackupError, linkValid, readExport, recordDownload } from "@amax/core/backup";
import { ctxFor } from "../../../../../lib/admin/tool";
import { getDb } from "../../../../../lib/server";
import { getViewer } from "../../../../../lib/viewer";

export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid() });
const Query = z.object({ exp: z.coerce.number().int().positive(), sig: z.string().min(20).max(100) });
const refuse = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// 034 AC-4: the signed link works for 24 hours, and only for a signed-in Admin of the same tenant.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const db = getDb();
  if (!viewer || !db || !can(viewer, BACKUP_MANAGE)) return refuse(404, "Not found");
  const p = Params.safeParse(await params);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success || !q.success || !linkValid(viewer.tenantId, p.data.id, q.data.exp, q.data.sig)) return refuse(403, "This link is not valid or has expired. Ask amax for a new one.");
  try {
    const { storageKey } = await recordDownload(ctxFor(viewer, "ui"), { id: p.data.id });
    const body = await withTenant(db, viewer.tenantId, (tx) => readExport(tx, viewer.tenantId, p.data.id, storageKey));
    return new Response(new Uint8Array(body), { headers: { "content-type": "application/x-tar", "content-disposition": `attachment; filename="amax-export-${p.data.id.slice(0, 8)}.tar"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BackupError) return refuse(410, e.message);
    throw e;
  }
}
