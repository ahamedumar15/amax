import type { Viewer } from "@amax/auth";
import type { Tx } from "@amax/db";
import { brokenLabel, chainChecks, type ChainCheck } from "./chain-read";
import { read } from "./context";
import { mandatoryTraining } from "./evidence-parts";
import { policyCoverage, type PolicyCoverage } from "./policy-read";
import { incidents, openRisks, type Incident, type Risk } from "./registers";
import { platformSuppliers, registerSuppliers, type Supplier } from "./supplier-read";

export type ControlStatus = { control: string; title: string; status: string; ready: boolean };
export type Overview = { coverage: PolicyCoverage; incidents: Incident[]; risks: Risk[]; suppliers: Supplier[]; chain: ChainCheck | null; training: number | null; controls: ControlStatus[] };

const STALE_MS = 36 * 3_600_000;

function chainStatus(c: ChainCheck | null, now: Date) {
  if (!c) return { status: "Not checked yet", ready: false };
  if (!c.ok) return { status: brokenLabel(c), ready: false };
  return now.getTime() - new Date(c.checkedAt).getTime() < STALE_MS ? { status: "Verified daily", ready: true } : { status: `Last verified ${c.checkedAt.slice(0, 10)}`, ready: false };
}

/** The evidence each ISO 27001 Annex A control has, in the mock's order. */
export function controlsOf(o: Omit<Overview, "controls">, now = new Date()): ControlStatus[] {
  const open = o.incidents.filter((i) => i.status !== "resolved").length;
  return [
    { control: "A.5.18", title: "Access rights reviews", status: "Needs IT access (021)", ready: false },
    { control: "A.6.3", title: "Security training", ...(o.training === null ? { status: "Needs Learning (024)", ready: false } : { status: `${o.training} mandatory ${o.training === 1 ? "programme" : "programmes"}`, ready: o.training > 0 }) },
    { control: "A.8.15", title: "Logging integrity", ...chainStatus(o.chain, now) },
    { control: "A.5.1", title: "Policy acknowledgements", status: `${o.coverage.fullyAcknowledged} of ${o.coverage.people}`, ready: true },
    { control: "A.5.24", title: "Incident management", status: `${o.incidents.length} recorded, ${open} open`, ready: true },
  ];
}

export async function overviewIn(tx: Tx, tenantId: string): Promise<Overview> {
  const base = {
    coverage: await policyCoverage(tx, tenantId), incidents: await incidents(tx), risks: await openRisks(tx),
    suppliers: [...(await platformSuppliers(tx)), ...(await registerSuppliers(tx))], chain: (await chainChecks(tx, 1))[0] ?? null, training: await mandatoryTraining(tx),
  };
  return { ...base, controls: controlsOf(base) };
}

/** Everything the Compliance screen shows. */
export const complianceOverview = (v: Viewer) => read(v, (tx) => overviewIn(tx, v.tenantId));
