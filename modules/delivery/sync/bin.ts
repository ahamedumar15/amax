// pnpm --filter @amax/delivery sync:specclaw --repo <path> [--overlay <path>]... [--project AMX] [--sha <commit>]
// Env: DATABASE_URL (the app role), AMAX_SYNC_TOKEN (a service principal with delivery:proposal:sync),
// AUDIT_HASH_KEY. One-way: it never writes to the repo.
import { parseArgs } from "node:util";
import { createDb } from "@amax/db";
import { configureRuntime } from "@amax/core/server";
import { authenticateToken, installAuthorizer, principalContext } from "@amax/auth";
import { readSpecclaw } from "./specclaw";
import { syncSpecclaw } from "./import";

const { values } = parseArgs({
  options: { repo: { type: "string" }, overlay: { type: "string", multiple: true }, project: { type: "string", default: "AMX" }, name: { type: "string", default: "amax" },
    client: { type: "string", default: "Internal" }, sha: { type: "string", default: "unknown" } },
});
const env = process.env;
for (const k of ["DATABASE_URL", "AMAX_SYNC_TOKEN", "AUDIT_HASH_KEY"]) if (!env[k]) throw new Error(`set ${k}`);
if (!values.repo) throw new Error("--repo is required");

const { db, client } = createDb(env.DATABASE_URL!, { max: 2 });
configureRuntime({ db, auditKey: env.AUDIT_HASH_KEY! });
installAuthorizer();
try {
  const id = await authenticateToken(db, env.AMAX_SYNC_TOKEN!);
  if (id?.kind !== "principal") throw new Error("AMAX_SYNC_TOKEN is not a live service principal token");
  const ctx = await principalContext(db, id.principal, "delivery:proposal:sync");
  const records = readSpecclaw(values.repo, values.overlay ?? []);
  const r = await syncSpecclaw(db, ctx, { projectKey: values.project!, projectName: values.name!, client: values.client!, records, sha: values.sha! });
  console.log(`specclaw sync ${values.sha}: ${records.length} changes, ${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ${r.withdrawn} withdrawn`);
} finally {
  await client.end();
}
