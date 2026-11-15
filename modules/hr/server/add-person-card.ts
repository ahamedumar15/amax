import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { linkableAccount } from "./link";
import type { ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { withTenant } from "@amax/db";
import { CONTRACTS } from "../contracts";

/** 107: the tool's input; `forProject` only names the project to offer next, once the person is added. */
export const AddPersonInput = z.object({ name: z.string().min(2), title: z.string().min(1), department: z.string().min(1), entity: z.string().min(2), joinedOn: z.string().optional(),
  managerEmployeeNo: z.string().optional(), contract: z.enum(CONTRACTS).optional(), fte: z.number().optional(), grade: z.string().optional(), workEmail: z.string().optional(), forProject: z.string().optional() });
export type AddPerson = z.infer<typeof AddPersonInput>;

const entities = (v: Viewer) => withTenant(getRuntime().db, v.tenantId, (tx) => tx.execute(sql`select name from core.legal_entity order by name`));

const linksTo = (v: Viewer, email?: string) => withTenant(getRuntime().db, v.tenantId, (tx) => linkableAccount(tx, email));

/** Review round 2: the card's note as the work email is typed, from the same rule addPerson links by. */
export const linkNote = async (v: Viewer, a: Partial<AddPerson>) => {
  const account = await linksTo(v, a.workEmail);
  return account ? `Links to ${account.name}'s sign-in` : undefined;
};

/** 107 AC-8: Add NAME to HR, a 106 form: their name and work email as given, title and department typed, entity chips. */
export async function addPersonCard(v: Viewer, a: Partial<AddPerson>): Promise<ToolCard> {
  const who = a.name ?? "someone";
  const [names, note] = await Promise.all([entities(v).then((rows) => rows.map((r) => String(r.name))), linkNote(v, a)]);
  return {
    title: `Add ${who} to HR`, lines: [],
    look: { kind: "Add to HR", confirm: `Add ${who} to HR`, done: `Added ${who} to HR`,
      ...(a.forProject && a.name ? { next: { label: `Add ${a.name} to ${a.forProject}`, prompt: `Add ${a.name} to ${a.forProject}` } } : {}) },
    form: {
      fields: [
        { name: "name", label: "Name", kind: "text" },
        { name: "workEmail", label: "Work email", kind: "text" },
        { name: "title", label: "Title", kind: "text" },
        { name: "department", label: "Department", kind: "text" },
        { name: "entity", label: "Entity", kind: "chips", value: names[0], options: names.map((n) => ({ value: n, label: n })), required: true },
      ],
      confirm: { label: "Add {name} to HR" },
      ...(note ? { note } : {}),
    },
  };
}
