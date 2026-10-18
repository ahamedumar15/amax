import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { HalfDay } from "../contracts";
import { clashesFor, clashLabel } from "./clash";
import { requestsIn, type Row } from "./read";
import { dateSpan } from "./rows";
import { chainFor } from "./scope";

export type PendingRow = { id: string; userId: string | null; personName: string; type: string; label: string; startsOn: string; endsOn: string; dates: string; days: number; clashes: string[] };

/** Pending requests the viewer may decide, each with its release clash check. */
export async function waitingFor(tx: Tx, v: Viewer, today: string, labels: Map<string, string>): Promise<PendingRow[]> {
  const rows = (await requestsIn(tx, v, "1900-01-01", "9999-12-31", ["pending"])).filter((r) => chainFor(v, r) !== null);
  return Promise.all(rows.map(async (r: Row) => {
    const from = r.starts_on as string, to = r.ends_on as string;
    return {
      id: r.id as string, userId: (r.user_id as string | null) ?? null, personName: r.person_name as string, type: r.type as string, label: labels.get(r.type as string) ?? (r.type as string),
      startsOn: from, endsOn: to, dates: dateSpan(from, to, (r.half_day as HalfDay | null) ?? null), days: r.days as number,
      clashes: to < today ? [] : (await clashesFor(tx, from, to)).map(clashLabel),
    };
  }));
}
