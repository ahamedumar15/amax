import type { Tx } from "@amax/db";
import { canEver, type Viewer } from "@amax/auth";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { certificationsOf, expiringCertifications } from "@amax/learning/contracts";
import { listOpportunityRefs, pipelineTotals } from "@amax/presales/contracts";
import { utilisation } from "@amax/reports/contracts";
import type { InsightSource } from "../contracts";
import { addDays, monthEnd, monthsBack } from "./days";
import { installed } from "./read";

// Live figures, read through the other modules' contracts as the viewer (AC-2): each carries the
// source it comes from and a link to it (AC-1). A figure whose module isn't installed is null.
export type Figure<T> = { value: T; sources: InsightSource[] } | null;
const HR: InsightSource = { label: "People records in amax", evidenceRef: "/people" };

const onRoll = (people: PersonRef[], day: string) => people.filter((p) => p.joinedOn && p.joinedOn <= day && (!p.leftOn || p.leftOn > day)).length;

/** Headcount at each month end this year, growth since Jan 1, and 12-month attrition: leavers ÷ the average headcount on the first of each month. */
export async function headcount(tx: Tx, v: Viewer, today: string) {
  const people = await listPeople(tx, v, { on: today });
  const months = Array.from({ length: Number(today.slice(5, 7)) }, (_, i) => `${today.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`);
  const series = months.map((m) => onRoll(people, monthEnd(m) < today ? monthEnd(m) : today));
  const start = onRoll(people, addDays(`${today.slice(0, 4)}-01-01`, -1));
  const firsts = monthsBack(today, 12).map((m) => onRoll(people, `${m}-01`));
  const average = firsts.reduce((n, x) => n + x, 0) / firsts.length;
  const leavers = people.filter((p) => p.leftOn && p.leftOn > addDays(today, -365) && p.leftOn <= today).length;
  return {
    value: { months, series, start, now: series.at(-1) ?? 0, growth: start ? Math.round(((series.at(-1)! - start) / start) * 1000) / 10 : null,
      attrition: average ? Math.round((leavers / average) * 1000) / 10 : null, leavers, ids: people.filter((p) => p.status === "active").map((p) => p.id) },
    sources: [HR],
  };
}

/** Certifications still valid today of the people the viewer may see, and those that lapse in the next 90 days. */
export async function certifications(tx: Tx, ids: string[], today: string): Promise<Figure<{ valid: number; expiring: number }>> {
  if (!(await installed(tx, "learning.certification"))) return null;
  const seen = new Set(ids);
  const held = (await Promise.all(ids.map((id) => certificationsOf(tx, id)))).flat().filter((c) => !c.expiresOn || c.expiresOn >= today);
  const expiring = (await expiringCertifications(tx, today, addDays(today, 90))).filter((c) => seen.has(c.personId));
  return { value: { valid: held.length, expiring: expiring.length }, sources: [{ label: "Certifications in Learning", evidenceRef: "/learning" }] };
}

/** The open pipeline and the share of closed deals won, when the viewer may see presales. */
export async function pipeline(tx: Tx, v: Viewer): Promise<Figure<{ open: string; weighted: string; count: number; won: number; lost: number }>> {
  if (!canEver(v, "presales:read")) return null;
  const [totals, opps] = [await pipelineTotals(tx), await listOpportunityRefs(tx)];
  return {
    value: { open: totals.open.amount, weighted: totals.weighted.amount, count: totals.count, won: opps.filter((o) => o.stage === "won").length, lost: opps.filter((o) => o.stage === "lost").length },
    sources: [{ label: "The presales board", evidenceRef: "/presales" }],
  };
}

/** Team utilisation this month to date, when reports is installed and the viewer may read it. */
export async function teamUtilisation(tx: Tx, v: Viewer, today: string): Promise<Figure<number | null>> {
  if (!(await installed(tx, "reports.logged_hours")) || !canEver(v, "reports:read")) return null;
  const { team } = await utilisation(tx, v, { from: `${today.slice(0, 7)}-01`, to: today });
  return { value: team.utilisation, sources: [{ label: "Utilisation in Reports", evidenceRef: "/reports" }] };
}
