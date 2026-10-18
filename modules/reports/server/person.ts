import type { Viewer } from "@amax/auth";
import { getReport } from "./view";

/** One person's utilisation and availability for a month, or null when the viewer may not see them. */
export async function getPersonUtilisation(v: Viewer, userId: string, month?: string) {
  const r = await getReport(v, month);
  const row = r.rows.find((x) => x.userId === userId);
  if (!row) return null;
  return { month: r.month, monthName: r.monthName, from: r.range.from, to: r.range.to, target: r.target, ...row, availability: r.availability.rows.find((x) => x.userId === userId) ?? null };
}
