import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listEmploymentPeriods, type EmploymentPeriod } from "@amax/hr/contracts";
import { personMonthTotals } from "../contracts";
import { fteIn, isForecast, windowMonths } from "./months";
import { readAlloc } from "./read";

export type MonthPoint = { month: string; forecast: boolean; capacity: number; demand: number; bench: { personId: string; skill: string }[] };
export type Forecast = { team: string; teams: string[]; months: MonthPoint[]; leaveAdjusted: false };

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function teamMembers(tx: Tx, team: string) {
  return (await tx.execute(sql`select person_id, coalesce(skill, 'Other') as skill from allocations.member where team = ${team}`)).map((r) => ({ personId: r.person_id as string, skill: r.skill as string }));
}

const byPerson = (periods: EmploymentPeriod[]) => periods.reduce((m, p) => m.set(p.personId, [...(m.get(p.personId) ?? []), p]), new Map<string, EmploymentPeriod[]>());

/**
 * Capacity is the team's FTE from hr employment periods; demand is allocated percent plus unstaffed
 * forecast demand; the bench is members employed that month with nothing allocated. Leave (012) isn't
 * installed yet, so booked leave isn't subtracted (leaveAdjusted: false).
 */
export async function forecastIn(tx: Tx, team: string, months: string[], today: Date): Promise<Forecast> {
  const members = await teamMembers(tx, team);
  const ids = members.map((m) => m.personId);
  const periods = byPerson(await listEmploymentPeriods(tx, ids));
  const totals = await personMonthTotals(tx, { from: months[0], to: months[months.length - 1], personIds: ids });
  const unstaffed = await tx.execute(sql`select month::text as month, sum(demand_fte)::float as fte from allocations.forecast where team = ${team} group by month`);
  const teams = (await tx.execute(sql`select distinct team from allocations.member order by team`)).map((r) => r.team as string);
  return {
    team, teams, leaveAdjusted: false,
    months: months.map((month) => {
      const pct = (id: string) => totals.find((t) => t.personId === id && t.month === month)?.percent ?? 0;
      const employed = members.filter((m) => fteIn(periods.get(m.personId) ?? [], month) > 0);
      const extra = Number(unstaffed.find((u) => u.month === month)?.fte ?? 0);
      return {
        month, forecast: isForecast(month, today),
        capacity: round1(employed.reduce((n, m) => n + fteIn(periods.get(m.personId) ?? [], month), 0)),
        demand: round1(employed.reduce((n, m) => n + pct(m.personId) / 100, 0) + extra),
        bench: employed.filter((m) => pct(m.personId) === 0),
      };
    }),
  };
}

export const forecastFor = (v: Viewer, opts: { team?: string; today?: Date; months?: number } = {}) => {
  const today = opts.today ?? new Date();
  return readAlloc(v, (tx) => forecastIn(tx, opts.team ?? "Delivery team", windowMonths(today, opts.months ?? 6), today));
};
