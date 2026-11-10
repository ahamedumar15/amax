// 091 AC-7: who added each change's change.md, read from git, so amax can make them its owner. Build-time tooling,
// like specclaw.ts: the plugin, CI and the self-sync run it; the server never does. Only the email leaves this file,
// and amax resolves it to a person at sync time without storing it (the trace keeps a keyed hash of a tool's
// arguments, never the arguments).
import { execFileSync } from "node:child_process";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

type Readable = { dir: string; phase: string; source?: string };

/** Whether `root` is a shallow clone, so authors can't be read (the CI job checks out with full history). */
export const isShallow = (root: string) => { try { return git(root, "rev-parse", "--is-shallow-repository") === "true"; } catch { return true; } };

/**
 * Each record's author: the email on the commit that first added its change.md at its own commit (the sha in
 * `source`, else `rev`), following the move to archive/. `undefined` when it can't be told: git failed, a shallow
 * clone (whose first commit shows every file as added), or the file isn't in the tree at that commit (a checkout
 * with uncommitted changes). amax then keeps the stored owner. `only` limits it to one folder (a branch's own); the
 * others get `undefined` too.
 */
export function authorsOf<T extends Readable>(root: string, rev: string, records: T[], only?: string): (T & { author?: string | null })[] {
  const shallow = isShallow(root);
  return records.map((r) => {
    if (shallow || (only && r.dir !== only)) return { ...r, author: undefined };
    const at = r.source?.match(/@([0-9a-f]{7,40})$/i)?.[1] ?? rev;
    const path = `.specclaw/changes/${r.phase === "released" ? "archive/" : ""}${r.dir}/change.md`;
    try {
      git(root, "cat-file", "-e", `${at}:${path}`);
      const lines = git(root, "log", at, "--follow", "--diff-filter=A", "--format=%ae", "--", path).split("\n").filter(Boolean);
      return { ...r, author: lines.at(-1) ?? null };
    } catch {
      return { ...r, author: undefined };
    }
  });
}

/**
 * 091 AC-7: the email a record names its owner by: the header's Owner line, else its author. `undefined` when the
 * author couldn't be read, so the stored owner stays; `null` when the repo names nobody.
 */
export const ownerEmailOf = (r: { owner?: string | null; author?: string | null }) => (r.owner ? r.owner : r.author);
