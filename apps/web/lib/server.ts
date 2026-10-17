import { readFileSync } from "node:fs";
import { createDb, type Db } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { auditExportJob, configureRuntime, pruneKeysJob, registryFrom, storageFromEnv } from "@amax/core/server";
import { configureSecrets, kmsFromEnv, secretsSweepJob } from "@amax/core/secrets";
import { configureAi } from "@amax/ai";
import { aiTools } from "@amax/ai/usage-tool";
import { anthropicProvider } from "@amax/ai/anthropic";
import { scriptedProvider } from "@amax/ai/scripted";
import { installAuthorizer, setGrants, setViewerScopeResolvers } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import { chatPlatform, type Intent } from "@amax/chat";
import { authEventHandlers } from "@amax/auth/events";
import { engineFromEnv, pruneRunsJob, signalHandlers, workflowRegistry, workflowsRetention, type WorkflowEngine } from "@amax/workflows/server";
import { platformWorkflows } from "./platform-workflows";
import { adminModule, type AdminDeps } from "./admin";
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
    if (env.NODE_ENV === "production" && !env.AMAX_BASE_URL) throw new Error("amax: AMAX_BASE_URL is required once DATABASE_URL is set in production");
    cache.amaxDb = createDb(env.DATABASE_URL).db;
  }
  if (cache.amaxDb && !wired) {
    configureRuntime({ db: cache.amaxDb, auditKey: loadEnv().AUDIT_HASH_KEY! });
    configureSecrets({ kms: kmsFromEnv(loadEnv(), (path) => readFileSync(path, "utf8")) });
    setGrants([...installed, chatPlatform]);
    setViewerScopeResolvers(installed.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])));
    installAuthorizer();
    const env = loadEnv();
    if (process.env.AMAX_AI_PROVIDER === "scripted" && env.NODE_ENV !== "production") configureAi({ provider: scriptedProvider(), db: cache.amaxDb, model: "scripted" });
    else if (process.env.ANTHROPIC_API_KEY) configureAi({ provider: anthropicProvider(), db: cache.amaxDb, model: env.AMAX_AI_MODEL, fallbackModel: env.AMAX_AI_FALLBACK_MODEL });
    wired = true;
  }
  return cache.amaxDb;
}

// Core's own jobs ride alongside the modules'.
const core = { id: "core", jobs: [auditExportJob(() => storageFromEnv(), loadEnv().AUDIT_RETENTION_DAYS), pruneKeysJob, secretsSweepJob] };
// Sign-in is enforced once a database is configured; before that the app is a guest preview.
export const authEnabled = () => Boolean(loadEnv().DATABASE_URL);

const auth = { id: "auth", events: { handles: authEventHandlers } };

// 029: one workflow registry and engine (Postgres by default, Temporal when configured).
let workflows: ReturnType<typeof workflowRegistry> | undefined;
export const workflowsRegistry = () => (workflows ??= workflowRegistry([platformWorkflows, ...installed]));
let engine: Promise<WorkflowEngine> | undefined;
export function workflowEngine(): Promise<WorkflowEngine> {
  const db = getDb();
  if (!db) throw new Error("amax: workflows need DATABASE_URL");
  return (engine ??= engineFromEnv(db, workflowsRegistry()).catch((e) => {
    engine = undefined;
    throw e;
  }));
}
const workflowsJobs = () => ({ id: "workflows", jobs: [pruneRunsJob], retention: workflowsRetention, events: { handles: signalHandlers(workflowsRegistry(), workflowEngine) } });

export const jobRegistry = () => registryFrom([core, auth, workflowsJobs(), ...installed]);

// 004/005: one tool registry and the chat intents, from the installed manifests. The AI gateway's
// own read tool (048 get_ai_usage) sits beside them.
let registry: ReturnType<typeof createRegistry> | undefined;
export const adminDeps: AdminDeps = { db: () => getDb()!, workflows: () => workflowsRegistry(), engine: () => workflowEngine(), tools: () => toolRegistry() };
export const toolRegistry = () => (registry ??= createRegistry([aiTools, ...installed, chatPlatform, adminModule(adminDeps)]));
export const chatIntents = () => installed.flatMap((m) => (m.chatIntents ?? []) as Intent[]);

// Voice input is a per-tenant AI policy switch (033 AC-5).
export async function voiceEnabled(tenantId: string) {
  const db = getDb();
  if (!db) return false;
  const { withTenant } = await import("@amax/db");
  const { loadPolicy, voiceAllowed } = await import("@amax/ai");
  return voiceAllowed(await withTenant(db, tenantId, (tx) => loadPolicy(tx))).ok;
}
// 004: the public base URL (for OAuth metadata and the MCP audience).
// The public origin is configuration, never request headers: it becomes the OAuth issuer and the
// MCP token audience (review round 1, B6). Outside production a loopback host may stand in.
export const baseUrl = (req: Request | Headers) => {
  const env = loadEnv();
  if (env.AMAX_BASE_URL) return env.AMAX_BASE_URL.replace(/\/$/, "");
  if (env.NODE_ENV === "production") throw new Error("amax: AMAX_BASE_URL must be set in production");
  const h = req instanceof Request ? req.headers : req;
  const host = h.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new Error("amax: set AMAX_BASE_URL (only loopback hosts work without it)");
  return `http://${host}`;
};