import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { mayFix } from "./entry";
import { projectNames, read } from "./read";

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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function checkCard(v: Viewer, a: CardInput) {
  const found = await read(v, async (tx) => {
    const [e] = await tx.execute(sql`select e.user_id, e.project_id, to_char(e.day, 'YYYY-MM-DD') as day, e.hours, w.person_name
      from time.entry e join time.week w on w.id = e.week_id where e.id = ${a.entryId} and e.deleted_at is null`);
    if (!e) return null;
    return { userId: e.user_id as string, projectId: e.project_id as string, day: e.day as string, hours: Number(e.hours), personName: e.person_name as string,
      projectName: (await projectNames(tx)).get(e.project_id as string) ?? "Closed project" };
  });
  if (!found || !mayFix(v, found.userId, found.projectId)) throw new ToolError("there's no such entry you can change; read it with get_timesheet first", "invalid_input");
  const own = found.userId === v.userId;
  const wrong = [
    !same(a.project ?? "", found.projectName) && `project is ${found.projectName}`,
    a.day !== found.day && `day is ${found.day}`,
    found.hours !== a.hoursBefore && `hoursBefore is ${found.hours}`,
    !own && !same(a.person ?? "", found.personName) && `person is ${found.personName}`,
  ].filter(Boolean);
  if (wrong.length) throw new ToolError(`the card must match the entry: ${wrong.join(", ")}`, "invalid_input");
}
