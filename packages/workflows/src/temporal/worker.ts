import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import type { Db } from "@amax/db";
import type { WorkflowRegistry } from "../registry";
import { createActivities } from "./activities";

export type TemporalWorkerOptions = { db: Db; registry: WorkflowRegistry; address: string; namespace: string; taskQueue: string; apiKey?: string; tls?: boolean; connection?: NativeConnection };

// The worker the k3s `worker` Deployment runs when AMAX_WORKFLOWS_ENGINE=temporal: it hosts the
// generic workflow and the activities that replay module definitions. Call `.run()` on the result.
export async function createTemporalWorker(o: TemporalWorkerOptions) {
  const connection = o.connection ?? (await NativeConnection.connect({ address: o.address, tls: o.tls || undefined, apiKey: o.apiKey }));
  return Worker.create({
    connection,
    namespace: o.namespace,
    taskQueue: o.taskQueue,
    workflowsPath: fileURLToPath(new URL("./workflow.ts", import.meta.url)),
    activities: createActivities(o.db, o.registry),
  });
}
