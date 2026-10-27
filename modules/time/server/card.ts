import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { guardFixable, mayFix } from "./entry";
import { projectNames, read } from "./read";
import type { WeekRow } from "./weeks";

/**
 * 070 AC-17: what the confirm card shows about the entry, copied from get_timesheet by the model and
 * checked against the stored entry before the card is made, so the person confirms the real values.
 * Optional on the tool, so a direct MCP call can name just the entry; chat's card needs them all.
 */
export const cardFields = {
  project: z.string().optional().describe("The entry's project name, as get_timesheet shows it"),
  day: z.string().optional().describe("The entry's day, YYYY-MM-DD"),
  person: z.string().optional().describe("Whose entry, when it isn't your own"),
  hoursBefore: z.number().optional().describe("The entry's hours now"),
};
export type CardInput = { entryId: string; project?: string; day?: string; person?: string; hoursBefore?: number };

export type StoredEntry = { userId: string; projectId: string; projectName: string; day: string; hours: number; billable: boolean; note: string | null; personName: string; own: boolean; week: WeekRow };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const refuse = (message: string): never => { throw new ToolError(message, "invalid_input"); };

/** The live entry the viewer may fix, with its week; anything else is one "no such entry" refusal. */
export async function storedEntry(v: Viewer, entryId: string): Promise<StoredEntry> {
  const found = await read(v, async (tx) => {
    const [e] = await tx.execute(sql`select e.user_id, e.project_id, to_char(e.day, 'YYYY-MM-DD') as day, e.hours, e.billable, e.note, w.person_name, row_to_json(w) as week
      from time.entry e join time.week w on w.id = e.week_id where e.id = ${entryId} and e.deleted_at is null`);
    return e && { userId: e.user_id as string, projectId: e.project_id as string, day: e.day as string, hours: Number(e.hours), billable: e.billable as boolean, note: e.note as string | null,
      personName: e.person_name as string, own: e.user_id === v.userId, week: e.week as WeekRow, projectName: (await projectNames(tx)).get(e.project_id as string) ?? "Closed project" };
  });
  if (!found || !mayFix(v, found.userId, found.projectId)) return refuse("there's no such entry you can change; read it with get_timesheet first");
  return found;
}

type Shown = Pick<StoredEntry, "projectName" | "day" | "hours" | "personName" | "own">;

/**
 * Where the card's values differ from the entry. The one rule for both checks: when the card is made
 * (every field required) and when the confirmed write runs (070 review round 1: only the fields the call
 * carries, so a direct MCP call can still name just the entry, but a confirmed card never writes over an
 * entry that changed after it was shown).
 */
export function cardMismatch(found: Shown, a: Omit<CardInput, "entryId">, partial = false): string[] {
  const asked = (x: unknown) => !partial || x !== undefined;
  return [
    asked(a.project) && !same(a.project ?? "", found.projectName) && `project is ${found.projectName}`,
    asked(a.day) && a.day !== found.day && `day is ${found.day}`,
    asked(a.hoursBefore) && found.hours !== a.hoursBefore && `hoursBefore is ${found.hours}`,
    asked(a.person) && !found.own && !same(a.person ?? "", found.personName) && `person is ${found.personName}`,
  ].filter((x): x is string => Boolean(x));
}

/** 070 AC-17 and amendment 2: no card for a week that can't change, or one that doesn't match the entry. */
export async function checkCard(v: Viewer, a: CardInput) {
  const found = await storedEntry(v, a.entryId);
  try { guardFixable(found.week); } catch (e) { refuse((e as Error).message); }
  const wrong = cardMismatch(found, a);
  if (wrong.length) refuse(`the card must match the entry: ${wrong.join(", ")}`);
}
