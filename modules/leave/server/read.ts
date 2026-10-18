import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { asDay, todayOf } from "./days";
import { sees } from "./scope";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx, today: string) => Promise<T>) => {
  if (!can(viewer, "leave:read")) throw new ForbiddenError("leave:read", "leave");
  return withTenant(getRuntime().db, viewer.tenantId, async (tx) => fn(tx, await todayOf(tx)));
};

export type Row = Record<string, unknown>;

/** Pending and approved requests touching a date range, limited to the ones the viewer may see. */
export async function requestsIn(tx: Tx, v: Viewer, from: string, to: string, statuses = ["pending", "approved"]): Promise<Row[]> {
  const rows = await tx.execute(sql`select * from leave.request where starts_on <= ${to} and ends_on >= ${from}
    and status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)}) order by starts_on, person_name`);
  return rows.filter((r) => sees(v, r)).map((r) => ({ ...r, starts_on: asDay(r.starts_on), ends_on: asDay(r.ends_on), days: Number(r.days) }));
}

/** The viewer's own legal entity and its country (auth.user), for holidays and the unused-leave ticket. */
export async function homeEntity(tx: Tx, v: Viewer): Promise<{ id: string | null; country: string | null }> {
  const [r] = await tx.execute(sql`select e.id, e.country from auth.user u left join core.legal_entity e on e.id = u.legal_entity_id where u.id = ${v.userId}`);
  return { id: (r?.id as string | null) ?? null, country: r?.country ? String(r.country) : null };
}

export async function labelsOf(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.execute(sql`select distinct on (type) type, label from leave.policy order by type, pack`);
  return new Map(rows.map((r) => [r.type as string, r.label as string]));
}
