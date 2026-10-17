import type { Db } from "@amax/db";
import type { WorkflowEngine } from "./engine";
import { createPostgresEngine } from "./pg/engine";
import type { WorkflowRegistry } from "./registry";

export type EngineConfig = {
  engine: "postgres" | "temporal";
  temporal: { address: string; namespace: string; taskQueue: string; apiKey?: string; tls: boolean };
};

// Per deployment: AMAX_WORKFLOWS_ENGINE=postgres (default, every host) or temporal (k3s or
// Temporal Cloud), with TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE and, for Cloud,
// TEMPORAL_API_KEY (which turns TLS on).
export function engineConfig(env: Record<string, string | undefined> = process.env): EngineConfig {
  const engine = env.AMAX_WORKFLOWS_ENGINE ?? "postgres";
  if (engine !== "postgres" && engine !== "temporal") throw new Error(`AMAX_WORKFLOWS_ENGINE must be postgres or temporal, not "${engine}"`);
  if (engine === "temporal" && !env.TEMPORAL_ADDRESS) throw new Error("AMAX_WORKFLOWS_ENGINE=temporal needs TEMPORAL_ADDRESS");
  return {
    engine,
    temporal: {
      address: env.TEMPORAL_ADDRESS ?? "localhost:7233",
      namespace: env.TEMPORAL_NAMESPACE ?? "default",
      taskQueue: env.TEMPORAL_TASK_QUEUE ?? "amax-workflows",
      apiKey: env.TEMPORAL_API_KEY,
      tls: Boolean(env.TEMPORAL_API_KEY) || env.TEMPORAL_TLS === "true",
    },
  };
}

export async function engineFromEnv(db: Db, registry: WorkflowRegistry, env: Record<string, string | undefined> = process.env): Promise<WorkflowEngine> {
  const config = engineConfig(env);
  if (config.engine === "postgres") return createPostgresEngine({ db, registry, log: console.error });
  const { createTemporalEngine } = await import("./temporal/engine");
  return createTemporalEngine({ db, registry, ...config.temporal });
}
