import { createDb, type Db } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { auditExportJob, configureRuntime, registryFrom, storageFromEnv } from "@amax/core/server";
import { configureAi } from "@amax/ai";
import { anthropicProvider } from "@amax/ai/anthropic";
import { installAuthorizer, setGrants } from "@amax/auth";
import { authEventHandlers } from "@amax/auth/events";
import { installed } from "./registry";

// One database client per server process; null until DATABASE_URL is configured.
const cache = globalThis as unknown as { amaxDb?: Db | null };
// The proxy and the app are separate bundles with their own copies of core and auth, so each
// bundle wires its own runtime and grants even though they share the client.
let wired = false;

export function getDb(): Db | null {
  if (cache.amaxDb === undefined) {
    const env = loadEnv();
    if (!env.DATABASE_URL) return (cache.amaxDb = null);
    if (!env.AUDIT_HASH_KEY) throw new Error("amax: AUDIT_HASH_KEY is required once DATABASE_URL is set");
    cache.amaxDb = createDb(env.DATABASE_URL).db;
  }
  if (cache.amaxDb && !wired) {
    configureRuntime({ db: cache.amaxDb, auditKey: loadEnv().AUDIT_HASH_KEY! });
    setGrants(installed);
    installAuthorizer();
    const env = loadEnv();
    if (process.env.ANTHROPIC_API_KEY) configureAi({ provider: anthropicProvider(), db: cache.amaxDb, model: env.AMAX_AI_MODEL, fallbackModel: env.AMAX_AI_FALLBACK_MODEL });
    wired = true;
  }
  return cache.amaxDb;
}

// Core's own jobs ride alongside the modules'.
const core = { id: "core", jobs: [auditExportJob(() => storageFromEnv(), loadEnv().AUDIT_RETENTION_DAYS)] };
// Sign-in is enforced once a database is configured; before that the app is a guest preview.
export const authEnabled = () => Boolean(loadEnv().DATABASE_URL);

const auth = { id: "auth", events: { handles: authEventHandlers } };
export const jobRegistry = () => registryFrom([core, auth, ...installed]);
