import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { personMonthTotals } from "@amax/allocations/contracts";
import type { PersonUtilisation } from "../contracts";
import { addDays, monthEnd, type Range } from "./days";
import { personFigures, workdays } from "./figures";
import type { Inputs } from "./inputs";
import { installed } from "./read";

export type AvailabilityRow = {
  userId: string; name: string; initials: string; workdays: number | null; leaveLabel: string | null;
  availableHours: number | null; allocated: number | null; freeHours: number | null;
};
export type Availability = { range: Range | null; allocationsOn: boolean; rows: AvailabilityRow[] };

// Allocations reads through hr's reach too, and these people are already within the viewer's, so a person with no row has nothing booked.
async function allocatedIn(tx: Tx, v: Viewer, personIds: string[], month: string) {
  if (!(await installed(tx, "allocations.allocation"))) return null;
  const { rows } = await personMonthTotals(tx, v, { from: `${month}-01`, to: `${month}-01`, personIds });
  return new Map(personIds.map((id) => [id, rows.find((r) => r.personId === id)?.percent ?? 0]));
}

/** The rest of the month after today: working days less holidays and approved leave, what allocations has booked, and what's free. */
export async function availabilityOf(tx: Tx, v: Viewer, inputs: Inputs, rows: PersonUtilisation[], month: string, today: string): Promise<Availability> {
  const from = addDays(today, 1) > `${month}-01` ? addDays(today, 1) : `${month}-01`;
  const range = from <= monthEnd(month) ? { from, to: monthEnd(month) } : null;
  const allocated = await allocatedIn(tx, v, rows.map((r) => r.personId), month);
  const people = inputs.people.filter((p) => rows.some((r) => r.userId === p.userId));
  return {
    range, allocationsOn: allocated !== null,
    rows: people.map((p) => {
      const f = range ? personFigures(p, inputs, range) : null;
      const share = allocated?.get(p.personId) ?? null;
      const free = f?.availableHours == null || share === null ? null : Math.max(0, Math.round((f.availableHours - (share / 100) * f.contractedHours) * 10) / 10);
      const days = range && f?.leaveDays != null ? workdays(p, inputs, range).length - f.leaveDays : null;
      return { userId: p.userId, name: p.name, initials: p.initials, workdays: days,
        leaveLabel: f?.leaveLabel ?? null, availableHours: f?.availableHours ?? null, allocated: share, freeHours: free };
    }),
  };
}
