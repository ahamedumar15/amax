import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { listProgrammeRefs, statusOn } from "@amax/learning/contracts";
import type { Control } from "../contracts";
import { day, iso } from "./context";
import { policyCoverage } from "./policy-read";
import { toChainCheck } from "./chain-read";

export type Period = { from: string; to: string };
export type Part = { control: Control; title: string; build: (tx: Tx, tenantId: string, p: Period) => Promise<Record<string, unknown>> };

// Optional integrations degrade to a stated gap instead of passing silently: 021 (access reviews)
// isn't on main yet, and 024 (learning) may be switched off, in which case its schema isn't migrated.
const missing = (module: string, change: string) => ({ available: false, reason: `${module} (change ${change}) isn't installed, so there is no evidence for this control yet` });

export const learningInstalled = async (tx: Tx) => Boolean((await tx.execute(sql`select to_regclass('learning.programme') is not null as on`))[0]?.on);

const required = async (tx: Tx) => (await listProgrammeRefs(tx)).filter((x) => x.mandatory || x.kind === "compliance");

/** How many mandatory or compliance programmes learning has, or null without learning. */
export const mandatoryTraining = async (tx: Tx) => ((await learningInstalled(tx)) ? (await required(tx)).length : null);

/** A.6.3 from learning's contract: the mandatory and compliance programmes run in the period. */
async function training(tx: Tx, p: Period) {
  if (!(await learningInstalled(tx))) return missing("Learning", "024");
  const programmes = (await required(tx)).filter((x) => x.startsOn <= p.to && (x.endsOn ?? p.to) >= p.from);
  return { available: true, programmes: programmes.map((x) => ({ ...x, status: statusOn(x, p.to) })), note: "Per-person completion isn't in learning's contract v1; the Learning screen has it" };
}

export const PARTS: Part[] = [
  { control: "A.5.1", title: "Policies for information security", build: async (tx, tenantId) => {
    const c = await policyCoverage(tx, tenantId);
    return { available: true, people: c.people, fullyAcknowledged: c.fullyAcknowledged, policies: c.policies.map(({ pendingPeople: _names, ...p }) => p) };
  } },
  { control: "A.5.18", title: "Access rights reviews", build: async () => missing("IT access", "021") },
  { control: "A.5.24", title: "Incident management", build: async (tx, _t, p) => ({
    available: true,
    incidents: (await tx.execute(sql`select * from compliance.incident where occurred_on between ${p.from} and ${p.to} order by occurred_on`)).map((r) => ({
      ref: r.ref, title: r.title, occurredOn: day(r.occurred_on), country: r.country, status: r.status, personalData: r.personal_data, breach: r.breach,
      notifyBy: iso(r.notify_by), decision: r.decision, decidedAt: iso(r.decided_at), notifiedOn: day(r.notified_on), resolvedOn: day(r.resolved_on),
    })),
  }) },
  { control: "A.6.3", title: "Information security awareness and training", build: (tx, _t, p) => training(tx, p) },
  { control: "A.8.15", title: "Logging integrity", build: async (tx, _t, p) => ({
    available: true,
    checks: (await tx.execute(sql`select * from compliance.chain_check where checked_at::date between ${p.from} and ${p.to} order by checked_at`)).map(toChainCheck),
  }) },
];
