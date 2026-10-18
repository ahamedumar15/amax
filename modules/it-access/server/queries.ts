import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { day, daysAgo, iso, priced, read } from "./read";
import { IDLE_DAYS, personRows, productRows } from "./rows";

/** One product: seats, use, spend (Admin only), and the idle seats the licence agent would remove. */
export const getProduct = (v: Viewer, productId: string) => read(v, async (tx) => {
  const [p] = await productRows(tx, productId);
  if (!p) return null;
  const idle = await tx.execute(sql`select s.id, a.display_name, s.last_active_on from it_access.seat s join it_access.account a on a.id = s.account_id
    where s.product_id = ${productId} and s.removed_on is null and (s.last_active_on is null or s.last_active_on < ${daysAgo(IDLE_DAYS)}) order by s.last_active_on nulls first, a.display_name`);
  return priced(v, { ...p, idleSeats: idle.map((s) => ({ seatId: s.id as string, name: s.display_name as string, lastActiveOn: day(s.last_active_on) })) });
});

/** One person's or contractor's access: groups, admin roles, seats, devices, and the changes IT approved. */
export const getAccount = (v: Viewer, accountId: string) => read(v, async (tx) => {
  const [a] = await personRows(tx, accountId);
  if (!a) return null;
  const seats = await tx.execute(sql`select s.id, p.name, s.assigned_on, s.last_active_on from it_access.seat s join it_access.product p on p.id = s.product_id
    where s.account_id = ${accountId} and s.removed_on is null order by p.name`);
  const devices = await tx.execute(sql`select name, os, compliant, needs_update from it_access.device where account_id = ${accountId} order by name`);
  const changes = await tx.execute(sql`select id, action, status, effective_on, approved_by, applied_at, outcome from it_access.change where account_id = ${accountId} order by approved_at desc limit 20`);
  return {
    ...a,
    seats: seats.map((s) => ({ seatId: s.id as string, product: s.name as string, assignedOn: day(s.assigned_on), lastActiveOn: day(s.last_active_on) })),
    deviceList: devices.map((d) => ({ name: d.name as string, os: d.os as string, compliant: Boolean(d.compliant), needsUpdate: Boolean(d.needs_update) })),
    changes: changes.map((c) => ({ id: c.id as string, action: c.action as string, status: c.status as string, effectiveOn: day(c.effective_on), approvedBy: c.approved_by as string, appliedAt: iso(c.applied_at), outcome: (c.outcome as string | null) ?? null })),
  };
});

/** The sync runs, newest first, and whether the write registration is on (AC-1). */
export const syncStatus = (v: Viewer) => read(v, async (tx) => {
  const runs = await tx.execute(sql`select source, status, summary, finished_at from it_access.sync_run order by finished_at desc limit 12`);
  const [c] = await tx.execute(sql`select enabled, scopes, consented_by, consented_at from it_access.write_consent`);
  return {
    runs: runs.map((r) => ({ source: r.source as string, status: r.status as string, summary: r.summary as string, finishedAt: iso(r.finished_at) })),
    write: { enabled: Boolean(c?.enabled), scopes: (c?.scopes as string[]) ?? [], by: (c?.consented_by as string | null) ?? null, at: iso(c?.consented_at) },
  };
});
