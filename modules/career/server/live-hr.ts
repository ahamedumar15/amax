import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { getEmployment, getPerson, listEmploymentPeriods, type PersonRef, type Reader } from "@amax/hr/contracts";
import type { CareerEvent, Move } from "../contracts";
import { eventId } from "./read";
import { traceOf } from "./trace";

type State = { grade: string; manager: string | null; department: string; entity: string };
const FIELDS = ["manager", "department", "entity"] as const;

const entityName = async (tx: Tx, id: string) => ((await tx.execute(sql`select name from core.legal_entity where id = ${id}`))[0]?.name as string | undefined) ?? "Legal entity";

/** Joins, grade changes and moves from hr's employment periods, read as the viewer so hr's scope and masking apply. Pay is never read into an event. */
export async function hrEvents(tx: Tx, reader: Reader, tenantId: string, person: PersonRef): Promise<CareerEvent[]> {
  const out: CareerEvent[] = [];
  let prev: State | null = null;
  for (const p of await listEmploymentPeriods(tx, reader, [person.id])) {
    const e = await getEmployment(tx, person.id, reader, p.startsOn);
    if (!e) continue;
    const manager = e.managerPersonId ? (await getPerson(tx, reader, e.managerPersonId, p.startsOn))?.name ?? "Manager" : null;
    const now: State = { grade: e.grade ?? "No grade recorded", manager, department: p.department, entity: await entityName(tx, p.legalEntityId) };
    const trace = await traceOf(tx, tenantId, e.id, { module: "hr", label: "HR employment period", href: `/hr/p/${encodeURIComponent(person.employeeNo)}` });
    const base = (kind: string) => ({ id: eventId(`hr:${e.id}:${kind}`), on: p.startsOn, trace });
    if (!prev) out.push({ ...base("joined"), kind: "joined", grade: now.grade, department: now.department, entity: now.entity });
    else if (prev.grade !== now.grade) out.push({ ...base("grade"), kind: "grade", before: prev.grade, after: now.grade });
    for (const field of FIELDS) {
      const after = now[field];
      if (after && (prev ? prev[field] !== after : field === "manager")) out.push({ ...base(field), kind: "move", field, before: prev?.[field] ?? null, after } satisfies Move);
    }
    prev = now;
  }
  return out;
}
