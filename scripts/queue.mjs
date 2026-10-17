#!/usr/bin/env node
// Work queue for building specclaw changes on several machines at once.
//
// Git is the lock: a machine claims a change by committing
// .specclaw/changes/<id>/claim.md to main and pushing. If the push is rejected,
// someone else pushed first, so we rebase and re-check before trying again.
//
//   node scripts/queue.mjs status                     what's done, claimed, ready or blocked
//   node scripts/queue.mjs next --machine vps [--lanes People,Payroll]
//                                                     claim the next ready change and print its id
//   node scripts/queue.mjs release <id> --machine vps give a claim back
//
// A change is READY when its proposal is approved, it is not done or claimed,
// and every hard dependency ("Depends on") is done. "Integrates with" never blocks.
// A change is DONE when its folder has been moved to .specclaw/changes/archive/
// (specclaw:archive does that after the PR merges).
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { hostname } from "node:os";

const CH = ".specclaw/changes";
const sh = (c) => execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };

function load() {
  const done = new Set(existsSync(`${CH}/archive`) ? readdirSync(`${CH}/archive`).map((d) => d.slice(0, 3)) : []);
  const items = [];
  for (const d of readdirSync(CH).filter((d) => /^\d{3}-/.test(d)).sort()) {
    const text = readFileSync(`${CH}/${d}/change.md`, "utf8");
    const head = text.split("\n")[3] ?? "";
    const hard = (head.split("**Integrates with")[0].match(/\[(\d{3})\]/g) ?? []).map((x) => x.slice(1, 4));
    const lane = (head.match(/\*\*Lane:\*\* ([^·]+)/) ?? [])[1]?.trim() ?? "";
    const status = existsSync(`${CH}/${d}/status.md`) ? readFileSync(`${CH}/${d}/status.md`, "utf8") : "";
    const approved = /\|\s*Proposal\s*\|\s*✅ Approved/.test(status);
    const claim = existsSync(`${CH}/${d}/claim.md`) ? readFileSync(`${CH}/${d}/claim.md`, "utf8").match(/machine: (\S+)/)?.[1] : undefined;
    items.push({ id: d.slice(0, 3), dir: d, lane, hard, approved, claim });
  }
  for (const it of items) {
    it.done = done.has(it.id);
    it.waiting = it.hard.filter((h) => !done.has(h));
    it.ready = it.approved && !it.done && !it.claim && it.waiting.length === 0;
  }
  return items;
}

function sync() { sh("git fetch -q origin main"); sh("git pull -q --rebase origin main"); }

function status() {
  sync();
  for (const it of load()) {
    const state = it.done ? "done" : it.claim ? `claimed by ${it.claim}` : !it.approved ? "not approved"
      : it.waiting.length ? `blocked on ${it.waiting.join(", ")}` : "READY";
    console.log(`${it.dir.padEnd(32)} ${it.lane.padEnd(13)} ${state}`);
  }
}

function next() {
  const machine = arg("--machine") ?? hostname();
  const lanes = arg("--lanes")?.split(",").map((s) => s.trim().toLowerCase());
  for (let attempt = 0; attempt < 5; attempt++) {
    sync();
    const pick = load().find((it) => it.ready && (!lanes || lanes.includes(it.lane.toLowerCase())));
    if (!pick) { console.log("nothing ready"); process.exit(2); }
    writeFileSync(`${CH}/${pick.dir}/claim.md`, `# Claim\n\nmachine: ${machine}\nclaimed: ${new Date().toISOString()}\n`);
    sh(`git add ${CH}/${pick.dir}/claim.md`);
    sh(`git commit -q -m "queue: ${machine} claims ${pick.dir}"`);
    try { sh("git push -q origin HEAD:main"); console.log(pick.dir); return; }
    catch { sh("git reset -q --hard HEAD~1"); }  // lost the race: drop our claim commit and look again
  }
  console.error("could not claim after 5 attempts"); process.exit(1);
}

function release() {
  const id = process.argv[3]; const machine = arg("--machine") ?? hostname();
  sync();
  const it = load().find((x) => x.id === id || x.dir === id);
  if (!it?.claim) { console.log("not claimed"); return; }
  if (it.claim !== machine) { console.error(`claimed by ${it.claim}, not ${machine}`); process.exit(1); }
  unlinkSync(`${CH}/${it.dir}/claim.md`);
  sh(`git add -A ${CH}/${it.dir}`); sh(`git commit -q -m "queue: ${machine} releases ${it.dir}"`); sh("git push -q origin HEAD:main");
  console.log(`released ${it.dir}`);
}

({ status, next, release })[process.argv[2]]?.() ?? console.log("usage: queue.mjs status | next --machine <name> [--lanes A,B] | release <id> --machine <name>");
