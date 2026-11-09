#!/usr/bin/env node
// 089: CI's specclaw sync. After a merge to the default branch it pushes the repo's specclaw state to amax through the
// sync_specclaw tool (POST /api/v1/tools/sync_specclaw), as an API credential acting for the project's PM: first the
// default branch (every change), then each specclaw/* branch (only its own change, 062's rule). It reads the repo with
// the amax plugin's reader, so CI and /amax:sync-specclaw can't read a repo differently. It never writes to the repo.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { payload, readSpecclaw } from "../plugins/amax/scripts/read-specclaw.mjs";

export const MAX_PUSH = 200;
const SECRETS = ["AMAX_URL", "AMAX_SYNC_API_KEY", "AMAX_SYNC_ACT_FOR"];
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** The specclaw/* branches the checkout knows, each read from its own tree (a branch without .specclaw is skipped). */
function branches(root) {
  const refs = git(root, "branch", "-r", "--format=%(refname:short)").split("\n").filter((b) => b.startsWith("origin/specclaw/"));
  return refs.flatMap((b) => {
    try { git(root, "cat-file", "-e", `${b}:.specclaw`); } catch { return []; }
    const dir = mkdtempSync(join(tmpdir(), "specclaw-branch-"));
    execFileSync("tar", ["-x", "-C", dir], { input: execFileSync("git", ["archive", b, ".specclaw"], { cwd: root, maxBuffer: 256 * 1024 * 1024 }) });
    const sha = git(root, "rev-parse", b), ref = b.slice("origin/".length);
    return [{ ref, sha, committedAt: git(root, "show", "-s", "--format=%cI", b), records: readSpecclaw({ dir, ref: `${ref}@${sha}` }), dir }];
  });
}

async function call(env, fetchImpl, args) {
  const res = await fetchImpl(`${env.AMAX_URL.replace(/\/+$/, "")}/api/v1/tools/sync_specclaw`, {
    method: "POST", headers: { authorization: `Bearer ${env.AMAX_SYNC_API_KEY}`, "amax-act-for": env.AMAX_SYNC_ACT_FOR, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`amax answered ${res.status}: ${body.message ?? body.error ?? "no reason given"}`);
  return body.result;
}

/** One ref's pushes, in batches of MAX_PUSH. Only a single-batch default-branch push may withdraw gone folders. */
async function pushRef(env, fetchImpl, base, records, onDefault, out) {
  const batches = [];
  for (let i = 0; i < Math.max(records.length, 1); i += MAX_PUSH) batches.push(records.slice(i, i + MAX_PUSH));
  if (onDefault && batches.length > 1) out.warn(`${base.ref}: more than ${MAX_PUSH} changes, so withdrawal is skipped this run`);
  for (const batch of batches) {
    const r = await call(env, fetchImpl, { ...base, records: batch, dryRun: false, withdrawMissing: onDefault && batches.length === 1 });
    if (r.outcome === "refused") throw new Error(`${base.ref} ${base.sha.slice(0, 7)} → ${base.projectKey}: refused: ${r.reason}`);
    out.line(`${base.ref} ${base.sha.slice(0, 7)} → ${base.projectKey}: ${r.outcome}`);
    out.line(`  ${r.created} created · ${r.updated} updated · ${r.withdrawn ?? 0} withdrawn · ${r.unchanged} unchanged · ${r.skipped.length} skipped${r.ignored ? ` · ${r.ignored} not this branch's` : ""}`);
    for (const s of r.skipped) out.warn(s);
  }
}

export async function run({ env = process.env, root = process.cwd(), fetchImpl = fetch, out }) {
  const missing = SECRETS.filter((k) => !env[k]);
  if (missing.length) {
    out.notice(`specclaw sync is not set up. Add ${SECRETS.join(", ")} to run it (missing: ${missing.join(", ")}).`);
    return 0;
  }
  const main = payload(root);
  out.line(`specclaw sync → ${env.AMAX_URL.replace(/\/+$/, "")}/api/v1/tools/sync_specclaw`);
  let failed = 0;
  const attempt = async (fn) => { try { await fn(); } catch (e) { failed++; out.error(e.message); } };
  const { records, ...base } = main;
  await attempt(() => pushRef(env, fetchImpl, base, records, true, out));
  for (const b of branches(root)) {
    await attempt(() => pushRef(env, fetchImpl, { projectKey: main.projectKey, repoUrl: main.repoUrl, ref: b.ref, sha: b.sha, committedAt: b.committedAt }, b.records, false, out));
    rmSync(b.dir, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

/** GitHub Actions output: workflow commands for notices and warnings, and the job summary. */
export const actionsOut = (env = process.env) => {
  const summary = (text) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return {
    line: (t) => { console.log(t); summary(`    ${t}`); },
    notice: (t) => { console.log(`::notice title=specclaw sync::${t}`); summary(`> ${t}`); },
    warn: (t) => { console.log(`::warning title=specclaw sync::${t}`); summary(`    ⚠ ${t}`); },
    error: (t) => { console.log(`::error title=specclaw sync::${t}`); summary(`    ✗ ${t}`); },
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await run({ out: actionsOut() }));
}
