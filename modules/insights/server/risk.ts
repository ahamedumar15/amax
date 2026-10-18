import { withTenant, type Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { contextFor, getRuntime } from "@amax/core/server";
import { host } from "@amax/agents/run";
import { listAllocations } from "@amax/allocations/contracts";
import { listProjectRefs, type ProjectRef } from "@amax/delivery/contracts";
import { listPeople } from "@amax/hr/contracts";
import { approvedLeave } from "@amax/leave/contracts";
import { projectHours } from "@amax/time/contracts";
import { JOBS, type InsightSource } from "../contracts";
import { addDays, shortDay } from "./days";
import { installed, settingsOf } from "./read";
import { recordInsight, type InsightInput } from "./write";

// The daily project risk scan (026 T3): for each project, as its manager, the people allocated over
// the next 30 days (allocations), their approved leave (leave) and the fortnight's logged hours (time),
// all through contracts. A project with leave on its plan or hours down a quarter gets a People risk.
const WINDOW = 30, DAYS = 20;
const weekdays = (from: string, to: string) => { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n++; return n; };
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);

async function hoursDrop(tx: Tx, v: Viewer, projectId: string, today: string) {
  const of = async (from: string, to: string) => (await projectHours(tx, v, { from, to })).find((h) => h.projectId === projectId)?.hours ?? 0;
  const [now, before] = [await of(addDays(today, -13), today), await of(addDays(today, -27), addDays(today, -14))];
  return before > 0 && now < before * 0.75 ? Math.round((1 - now / before) * 100) : 0;
}

export async function projectRisk(tx: Tx, v: Viewer, p: ProjectRef, today: string): Promise<InsightInput | null> {
  const range = { from: addDays(today, 1), to: addDays(today, WINDOW) };
  const plan = (await installed(tx, "allocations.allocation")) ? (await listAllocations(tx, v, { ...range, projectIds: [p.id] })).rows.filter((a) => a.month === `${range.from.slice(0, 7)}-01`) : [];
  const leave = plan.length && (await installed(tx, "leave.request")) ? await approvedLeave(tx, v, { ...range, personIds: plan.map((a) => a.personId) }) : [];
  const names = new Map((await listPeople(tx, v, { ids: plan.map((a) => a.personId) })).map((x) => [x.id, x.name]));
  const days = (id: string) => sum(leave.filter((l) => l.personId === id).map((l) => (l.halfDay ? 0.5 : weekdays(l.startsOn > range.from ? l.startsOn : range.from, l.endsOn < range.to ? l.endsOn : range.to))));
  const lost = sum(plan.map((a) => days(a.personId) * a.percent)), planned = sum(plan.map((a) => DAYS * a.percent));
  const drop = await hoursDrop(tx, v, p.id, today);
  if (!lost && !drop) return null;
  const away = leave.map((l) => `${names.get(l.personId) ?? "Someone"} ${shortDay(l.startsOn)}–${shortDay(l.endsOn)}`);
  const sources: InsightSource[] = [{ label: "allocations", evidenceRef: "/allocations" }, ...(leave.length ? [{ label: "approved leave", evidenceRef: "/leave" }] : []), ...(drop ? [{ label: "logged hours", evidenceRef: "/time" }] : [])];
  const body = [away.length ? `Approved leave in the next ${WINDOW} days: ${away.join(", ")}` : "", drop ? `logged hours down ${drop}% on the fortnight before` : ""].filter(Boolean).join("; ");
  return { kind: "risk", key: `risk:people:${p.key}`, title: p.name, body: body[0].toUpperCase() + body.slice(1), confidence: lost && drop ? "high" : "medium", asOf: today, scope: p.legalEntityId, needs: "hr:read",
    data: { tab: "people", percent: Math.min(95, Math.max(Math.round((lost / Math.max(planned, 1)) * 100), drop)), trend: "steady", due: p.client, action: "Review", project: p.key }, sources };
}

export async function scanRisks(tenantId: string) {
  const db = getRuntime().db;
  const [{ today }, projects] = await withTenant(db, tenantId, async (tx) => [await settingsOf(tx), await listProjectRefs(tx)] as const);
  let n = 0;
  for (const p of projects.filter((x) => x.managerUserId)) {
    const v = await host().viewerFor(tenantId, p.managerUserId!);
    const risk = v ? await withTenant(db, tenantId, (tx) => projectRisk(tx, v, p, today)) : null;
    if (risk) { await recordInsight(contextFor.job(tenantId, JOBS.riskScan, `user:${p.managerUserId}`), risk); n++; }
  }
  return { summary: n ? `${n} project${n === 1 ? "" : "s"} at risk` : "No new risks" };
}
