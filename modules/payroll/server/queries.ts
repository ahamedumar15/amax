import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { changesOf } from "./changes";
import { levelOf, monthLabel, read } from "./read";
import { RUN, view, type RunView } from "./view";

export { getPayslip, myPayslips, type PayslipView } from "./payslips";
export type { RunView } from "./view";

// 014 T5: every pay field name the reads return. The read tools declare them `sensitive`, so the AI
// gateway redacts them per the tenant's policy wherever they go (002).
export const PAY_FIELDS = {
  gross: "pay", deductions: "pay", net: "pay", employer: "pay", amount: "pay", was: "pay", now: "pay", total: "pay",
} as const;

/** Runs the viewer may see, newest first: steps, size and (for pay and totals readers) the totals. */
export const listRuns = (v: Viewer) => read(v, async (tx) => {
  const out: RunView[] = [];
  for (const r of await tx.execute(sql`${RUN} order by r.period desc, e.name`)) {
    const x = await view(tx, v, r, false);
    if (x) out.push(x);
  }
  return out;
});

/** One run by id, shaped by the viewer's level; null when there's none they may see. */
export const getRun = (v: Viewer, runId: string) => read(v, async (tx) => {
  const [r] = await tx.execute(sql`${RUN} where r.id = ${runId}`);
  return r ? view(tx, v, r) : null;
});

/** The run the screen opens on: the newest not yet paid, else the newest. */
export const currentRun = (v: Viewer) => read(v, async (tx) => {
  const rows = (await tx.execute(sql`${RUN} order by (r.status = 'payslips_sent'), r.period desc`)).filter((r) => levelOf(v, r.legal_entity_id as string));
  return rows[0] ? view(tx, v, rows[0]) : null;
});

/** One explained change; amounts as the viewer may see them. Finance and everyone else: null. */
export const getChange = (v: Viewer, changeId: string) => read(v, async (tx) => {
  const [c] = await tx.execute(sql`select c.run_id, c.legal_entity_id, to_char(r.period, 'YYYY-MM') as month from payroll.change c join payroll.run r on r.id = c.run_id where c.id = ${changeId}`);
  const level = c ? levelOf(v, c.legal_entity_id as string) : null;
  if (!c || (level !== "pay" && level !== "status")) return null;
  const row = (await changesOf(tx, v, c.run_id as string)).find((x) => x.id === changeId)!;
  return { ...row, runId: c.run_id as string, period: c.month as string, periodLabel: monthLabel(c.month as string) };
});
