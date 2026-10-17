import { engineConfig } from "@amax/workflows/server";
import { createTemporalWorker } from "@amax/workflows/temporal";
import { getDb, workflowsRegistry } from "../lib/server";

// The k3s Temporal worker (AMAX_WORKFLOWS_ENGINE=temporal): hosts amax's generic workflow and the
// activities that replay the installed modules' definitions. getDb() boots exactly as the web app
// does (runtime, authoriser, grants, scopes), and the registry is the web app's own.
const db = getDb();
if (!db) throw new Error("amax temporal worker: set DATABASE_URL");
const config = engineConfig();
const worker = await createTemporalWorker({ db, registry: workflowsRegistry(), ...config.temporal });
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => worker.shutdown());
console.log(`amax temporal worker: polling ${config.temporal.taskQueue} on ${config.temporal.address}`);
await worker.run();
process.exit(0);
