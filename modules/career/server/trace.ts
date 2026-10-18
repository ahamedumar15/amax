import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { searchAudit } from "@amax/core/server";
import type { Trace } from "../contracts";

const bare = (id: string) => id.replace(/^user:/, "");

async function namesOf(tx: Tx, ids: string[]) {
  const rows = ids.length ? await tx.execute(sql`select id::text as id, name from auth.user where id::text in (${sql.join(ids.map((i) => sql`${bare(i)}`), sql`, `)})`) : [];
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

/** Who recorded a live record and when: its oldest row in the 050 audit chain, named as the person or "agent for <person>". */
export async function traceOf(tx: Tx, tenantId: string, record: string, source: Trace["source"]): Promise<Trace> {
  const first = (await searchAudit(tx, tenantId, { query: record, chain: "audit", limit: 50 })).at(-1);
  const names = await namesOf(tx, first ? [first.actor, first.onBehalfOf].filter((x): x is string => !!x) : []);
  const name = (id: string | null) => (id ? names.get(bare(id)) ?? id : null);
  return { recordedBy: name(first?.actor ?? null), recordedFor: name(first?.onBehalfOf ?? null), recordedAt: first?.at ?? null, approvedBy: null, approvedAt: null, source,
    traceRef: first?.traceId ? first.traceId.slice(0, 8) : first ? `audit ${first.seq}` : null };
}
