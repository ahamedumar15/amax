import { createDb, type Db } from "@amax/db";
import { configureRateLimits, configureRuntime, limitsFromEnv, type Limited } from "@amax/core/server";
import { loadEnv } from "@amax/core/env";
import { installAuthorizer } from "@amax/auth";
import { after } from "next/server";
import { rateLimitRecorder } from "@amax/api/limits";

// Per bundle, on purpose: Next compiles the proxy and the app separately, each with its own copy of
// this module, core and auth, so each wires its own (review 058 round 3).
let recorder: ReturnType<typeof rateLimitRecorder> | null = null;

// The host keeps the request alive until the 429 is written (060 AC-5). Outside a request scope after()
// throws, and the write simply runs on its own.
const keepAlive = (p: Promise<void>) => {
  try {
    after(p);
  } catch {
    void p;
  }
};

/** The limits from AMAX_RATE_* and the sink that records 429s in api.rate_limited (035 AC-5). */
export function wireRateLimits(env: ReturnType<typeof loadEnv>, sink?: (l: Limited) => void) {
  recorder ??= rateLimitRecorder(keepAlive);
  configureRateLimits({ ...limitsFromEnv(env), sink: sink ?? recorder.sink });
}

/** Writes this bundle's pending 429 counts now (tests; each 429 also schedules its own write). */
export const flushRateLimited = () => recorder?.flush() ?? Promise.resolve();

const shared = globalThis as unknown as { amaxDb?: Db | null };
let proxyWired = false;

/**
 * The proxy's own wiring, whatever the host: its own function on Vercel, its own worker on Cloudflare,
 * or the app's process on k3s. Only what limiting pages needs: the runtime the recorder writes through,
 * the authorizer (deny by default otherwise) and the limits. Its flag is this bundle's, never the
 * shared Db cache, so the app's bundle still wires itself whichever runs first.
 */
export function wireProxy(): boolean {
  if (proxyWired) return true;
  const env = loadEnv();
  // No database: the guest preview, which limits nothing. A database without the audit key fails
  // closed, as getDb() does, rather than limiting with defaults and dropping the counts (review 058).
  if (!env.DATABASE_URL) return false;
  if (!env.AUDIT_HASH_KEY) throw new Error("amax: AUDIT_HASH_KEY is required once DATABASE_URL is set");
  const db = (shared.amaxDb ??= createDb(env.DATABASE_URL).db);
  if (!db) throw new Error("amax: the proxy could not open the database");
  configureRuntime({ db, auditKey: env.AUDIT_HASH_KEY });
  installAuthorizer();
  wireRateLimits(env);
  return (proxyWired = true);
}
