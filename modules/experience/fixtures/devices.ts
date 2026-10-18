import { randomUUID } from "node:crypto";
import type { PersonRef } from "@amax/hr/contracts";
import { BATTERY, BOOT_SECONDS, DEPARTMENTS, MODELS, RISKY, SLOW, SLOW_MODEL, SPECIAL, TEAMS, VPN, type Dept } from "./data";

export type Seeded = {
  id: string; external_id: string; model: string; owner_user_id: string | null; person_id: string; legal_entity_id: string; department: string;
  startup: number | null; app: number | null; boot_seconds: number; crashes: number; hangs: number; battery_pct: number; risk: string;
  apps: { app: string; app_version: string; days: string[]; crashes: number; hangs: number }[];
};

const days = (from: string, to: string) => { const out: string[] = []; for (let d = Date.parse(from); d <= Date.parse(to); d += 86_400_000) out.push(new Date(d).toISOString().slice(0, 10)); return out; };
const pulseMean = (a: [number, number, number]) => (a[0] * 10 + a[1] * 5) / (a[0] + a[1] + a[2]);

/** One department's devices: two for its first people until it has its count, the special ones first. */
function devicesOf(d: Dept, people: PersonRef[], today: string, n: { i: number }): Seeded[] {
  const owners = [...people, ...people].slice(0, d.devices);
  const out = owners.map((p, k): Seeded => ({
    id: randomUUID(), external_id: `demo-intune-${String(++n.i).padStart(4, "0")}`, model: MODELS[n.i % MODELS.length], owner_user_id: p.userId, person_id: p.id, legal_entity_id: p.legalEntityId,
    department: d.name, startup: null, app: null, boot_seconds: BOOT_SECONDS + (k % 9) * 4, crashes: 0, hangs: 0, battery_pct: 88 - (k % 7), risk: k % 5 ? "none" : "low", apps: [],
  }));
  const crashing = TEAMS.crashing[d.name as keyof typeof TEAMS.crashing] ?? 0, calm = TEAMS.calm[d.name as keyof typeof TEAMS.calm] ?? 0;
  out.slice(0, crashing + calm).forEach((x, k) => {
    x.apps.push({ app: TEAMS.app, app_version: TEAMS.from, days: days("2026-10-06", "2026-10-12"), crashes: 0, hangs: 0 });
    x.apps.push({ app: TEAMS.app, app_version: TEAMS.to, days: days(TEAMS.arrived, today), crashes: k < crashing ? 1 : 0, hangs: 0 });
    if (k < crashing) Object.assign(x, { app: SPECIAL.teamsApp, crashes: 4 });
  });
  const at = crashing + calm;
  if (d.name === SLOW.department) out.slice(at, at + SLOW.devices).forEach((x) => Object.assign(x, { model: SLOW_MODEL, boot_seconds: SLOW.bootSeconds, startup: SLOW.startup }));
  if (d.name === RISKY.department) out.slice(at + SLOW.devices, at + SLOW.devices + RISKY.devices).forEach((x) => Object.assign(x, { risk: "high" }));
  if (d.name === VPN.department) out.slice(0, VPN.devices).forEach((x) => { x.hangs = 3; x.apps.push({ app: VPN.app, app_version: VPN.version, days: days(VPN.since, today), crashes: 0, hangs: 1 }); });
  if (d.name === BATTERY.department) out.slice(0, BATTERY.devices).forEach((x) => (x.battery_pct = BATTERY.pct));
  return out;
}

/** Fills each group's free scores so its score (40% device, 40% app, 20% pulse) is the mock's. */
function solve(devices: Seeded[], score: number, pulse: number) {
  const need = Math.round(20 * devices.length * ((score - 0.2 * pulse) / 0.8));
  const fixed = devices.reduce((s, x) => s + (x.startup ?? 0) + (x.app ?? 0), 0);
  const free = devices.flatMap((x) => [x.startup === null ? [x, "startup"] : null, x.app === null ? [x, "app"] : null]).filter((f): f is [Seeded, "startup" | "app"] => f !== null);
  const base = Math.floor((need - fixed) / free.length);
  let extra = need - fixed - base * free.length;
  for (const [x, k] of free) x[k] = base + (extra-- > 0 ? 1 : 0);
}

export function seedDevices(people: PersonRef[], today: string) {
  const n = { i: 0 };
  const all: Seeded[] = [];
  const groups = new Map<string, { devices: Seeded[]; d: Dept; answers: [number, number, number] }>();
  for (const d of DEPARTMENTS) {
    const mine = devicesOf(d, people.filter((p) => p.department === d.name).sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)), today, n);
    all.push(...mine);
    const g = groups.get(d.group ?? d.name) ?? { devices: [], d, answers: [0, 0, 0] };
    g.devices.push(...mine);
    g.answers = g.answers.map((v, i) => v + d.answers[i]) as [number, number, number];
    groups.set(d.group ?? d.name, g);
  }
  for (const g of groups.values()) solve(g.devices, g.d.score, pulseMean(g.answers));
  return all;
}
