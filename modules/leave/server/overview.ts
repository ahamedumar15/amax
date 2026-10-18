import type { Viewer } from "@amax/auth";
import { teamCalendar, monthOf, type Calendar } from "./calendar";
import { addDays, holidaysIn, type Holiday } from "./days";
import { waitingFor, type PendingRow } from "./pending";
import { homeEntity, labelsOf, read } from "./read";
import { statsFor, type Stats } from "./stats";

export type Overview = { today: string; labels: Record<string, string>; stats: Stats; waiting: PendingRow[]; calendar: Calendar; nextHoliday: Holiday | null };

/** Everything the Leave screen shows, in the viewer's data scope. */
export const leaveOverview = (v: Viewer, month?: string) =>
  read(v, async (tx, today): Promise<Overview> => {
    const labels = await labelsOf(tx);
    const country = (await homeEntity(tx, v)).country;
    const [next] = country ? await holidaysIn(tx, country, today, addDays(today, 366)) : [];
    return {
      today, labels: Object.fromEntries(labels), stats: await statsFor(tx, v, today), waiting: await waitingFor(tx, v, today, labels),
      calendar: await teamCalendar(tx, v, monthOf(month, today), today), nextHoliday: next ?? null,
    };
  });

/** One calendar month, or one person's row of it (a pinned calendar row). */
export const leaveCalendar = (v: Viewer, month?: string, userId?: string) =>
  read(v, async (tx, today) => {
    const c = await teamCalendar(tx, v, monthOf(month, today), today, userId);
    return userId && !c.rows.length ? null : c;
  });
