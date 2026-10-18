import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { day } from "./read";

export type Issue = {
  id: string; kind: "app" | "boot" | "battery"; subject: string; version: string | null; title: string; cause: string; arrivedOn: string | null; ratio: number | null;
  department: string | null; firstSeen: string; devices: number; confidence: number; fix: "remediation" | "ticket"; status: "open" | "accepted" | "done"; suggestionId: string | null;
};

export const toIssue = (r: Record<string, unknown>): Issue => ({
  id: r.id as string, kind: r.kind as Issue["kind"], subject: r.subject as string, version: (r.version as string | null) ?? null, title: r.title as string, cause: r.cause as string,
  arrivedOn: r.arrived_on ? day(r.arrived_on) : null, ratio: r.ratio === null || r.ratio === undefined ? null : Number(r.ratio), department: (r.department as string | null) ?? null,
  firstSeen: day(r.first_seen), devices: Number(r.devices), confidence: Number(r.confidence), fix: r.fix as Issue["fix"], status: r.status as Issue["status"], suggestionId: (r.suggestion_id as string | null) ?? null,
});

export async function issues(tx: Tx, where = sql`true`): Promise<Issue[]> {
  return (await tx.execute(sql`select * from experience.issue where ${where} order by devices desc, first_seen, key`)).map(toIssue);
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Tuesday's" within the week, else "the Oct 13". */
export const whenOf = (d: string, today: string) => {
  const days = (Date.parse(today) - Date.parse(d)) / 86_400_000;
  return days >= 0 && days < 7 ? `${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}'s` : `the ${short(d)}`;
};
const year = (model: string) => model.match(/\((\d{4})\)/)?.[1];
const laptops = (n: number) => `${n} laptop${n === 1 ? "" : "s"}`;

/** The experience agent's fix, as the suggestion and the screen name it. */
export function fixTitle(i: Issue) {
  if (i.kind === "app") return `Roll back ${i.subject} on ${laptops(i.devices)}`;
  if (i.kind === "battery") return `Replace the battery in ${laptops(i.devices)}`;
  return `Replace ${laptops(i.devices)}${year(i.subject) ? ` from ${year(i.subject)}` : ""}${i.department ? ` in ${i.department}` : ""}`;
}

export function fixDetail(i: Issue, today: string) {
  if (i.kind === "app") return `Crashes started after ${whenOf(i.arrivedOn ?? i.firstSeen, today)} update. ${Math.round(i.confidence * 100)}% confidence`;
  if (i.kind === "boot") return `Boot over 4 min${i.ratio ? `, ${i.ratio}× the fleet's median` : ""}. Opens an IT ticket`;
  return "Battery under 60% of its capacity. Opens an IT ticket";
}

/** What the lede says about the largest fix waiting. */
export function ledeOf(i: Issue, today: string) {
  if (i.kind === "app") return `${i.subject} has crashed on ${laptops(i.devices)} since ${whenOf(i.arrivedOn ?? i.firstSeen, today)} update, and the experience agent suggests rolling it back.`;
  return `${laptops(i.devices)} ${i.kind === "boot" ? "take over 4 minutes to boot" : "have a worn battery"}, and the experience agent suggests replacing them.`;
}
