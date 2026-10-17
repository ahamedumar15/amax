import { createDb } from "@amax/db";
import { configureRuntime } from "@amax/core/server";
import { loadEnv } from "@amax/core/env";
import { engineConfig, workflowRegistry } from "@amax/workflows/server";
import { createTemporalWorker } from "@amax/workflows/temporal";
import { modules } from "../generated/modules";
import { platformWorkflows } from "../lib/platform-workflows";

// The k3s Temporal worker (AMAX_WORKFLOWS_ENGINE=temporal): hosts amax's generic workflow and the
// activities that replay every installed module's definitions. See the temporal-worker Dockerfile stage.
const env = loadEnv();
if (!env.DATABASE_URL || !env.AUDIT_HASH_KEY) throw new Error("amax temporal worker: set DATABASE_URL and AUDIT_HASH_KEY");
const config = engineConfig();
const { db } = createDb(env.DATABASE_URL);
configureRuntime({ db, auditKey: env.AUDIT_HASH_KEY });
const worker = await createTemporalWorker({ db, registry: workflowRegistry([platformWorkflows, ...modules]), ...config.temporal });
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => worker.shutdown());
console.log(`amax temporal worker: polling ${config.temporal.taskQueue} on ${config.temporal.address}`);
await worker.run();
process.exit(0);
