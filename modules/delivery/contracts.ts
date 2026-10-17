// The only import surface for other modules (docs/module-standard.md). Reads apply the caller's
// tenant and data scope; events are what delivery emits through the outbox.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const PHASES = ["proposed", "planned", "building", "verified", "released"] as const;
export type Phase = (typeof PHASES)[number];

export type ProjectRef = { id: string; key: string; name: string; client: string; managerUserId: string | null; legalEntityId: string | null };

/** Emitted when a deployment is recorded. `released` is true when the environment is Prod. */
export type ReleaseDeployed = { releaseId: string; projectId: string; version: string; environment: string; status: "deployed" | "testing" | "rolled-back"; released: boolean };
/** Emitted on every phase change, from a board move, a sync or a Prod deployment. */
export type ProposalPhaseChanged = { proposalId: string; key: string; projectId: string; from: Phase; to: Phase; by: string };

/** A proposal made by hand moved to the hand-made series because a spec change owns its old key. */
export type ProposalRekeyed = { proposalId: string; projectId: string; from: string; to: string };

export const EVENTS = { releaseDeployed: "delivery.release.deployed", proposalPhaseChanged: "delivery.proposal.phase_changed", proposalRekeyed: "delivery.proposal.rekeyed" } as const;

const toRef = (r: Record<string, unknown>): ProjectRef => ({
  id: r.id as string, key: r.key as string, name: r.name as string, client: r.client as string,
  managerUserId: (r.manager_user_id as string | null) ?? null, legalEntityId: (r.legal_entity_id as string | null) ?? null,
});

/** Projects visible in this tenant transaction (time, finance and allocations look projects up here). */
export async function listProjectRefs(tx: Tx): Promise<ProjectRef[]> {
  return (await tx.execute(sql`select id, key, name, client, manager_user_id, legal_entity_id from delivery.project where status = 'active' order by name`)).map(toRef);
}

export async function getProjectRef(tx: Tx, keyOrId: string): Promise<ProjectRef | null> {
  const [r] = await tx.execute(sql`select id, key, name, client, manager_user_id, legal_entity_id from delivery.project where key = ${keyOrId} or id::text = ${keyOrId}`);
  return r ? toRef(r) : null;
}

/**
 * Project creation for other modules (presales' "Promote to delivery"). `sourceRef` names the record
 * the project comes from, e.g. "presales.opportunity:OPP0042": a second create with it returns the
 * project already made (`existing: true`) instead of a new one. createProjectInTx runs in the
 * caller's withTenant transaction. Callers gate their UI on PROJECT_CREATE_PERMISSION.
 */
export { createProject, createProjectInTx, PROJECT_CREATE_PERMISSION, type CreateProjectInput, type CreateProjectResult } from "./server/project-contract";
export type { CreatedProject } from "./server/project-create";

/** Projects a user manages: feeds the viewer's @managed scope. */
export async function managedProjectIds(tx: Tx, userId: string): Promise<string[]> {
  return (await tx.execute(sql`select id from delivery.project where manager_user_id = ${userId}`)).map((r) => r.id as string);
}
