// The only import surface for other modules (docs/module-standard.md), version 1. Onboarding (013) can
// ask which policies a person still has to acknowledge; analytics reads the last audit-chain check and
// the subprocessor list. Reads need compliance:read (or, for a person's own policies, to be that
// person); a system context core issued with contextFor.job reads everything. Hand-built ones fail closed.
import type { Tx } from "@amax/db";
import { chainChecks, type ChainCheck } from "./server/chain-read";
import { policyStatusFor, type PolicyStatus } from "./server/policy-read";
import { assertRead, readerOf, type Reader } from "./server/scope";
import { subprocessors, type Supplier } from "./server/supplier-read";

export type { ChainCheck, PolicyStatus, Reader, Supplier };

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const RISK_STATUSES = ["open", "treating", "accepted", "closed"] as const;
export const INCIDENT_STATUSES = ["reported", "assessing", "contained", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const DATA_CLASSES = ["personal", "pay", "health", "bank", "performance", "candidate"] as const;
export type DataClass = (typeof DATA_CLASSES)[number];
/** ISO 27001 Annex A controls the evidence export covers. */
export const CONTROLS = ["A.5.1", "A.5.18", "A.5.24", "A.6.3", "A.8.15"] as const;
export type Control = (typeof CONTROLS)[number];

export const EVENTS = {
  policyPublished: "compliance.policy.published",
  acknowledgementRequested: "compliance.policy.acknowledgement_requested",
  policyAcknowledged: "compliance.policy.acknowledged",
  riskRaised: "compliance.risk.raised",
  riskChanged: "compliance.risk.changed",
  incidentReported: "compliance.incident.reported",
  incidentChanged: "compliance.incident.changed",
  breachFlagged: "compliance.incident.breach_flagged",
  breachDeadline: "compliance.incident.deadline_due",
  supplierChanged: "compliance.supplier.changed",
  chainChecked: "compliance.chain.checked",
  evidenceExported: "compliance.evidence.exported",
} as const;

export type PolicyPublished = { policyId: string; key: string; title: string; version: number; inScope: number; by: string };
/** One per person in scope with a sign-in, so 030 reaches them. */
export type AcknowledgementRequested = { policyId: string; title: string; version: number; userId: string };
export type PolicyAcknowledged = { policyId: string; version: number; personId: string; userId: string | null };
export type RiskRaised = { riskId: string; ref: string; level: RiskLevel; ownerUserId: string | null; by: string };
export type RiskChanged = RiskRaised & { status: string; changed: string[] };
export type IncidentReported = { incidentId: string; ref: string; title: string; status: IncidentStatus; breach: boolean; ownerUserId: string | null; by: string };
export type IncidentChanged = IncidentReported & { changed: string[] };
/** A possible personal-data breach: its decision deadline from the country pack. */
export type BreachFlagged = { incidentId: string; ref: string; title: string; ownerUserId: string | null; country: string | null; notifyBy: string; regulator: string };
/** A daily reminder while a breach decision is due (AC-2). */
export type BreachDeadline = BreachFlagged & { daysLeft: number };
export type SupplierChanged = { supplierId: string; name: string; subprocessor: boolean; status: string; by: string };
export type ChainChecked = { checkId: string; ok: boolean; events: number; headSeq: number | null; brokenAt: number | null };
export type EvidenceExported = { bundleId: string; control: string; periodFrom: string; periodTo: string; digest: string; by: string };

/** Each current policy version in a person's scope, and whether they have acknowledged it. */
export const pendingPolicies = async (tx: Tx, reader: Reader, personId: string): Promise<PolicyStatus[]> =>
  (await policyStatusFor(tx, readerOf(reader), reader.tenantId, personId)).filter((p) => !p.acknowledged);

/** The latest audit-chain verifications, newest first. */
export async function latestChainChecks(tx: Tx, reader: Reader, limit = 1): Promise<ChainCheck[]> {
  assertRead(readerOf(reader));
  return chainChecks(tx, limit);
}

/** Every active subprocessor: the register's and the platform's own (the 033 AI provider, the database host). */
export async function listSubprocessors(tx: Tx, reader: Reader): Promise<Supplier[]> {
  assertRead(readerOf(reader));
  return subprocessors(tx);
}
