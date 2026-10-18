import { withTenant, type Tx } from "@amax/db";
import { canEver, type Viewer } from "@amax/auth";
import { contextFor, getRuntime } from "@amax/core/server";
import { host } from "@amax/agents/run";
import { personMonthTotals } from "@amax/allocations/contracts";
import { listEmploymentPeriods, listPeople } from "@amax/hr/contracts";
import { certificationsOf } from "@amax/learning/contracts";
import { listOpportunityRefs } from "@amax/presales/contracts";
import { JOBS, type InsightSource } from "../contracts";
import { monthName, shiftMonth } from "./days";
import { installed, settingsOf } from "./read";
import { recordInsight, type InsightInput } from "./write";

// The weekly skills-to-opportunity match (026 T3), for the person the briefing is written for: who
// rolls off in each of the next three months (allocations, less their FTE from hr), what they are
// certified in (learning) and the open pipeline (presales), all through contracts and as that person.
const count = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

/** People whose booking drops from the month before and leaves them under their FTE. */
async function rollingOff(tx: Tx, v: Viewer, month: string) {
  const { rows } = await personMonthTotals(tx, v, { from: `${shiftMonth(month, -1)}-01`, to: `${month}-01` });
  const total = (id: string, m: string) => rows.find((r) => r.personId === id && r.month === `${m}-01`)?.percent ?? 0;
  const ids = [...new Set(rows.filter((r) => r.month === `${shiftMonth(month, -1)}-01`).map((r) => r.personId))];
  const periods = await listEmploymentPeriods(tx, v, ids);
  const fte = (id: string) => periods.filter((p) => p.personId === id && p.startsOn <= `${month}-01` && (!p.endsOn || p.endsOn >= `${month}-01`)).at(-1)?.fte ?? 0;
  return ids.filter((id) => fte(id) > 0 && total(id, month) < fte(id) * 100 && total(id, month) < total(id, shiftMonth(month, -1)));
}

export async function benchMatch(tx: Tx, v: Viewer, month: string, today: string): Promise<InsightInput | null> {
  const free = await rollingOff(tx, v, month);
  if (!free.length) return null;
  const learning = await installed(tx, "learning.certification");
  const certs = learning ? count((await Promise.all(free.map((id) => certificationsOf(tx, id)))).flat().filter((c) => !c.expiresOn || c.expiresOn >= today).map((c) => c.name)) : [];
  const open = canEver(v, "presales:read") ? await listOpportunityRefs(tx, { open: true }) : [];
  const fits = new Set((await listPeople(tx, v, { ids: free })).map((p) => p.legalEntityId));
  const sources: InsightSource[] = [{ label: "allocations", evidenceRef: "/allocations" }, ...(certs.length ? [{ label: "certifications in Learning", evidenceRef: "/learning" }] : []), ...(open.length ? [{ label: "the presales board", evidenceRef: "/presales" }] : [])];
  const body = [`${free.length} ${free.length === 1 ? "person has" : "people have"} nothing planned for all their time in ${monthName(month)}.`,
    certs.length ? `Certified in ${certs.slice(0, 3).map(([n, k]) => `${n} (${k})`).join(", ")}.` : "", open.length ? `Open deals that could use them: ${open.slice(0, 3).map((o) => `${o.client}, ${o.title}`).join("; ")}.` : ""].filter(Boolean).join(" ");
  return { kind: "opportunity", key: `bench:${month}`, title: `Bench in ${monthName(month)}: match ${free.length} to the pipeline`, body, confidence: open.length ? "medium" : "low", asOf: today, scope: fits.size === 1 ? [...fits][0] : null,
    data: { chip: `Bench in ${monthName(month, "short")}`, tone: "warn", fit: free.length, foot: `${open.length} open deal${open.length === 1 ? "" : "s"}`, action: "Match to pipeline" }, sources };
}

export async function matchSkills(tenantId: string) {
  const db = getRuntime().db;
  const { today, briefingFor } = await withTenant(db, tenantId, settingsOf);
  const v = briefingFor ? await host().viewerFor(tenantId, briefingFor) : null;
  if (!v || !(await withTenant(db, tenantId, (tx) => installed(tx, "allocations.allocation")))) return { summary: "Skipped: no allocations to match" };
  let n = 0;
  for (const month of [1, 2, 3].map((i) => shiftMonth(today.slice(0, 7), i))) {
    const match = await withTenant(db, tenantId, (tx) => benchMatch(tx, v, month, today));
    if (match) { await recordInsight(contextFor.job(tenantId, JOBS.skillsMatch, `user:${briefingFor}`), match); n++; }
  }
  return { summary: n ? `${n} match${n === 1 ? "" : "es"}` : "No one rolls off" };
}
