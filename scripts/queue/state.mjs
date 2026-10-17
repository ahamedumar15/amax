import { existsSync, readdirSync, readFileSync } from "node:fs";

export const CH = ".specclaw/changes";

function read(dir) {
  const text = readFileSync(`${CH}/${dir}/change.md`, "utf8");
  const head = text.split("\n")[3] ?? "";
  const hard = (head.split("**Integrates with")[0].match(/\[(\d{3})\]/g) ?? []).map((x) => x.slice(1, 4));
  const lane = (head.match(/\*\*Lane:\*\* ([^·]+)/) ?? [])[1]?.trim() ?? "";
  const status = existsSync(`${CH}/${dir}/status.md`) ? readFileSync(`${CH}/${dir}/status.md`, "utf8") : "";
  const claimFile = `${CH}/${dir}/claim.md`;
  const claim = existsSync(claimFile) ? readFileSync(claimFile, "utf8").match(/machine: (\S+)/)?.[1] : undefined;
  return { id: dir.slice(0, 3), dir, lane, hard, approved: /\|\s*Proposal\s*\|\s*✅ Approved/.test(status), claim };
}

export function load() {
  const archived = existsSync(`${CH}/archive`) ? readdirSync(`${CH}/archive`).map((d) => d.slice(0, 3)) : [];
  const done = new Set(archived);
  return readdirSync(CH).filter((d) => /^\d{3}-/.test(d)).sort().map(read).map((it) => {
    const waiting = it.hard.filter((h) => !done.has(h));
    const isDone = done.has(it.id);
    return { ...it, done: isDone, waiting, ready: it.approved && !isDone && !it.claim && waiting.length === 0 };
  });
}

export function describe(it) {
  if (it.done) return "done";
  if (it.claim) return `claimed by ${it.claim}`;
  if (!it.approved) return "not approved";
  return it.waiting.length ? `blocked on ${it.waiting.join(", ")}` : "READY";
}
