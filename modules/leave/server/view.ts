import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { balancesFor, type HalfDay } from "../contracts";
import { clashesFor, clashLabel } from "./clash";
import { asDay, holidaysIn } from "./days";
import { read, requestsIn, type Row } from "./read";
import { dateSpan } from "./rows";
import { chainFor, maskHealth, sees } from "./scope";

const shape = (v: Viewer, r: Row) => maskHealth(v, r, {
  id: r.id as string, person: r.person_name as string, type: r.type as string, startsOn: asDay(r.starts_on), endsOn: asDay(r.ends_on),
  dates: dateSpan(asDay(r.starts_on), asDay(r.ends_on), (r.half_day as HalfDay | null) ?? null), days: Number(r.days), status: r.status as string,
  note: (r.note as string | null) ?? null, medicalReason: (r.medical_reason as string | null) ?? null, certificateRef: (r.certificate_ref as string | null) ?? null,
  requestedBy: r.requested_by as string, decidedBy: (r.decided_by as string | null) ?? null, comment: (r.decision_comment as string | null) ?? null,
});

/** One request, if the viewer may see it, with medical fields masked per 002 and its clash check. */
export const getLeaveRequest = (v: Viewer, id: string) =>
  read(v, async (tx) => {
    const [r] = await tx.execute(sql`select * from leave.request where id::text = ${id}`);
    if (!r || !sees(v, r)) return null;
    const clashes = r.status === "pending" ? (await clashesFor(tx, asDay(r.starts_on), asDay(r.ends_on))).map(clashLabel) : [];
    return { ...shape(v, r), clashes, canDecide: chainFor(v, r) !== null };
  });

/** The viewer's own balances this year and their requests. */
export const myLeave = (v: Viewer) =>
  read(v, async (tx, today) => {
    const year = Number(today.slice(0, 4));
    const mine = (await requestsIn(tx, v, `${year}-01-01`, "9999-12-31", ["pending", "approved", "rejected", "cancelled"])).filter((r) => r.user_id === v.userId);
    const personId = (mine[0]?.person_id as string | undefined) ?? ((await tx.execute(sql`select person_id from leave.balance where user_id = ${v.userId} limit 1`))[0]?.person_id as string | undefined);
    return { year, balances: personId ? await balancesFor(tx, v, personId, year) : [], requests: mine.map((r) => shape(v, r)) };
  });

export const listHolidays = (v: Viewer, a: { country?: string; year?: number }) =>
  read(v, async (tx, today) => {
    const year = a.year ?? Number(today.slice(0, 4));
    return holidaysIn(tx, a.country?.toUpperCase() ?? null, `${year}-01-01`, `${year}-12-31`);
  });
