import type { Viewer } from "@amax/auth";
import { gridFor } from "./grid";

export type RowRef = { person: string; projectId?: string; work?: string };

export async function getAllocation(v: Viewer, ref: RowRef, today?: Date) {
  const grid = await gridFor(v, { everyone: true, today });
  const p = grid.people.find((x) => x.employeeNo === ref.person || x.name.toLowerCase() === ref.person.toLowerCase());
  if (!p) return null;
  const months = grid.months.map((m) => m.month);
  if (!ref.projectId && !ref.work) return { person: p.name, employeeNo: p.employeeNo, months, totals: p.totals, capacity: p.capacity };
  const line = p.lines.find((l) => (ref.projectId ? l.projectId === ref.projectId : !l.projectId && l.label === ref.work));
  return line ? { person: p.name, employeeNo: p.employeeNo, months, project: line.label, manages: line.manages, percents: line.percents, capacity: p.capacity } : null;
}
