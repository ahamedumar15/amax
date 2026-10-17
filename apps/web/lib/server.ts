import { createDb, type Db } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { auditExportJob, configureRuntime, registryFrom, storageFromEnv } from "@amax/core/server";
import { installed } from "./registry";

// One database client per server instance; null until DATABASE_URL is configured.
const cache = globalThis as unknown as { amaxDb?: Db | null };

export function getDb(): Db | null {
  if (cache.amaxDb === undefined) {
    const env = loadEnv();
    if (!env.DATABASE_URL) return (cache.amaxDb = null);
    if (!env.AUDIT_HASH_KEY) throw new Error("amax: AUDIT_HASH_KEY is required once DATABASE_URL is set");
    cache.amaxDb = createDb(env.DATABASE_URL).db;
    configureRuntime({ db: cache.amaxDb, auditKey: env.AUDIT_HASH_KEY });
  }
  return cache.amaxDb;
}

// Core's own jobs ride alongside the modules'.
const core = { id: "core", jobs: [auditExportJob(() => storageFromEnv(), loadEnv().AUDIT_RETENTION_DAYS)] };
export const jobRegistry = () => registryFrom([core, ...installed]);
