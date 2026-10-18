import { z } from "zod";
import type { McpToolDef, PinnedRecord } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { CONTROLS } from "./contracts";
import { checkAuditChain } from "./server/chain";
import { chainChecks } from "./server/chain-read";
import { ACKNOWLEDGE, ctxFor, MANAGE, read as readAs, READ, REPORT } from "./server/context";
import { exportEvidence } from "./server/evidence";
import { reportIncident, updateIncident } from "./server/incidents";
import { complianceOverview } from "./server/overview";
import { acknowledgePolicy, publishPolicy } from "./server/policies";
import { addRisk, updateRisk } from "./server/risks";
import { addSupplier, updateSupplier } from "./server/suppliers";
import { getEvidenceBundle, getIncident, getPolicy, getRisk, getSupplier, listRisks, listSuppliers, myPolicies } from "./server/view";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const write = (permission = MANAGE) => ({ scope: "write" as const, permission });
const id = (what: string, from: string) => z.string().uuid().describe(`The ${what}'s id, from ${from}`);
const pinOf = (r: { id: string; ref?: string; title?: string; name?: string; version?: number } | null): PinnedRecord | null =>
  r ? { id: r.id, label: r.name ?? `${r.ref ? `${r.ref} ` : ""}${r.title}${r.version ? ` v${r.version}` : ""}` } : null;

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_compliance_overview", description: "Compliance at a glance: policy acknowledgement rates, incidents with breach decision deadlines, open risks, suppliers and subprocessors, the last audit-chain check, and the evidence each ISO 27001 control has.",
    input: z.object({}), run: (v) => complianceOverview(v) }),
  tool({ ...read, pin: { id: "incidentId", of: pinOf }, name: "get_incident", description: "One incident: what happened, its owner, whether personal data was involved, the breach decision deadline from its country pack, and its status.",
    input: z.object({ incidentId: id("incident", "get_compliance_overview") }), run: (v, a) => getIncident(v, a.incidentId) }),
  tool({ ...read, pin: { id: "riskId", of: pinOf }, name: "get_risk", description: "One risk from the risk register with its likelihood, impact, rating, owner and treatment.",
    input: z.object({ riskId: id("risk", "list_risks") }), run: (v, a) => getRisk(v, a.riskId) }),
  tool({ ...read, pin: { id: "supplierId", of: pinOf }, name: "get_supplier", description: "One supplier from the register: its service, the data it holds, its region and its DPA.",
    input: z.object({ supplierId: id("supplier", "list_suppliers") }), run: (v, a) => getSupplier(v, a.supplierId) }),
  tool({ ...read, pin: { id: "policyId", of: pinOf }, name: "get_policy", description: "One policy version and its acknowledgements; for the current version, who still has to acknowledge it.",
    input: z.object({ policyId: id("policy version", "get_compliance_overview") }), run: (v, a) => getPolicy(v, a.policyId) }),
  tool({ ...read, pin: { id: "bundleId", of: (b: { id: string; control: string; title: string } | null) => (b ? { id: b.id, label: `${b.control} ${b.title} evidence` } : null) }, name: "get_evidence_bundle",
    description: "One exported evidence bundle with its contents, digest and whether its signature still verifies.", input: z.object({ bundleId: id("bundle", "export_evidence") }), run: (v, a) => getEvidenceBundle(v, a.bundleId) }),
  tool({ ...read, pin: "view", name: "list_risks", description: "Every open risk, highest rated first.", input: z.object({}), run: (v) => listRisks(v) }),
  tool({ ...read, pin: "view", name: "list_suppliers", description: "The supplier register, and the platform's own subprocessors from the AI and data settings (the AI provider, the database host).", input: z.object({}), run: (v) => listSuppliers(v) }),
  tool({ ...read, pin: "view", name: "list_audit_chain_checks", description: "The latest verifications of the tamper-evident audit log: how far each verified, or the event where it broke.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }), run: (v, a) => readAs(v, (tx) => chainChecks(tx, a.limit ?? 10)) }),
  tool({ ...read, permission: ACKNOWLEDGE, pin: "view", name: "get_my_policies", description: "Your own current policies, and which you still have to read and acknowledge.", input: z.object({}), run: (v) => myPolicies(v) }),
  tool({ ...write(REPORT), name: "report_incident", description: "Report an information security incident. Say whether personal data was involved: a possible personal-data breach starts its notification deadline from the legal entity's country pack.",
    input: reportIncident.spec.input, run: (v, a, s = "mcp") => reportIncident(ctxFor(v, s), a) }),
  tool({ ...write(), name: "update_incident", description: "Update an incident: its status, owner, whether personal data was involved, or the breach decision (notify, or not notifiable) and when the regulator was told.",
    input: updateIncident.spec.input, run: (v, a, s = "mcp") => updateIncident(ctxFor(v, s), a) }),
  tool({ ...write(), name: "add_risk", description: "Add a risk to the register. Likelihood and impact are 1 (rare, minor) to 5 (almost certain, severe); the owner is a person's name or email, or me.",
    input: addRisk.spec.input, run: (v, a, s = "mcp") => addRisk(ctxFor(v, s), a) }),
  tool({ ...write(), name: "update_risk", description: "Re-rate a risk, change its owner, treatment or review date, or close or accept it.",
    input: updateRisk.spec.input, run: (v, a, s = "mcp") => updateRisk(ctxFor(v, s), a) }),
  tool({ ...write(), name: "add_supplier", description: "Add a supplier or subprocessor to the register.", input: addSupplier.spec.input, run: (v, a, s = "mcp") => addSupplier(ctxFor(v, s), a) }),
  tool({ ...write(), name: "update_supplier", description: "Update a supplier: its data, region, DPA or review date, or end it.", input: updateSupplier.spec.input, run: (v, a, s = "mcp") => updateSupplier(ctxFor(v, s), a) }),
  tool({ ...write(), name: "publish_policy", description: "Publish a policy, or a new version of one with the same title: everyone in its scope is asked to read and acknowledge it again.",
    input: publishPolicy.spec.input, run: (v, a, s = "mcp") => publishPolicy(ctxFor(v, s), a) }),
  tool({ ...write(ACKNOWLEDGE), name: "acknowledge_policy", description: "Acknowledge that you have read the current version of one of your policies.", input: acknowledgePolicy.spec.input, run: (v, a, s = "mcp") => acknowledgePolicy(ctxFor(v, s), a) }),
  tool({ ...write(), name: "export_evidence", description: `Export a dated, signed evidence bundle per ISO 27001 control (${CONTROLS.join(", ")}): policy acknowledgements, access reviews, incidents, training and audit-chain checks.`,
    input: exportEvidence.spec.input, run: (v, a, s = "mcp") => exportEvidence(ctxFor(v, s), a) }),
  tool({ ...write(), name: "check_audit_chain", description: "Verify the tamper-evident audit log now and record the result (it also runs daily).", input: z.object({}), run: (v, a, s = "mcp") => checkAuditChain(ctxFor(v, s), a) }),
];
