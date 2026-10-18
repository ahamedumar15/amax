import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { StartOptions, WorkflowEngine } from "./engine";
import { ENTITY_ZONES } from "./schedules";
import type { Json } from "./types";

// Modules never import an engine (docs/architecture.md); the host registers how to reach its one, the
// way @amax/auth's setViewerResolver works for the signed-in viewer (030).
let engine: (() => Promise<WorkflowEngine>) | undefined;

export const setWorkflowEngine = (fn: (() => Promise<WorkflowEngine>) | undefined) => {
  engine = fn;
};

/** Starts a run on the host's engine. With `tx`, the run exists only if the caller's write commits. */
export async function startWorkflow(tenantId: string, workflow: string, input: Json, options: StartOptions) {
  if (!engine) throw new Error("amax: no workflow engine registered (setWorkflowEngine)");
  return (await engine()).start(tenantId, workflow, input, options);
}

/** A legal entity's time zone: its own (workflows.entity_zone), else its country's default, else UTC. */
export async function entityZone(tx: Tx, legalEntityId: string | null): Promise<string> {
  if (!legalEntityId) return "UTC";
  const [r] = await tx.execute(sql`select z.timezone, e.country from core.legal_entity e left join workflows.entity_zone z on z.legal_entity_id = e.id where e.id = ${legalEntityId}`);
  return (r?.timezone as string | undefined) ?? ENTITY_ZONES[String(r?.country ?? "").trim()] ?? "UTC";
}
