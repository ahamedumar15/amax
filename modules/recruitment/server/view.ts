import { STAGE_LABELS, STAGES, type RoleRef } from "../contracts";
import { quarterOf } from "./read";
import type { AppRow } from "./rows";

export type Lane = { stage: (typeof STAGES)[number]; label: string; count: number; cards: AppRow[] };
export type Stats = {
  openings: number; fromDemand: number; demandReason: string | null; candidates: number; screened: number;
  timeToHire: number | null; previousTimeToHire: number | null; offersAccepted: number; offers: number;
};

const DAY = 86_400_000;
const avgDays = (rows: AppRow[]) => (rows.length ? Math.round(rows.reduce((n, r) => n + (Date.parse(r.hiredAt!) - Date.parse(r.appliedAt)) / DAY, 0) / rows.length) : null);

/** Applications that were open at some point this quarter: the funnel's and the Candidates tile's cohort. */
export const inQuarter = (rows: AppRow[], start: string) =>
  rows.filter((r) => (!r.closedAt || r.closedAt >= start) && (!r.hiredAt || r.hiredAt >= start));

export function statsOf(roles: RoleRef[], rows: AppRow[], now = new Date()): Stats {
  const q = quarterOf(now);
  const cohort = inQuarter(rows, q.start);
  const demand = roles.filter((r) => r.raisedByAgent);
  const offers = rows.filter((r) => r.offer && (r.offer.status === "sent" || r.offer.sentAt >= q.start || (r.hiredAt ?? "") >= q.start));
  return {
    openings: roles.reduce((n, r) => n + r.openings, 0), fromDemand: demand.reduce((n, r) => n + r.openings, 0), demandReason: demand[0]?.reason ?? null,
    candidates: cohort.length, screened: cohort.filter((r) => r.screenedAt).length,
    timeToHire: avgDays(rows.filter((r) => r.hiredAt && r.hiredAt >= q.start)),
    previousTimeToHire: avgDays(rows.filter((r) => r.hiredAt && r.hiredAt >= q.prev && r.hiredAt < q.start)),
    offersAccepted: offers.filter((r) => r.offer!.status === "signed").length, offers: offers.length,
  };
}

const ORDER: Record<string, (a: AppRow, b: AppRow) => number> = {
  applied: (a, b) => (b.agentScore ?? -1) - (a.agentScore ?? -1),
  screening: (a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1),
  interview: (a, b) => (a.nextInterview ?? "9").localeCompare(b.nextInterview ?? "9"),
  offer: (a, b) => (b.offer?.sentAt ?? "").localeCompare(a.offer?.sentAt ?? ""),
  hired: (a, b) => (b.offer?.startsOn ?? "").localeCompare(a.offer?.startsOn ?? ""),
};

/** The board: what is in each stage now, the hired lane holding this quarter's hires. */
export function lanesOf(rows: AppRow[], now = new Date()): Lane[] {
  const q = quarterOf(now);
  return STAGES.map((stage) => {
    const cards = rows.filter((r) => r.stage === stage && (stage !== "hired" || (r.hiredAt ?? "") >= q.start)).sort(ORDER[stage]);
    return { stage, label: STAGE_LABELS[stage], count: cards.length, cards };
  });
}

/** Reached each stage this quarter (cumulative), from the times each application reached it. */
export function funnelOf(rows: AppRow[], now = new Date()) {
  const c = inQuarter(rows, quarterOf(now).start);
  return [
    { label: "Applied", count: c.length }, { label: "Screened", count: c.filter((r) => r.screenedAt).length },
    { label: "Interviewed", count: c.filter((r) => r.interviewedAt).length }, { label: "Offered", count: c.filter((r) => r.offeredAt).length },
    { label: "Hired", count: c.filter((r) => r.hiredAt).length },
  ];
}

/** Hires by the month they start, the last six months; the current month is to date. */
export function hiresByMonth(rows: AppRow[], now = new Date()) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const month = d.toISOString().slice(0, 7);
    return { month, label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), hires: rows.filter((r) => r.stage === "hired" && r.offer?.startsOn.startsWith(month)).length };
  });
}
