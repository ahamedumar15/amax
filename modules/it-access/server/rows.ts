import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { day, daysAgo, today } from "./read";

/** A seat unused this long is the licence agent's to propose removing (fixtures.md: "unused for 60 days"). */
export const IDLE_DAYS = 60;
export const ACTIVE_DAYS = 30;

export type ProductRow = {
  id: string; key: string; name: string; source: string; logo: string; color: string; seats: number; assigned: number; active30: number; idle: number;
  idleRule: "idle" | "never-used"; unusedNote: string | null; monthlyUsd: number; seatUsd: number; unusedUsd: number; syncedAt: string | null;
};

export async function productRows(tx: Tx, productId?: string, now = new Date()): Promise<ProductRow[]> {
  const idle = daysAgo(IDLE_DAYS, now), active = daysAgo(ACTIVE_DAYS, now);
  const rows = await tx.execute(sql`select p.*,
      count(s.id)::int as assigned,
      count(s.id) filter (where s.last_active_on >= ${active})::int as active30,
      count(s.id) filter (where s.last_active_on is null or s.last_active_on < ${idle})::int as idle
    from it_access.product p left join it_access.seat s on s.product_id = p.id and s.removed_on is null
    ${productId ? sql`where p.id = ${productId}` : sql``} group by p.id order by p.monthly_usd desc, p.name`);
  return rows.map((r) => ({
    id: r.id as string, key: r.key as string, name: r.name as string, source: r.source as string, logo: r.logo as string, color: r.color as string,
    seats: Number(r.seats), assigned: Number(r.assigned), active30: Number(r.active30), idle: Number(r.idle), idleRule: r.idle_rule as ProductRow["idleRule"],
    unusedNote: (r.unused_scope as string | null) ?? null, monthlyUsd: Number(r.monthly_usd), seatUsd: Number(r.seat_usd), unusedUsd: Number(r.idle) * Number(r.seat_usd),
    syncedAt: r.synced_at ? new Date(r.synced_at as string).toISOString() : null,
  }));
}

export type PersonRow = {
  accountId: string; personId: string | null; name: string; kind: "employee" | "contractor"; entraGroups: number; licences: number; devices: number;
  adminRoles: string[]; status: "active" | "left"; leftOn: string | null; expiresOn: string | null; reviewedOn: string | null;
};

const PEOPLE = sql`select a.*, (select count(*) from it_access.seat s where s.account_id = a.id and s.removed_on is null)::int as licences,
    (select count(*) from it_access.device d where d.account_id = a.id)::int as devices from it_access.account a`;

export async function personRows(tx: Tx, accountId?: string): Promise<PersonRow[]> {
  const rows = await tx.execute(sql`${PEOPLE} ${accountId ? sql`where a.id = ${accountId}` : sql``} order by a.display_name`);
  return rows.map((r) => ({
    accountId: r.id as string, personId: (r.person_id as string | null) ?? null, name: r.display_name as string, kind: r.kind as PersonRow["kind"],
    entraGroups: Number(r.entra_groups), licences: Number(r.licences), devices: Number(r.devices), adminRoles: (r.admin_roles as string[]) ?? [],
    status: r.status === "left" || (r.left_on && day(r.left_on)! <= today()) ? "left" : "active", leftOn: day(r.left_on), expiresOn: day(r.expires_on), reviewedOn: day(r.reviewed_on),
  }));
}

export type DeviceStats = { total: number; compliant: number; needsUpdate: number; unassigned: number };
export async function deviceStats(tx: Tx): Promise<DeviceStats> {
  const [r] = await tx.execute(sql`select count(*)::int as total, count(*) filter (where needs_update)::int as needs_update,
      count(*) filter (where account_id is null)::int as unassigned, count(*) filter (where compliant and not needs_update and account_id is not null)::int as compliant from it_access.device`);
  return { total: Number(r.total), compliant: Number(r.compliant), needsUpdate: Number(r.needs_update), unassigned: Number(r.unassigned) };
}
