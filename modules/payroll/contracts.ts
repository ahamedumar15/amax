// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction and never return a person's pay: other modules get a run's step and its totals
// by entity and cost centre (002, 014 AC-3). Country packs (015, 016) plug in through `registerPack`.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, canSee, type Viewer } from "@amax/auth";
import { ForbiddenError, isSystemContext, type ServiceContext } from "@amax/core/server";
import { MIN_COST_CENTRE, totalsByCostCentre, type CostCentreTotal } from "./server/totals";

export { definePack, installedPacks, packFor, registerPack, type CountryPack, type Filing, type PayInput, type PayLine, type PayLineKind, type RunForPack, type StatutoryDue } from "./packs";
export type { CostCentreTotal };

/** A run's steps, in order (014 AC-1). A run's status is the last step it has completed. */
export const STEPS = ["draft", "checked", "hr_approved", "finance_approved", "bank_file", "payslips_sent"] as const;
export type RunStatus = (typeof STEPS)[number];
export const STEP_LABELS: Record<RunStatus, string> = {
  draft: "Draft from time and leave",
  checked: "Agent variance check",
  hr_approved: "HR approval",
  finance_approved: "Finance approval",
  bank_file: "Bank file",
  payslips_sent: "Payslips sent",
};

/** Cost centres with fewer people than this are folded together for totals-only readers, so a total is never one person's pay. */
export { MIN_COST_CENTRE };

export const EVENTS = {
  runDrafted: "payroll.run.drafted",
  runChecked: "payroll.run.checked",
  runHrApproved: "payroll.run.hr-approved",
  runFinanceApproved: "payroll.run.finance-approved",
  bankFileApproved: "payroll.run.bank-file",
  payslipsSent: "payroll.payslips.sent",
} as const;

/** Every step's event. Never an amount: pay stays out of the outbox. */
export type RunStepped = { runId: string; payGroupId: string; legalEntityId: string; period: string; status: RunStatus; by: string };
export type RunChecked = RunStepped & { changes: number };
/** Payslips are out: each paid person (by sign-in, when they have one) may now read their own. */
export type PayslipsSent = RunStepped & { payslips: number; userIds: string[] };

export type RunRef = { id: string; payGroupId: string; legalEntityId: string; period: string; status: RunStatus; currency: string; payslips: number };
export type RunTotals = RunRef & { gross: string; deductions: string; net: string; employer: string; costCentres: CostCentreTotal[] };

type Reader = Viewer | ServiceContext;
const viewerOfReader = (r: Reader): Viewer | null => ("actor" in r ? ((r.viewer as Viewer | undefined) ?? null) : r);
/** System code (a context core issued with contextFor.job) reads every run; a viewer needs payroll:read in the run's entity. Fails closed. */
function mayRead(r: Reader, legalEntityId: string, totals = false) {
  const v = viewerOfReader(r);
  if (!v) return "actor" in r && isSystemContext(r);
  if (!can(v, "payroll:read", { legalEntityId })) return false;
  return !totals || canSee(v, "pay", { legalEntityId }) || can(v, "payroll:totals", { legalEntityId });
}

const toRef = (r: Record<string, unknown>): RunRef => ({
  id: r.id as string, payGroupId: r.pay_group_id as string, legalEntityId: r.legal_entity_id as string, period: String(r.period).slice(0, 7),
  status: r.status as RunStatus, currency: String(r.currency), payslips: Number(r.payslips ?? 0),
});
const REFS = sql`select r.*, (select count(*) from payroll.payslip p where p.run_id = r.id)::int as payslips from payroll.run r`;

/** Runs the reader may see, newest period first: their step and size, never an amount. */
export async function listRunRefs(tx: Tx, reader: Reader): Promise<RunRef[]> {
  return (await tx.execute(sql`${REFS} order by r.period desc, r.legal_entity_id`)).filter((r) => mayRead(reader, r.legal_entity_id as string)).map(toRef);
}

/**
 * One run's totals by entity and cost centre (Finance's view, 014 AC-1): no per-person amount. Cost
 * centres with fewer than MIN_COST_CENTRE people are folded into one line. Throws when the reader may
 * not see totals for the run's entity.
 */
export async function runTotals(tx: Tx, reader: Reader, runId: string): Promise<RunTotals | null> {
  const [r] = await tx.execute(sql`${REFS} where r.id = ${runId}`);
  if (!r) return null;
  if (!mayRead(reader, r.legal_entity_id as string, true)) throw new ForbiddenError("payroll:totals", "payroll.run");
  const ref = toRef(r);
  const t = await totalsByCostCentre(tx, runId, true);
  return { ...ref, ...t.total, costCentres: t.costCentres };
}
