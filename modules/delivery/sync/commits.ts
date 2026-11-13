// 104 AC-2: the commits named for a change, read from git by the plugin, CI and the self-sync (the server never runs
// git). Build-time tooling, like authors.ts: only each commit's id, author email and time leave this file, and amax
// resolves the email to a person at sync time without storing it.
import { execFileSync } from "node:child_process";

export type ChangeCommit = { id: string; email: string; at: string };

/** A commit is a change's when its subject names the change: `specclaw(<NNN-slug>)` or `[specclaw] <NNN-slug>`. */
export const namesChange = (subject: string, dir: string) => subject.startsWith(`specclaw(${dir})`) || subject.startsWith(`[specclaw] ${dir}`);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX = 2000;

/**
 * The change's commits reachable from `at`, newest first, merges left out. Git pre-filters by the subject's start and
 * the subject is checked again here, so a body line that mentions the change doesn't count. A failed walk reads as
 * no commits, which drafts nothing (amax keeps what it has).
 */
export function commitsOf(root: string, at: string, dir: string): ChangeCommit[] {
  try {
    const grep = `^(specclaw\\(${escape(dir)}\\)|\\[specclaw\\] ${escape(dir)})`;
    const out = execFileSync("git", ["log", at, "--no-merges", `-${MAX}`, "-E", `--grep=${grep}`, "--format=%H%x09%ae%x09%aI%x09%s"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
    return out.split("\n").filter(Boolean).map((line) => {
      const [id, email, at, ...subject] = line.split("\t");
      return namesChange(subject.join("\t"), dir) ? [{ id, email, at: new Date(at).toISOString() }] : [];
    }).flat();
  } catch {
    return [];
  }
}
