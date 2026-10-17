import { TestWorkflowEnvironment } from "@temporalio/testing";
import { DefaultLogger, Runtime } from "@temporalio/worker";
import { createTemporalEngine, createTemporalWorker } from "../src/temporal";
import { database, testRegistry, useRuntime, type Harness } from "./harness";

export const temporalEnabled = process.env.AMAX_TEMPORAL_TESTS === "1" || Boolean(process.env.TEMPORAL_ADDRESS);

// A local Temporal dev server (or TEMPORAL_ADDRESS) plus an in-process worker on a fresh database.
export async function temporalHarness(): Promise<Harness> {
  Runtime.install({ logger: new DefaultLogger("ERROR") });
  const t = await database();
  const db = t.app();
  const registry = testRegistry();
  useRuntime(db);
  const env = process.env.TEMPORAL_ADDRESS ? null : await TestWorkflowEnvironment.createLocal();
  const taskQueue = `amax-test-${t.name}`;
  const address = process.env.TEMPORAL_ADDRESS ?? env!.address;
  const worker = await createTemporalWorker({ db, registry, address, namespace: "default", taskQueue, connection: env?.nativeConnection });
  const running = worker.run();
  const engine = createTemporalEngine({ db, registry, address, namespace: "default", taskQueue, client: env?.client });
  return {
    name: "temporal", engine, db, registry, t,
    async close() {
      worker.shutdown();
      await running;
      await env?.teardown();
      await t.drop();
    },
  };
}
