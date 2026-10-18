// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction; people are hr.person ids, and the caller checks it may see the person in hr.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export type { AllocationMonth, CareerEvent, CareerKind, Certification, GradeChange, Joined, Move, Project, Proposal, Technology, Trace } from "./layout/events";

export const EVENTS = { technologyTagged: "career.technology.tagged" } as const;
/** A technology was confirmed or added on a person's project; `by` is the actor, "… for …" when acting for someone. */
export type TechnologyTagged = { personId: string; project: string; technology: string; added: boolean; by: string };

export type TechnologyTag = { personId: string; project: string; name: string; status: "proposed" | "confirmed"; source: string };

/** The career route's path under the Person page: `/hr/p/<employeeNo>/career`. */
export const careerHref = (employeeNo: string) => `/hr/p/${encodeURIComponent(employeeNo)}/career`;

/** One person's technology tags, confirmed first, then by project and name. */
export async function technologiesOf(tx: Tx, personId: string): Promise<TechnologyTag[]> {
  return (await tx.execute(sql`select person_id, project, name, status, source from career.technology where person_id = ${personId}
    order by status, project, name`)).map((r) => ({ personId: r.person_id as string, project: r.project as string, name: r.name as string, status: r.status as TechnologyTag["status"], source: r.source as string }));
}
