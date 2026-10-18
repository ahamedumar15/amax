import type { Tx } from "@amax/db";
import { listAllocations } from "@amax/allocations/contracts";
import type { ProjectRef } from "@amax/delivery/contracts";
import type { PersonRef, Reader } from "@amax/hr/contracts";
import { certificationsOf } from "@amax/learning/contracts";
import type { CareerEvent, Project } from "../contracts";
import { hrEvents } from "./live-hr";
import { eventId } from "./read";
import { traceOf } from "./trace";

export type Sources = { allocations: boolean; learning: boolean; delivery: boolean };

async function projects(tx: Tx, reader: Reader, tenantId: string, person: PersonRef, from: string, today: string, refs: ProjectRef[]): Promise<Project[]> {
  const { rows } = await listAllocations(tx, reader, { from, to: today, personIds: [person.id] });
  const groups = new Map<string, typeof rows>();
  for (const a of rows) {
    const key = a.projectId ?? `work:${a.work}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return Promise.all([...groups].map(async ([key, list]): Promise<Project> => {
    const ref = refs.find((r) => r.id === key);
    return { id: eventId(`allocations:${person.id}:${key}`), kind: "project", on: list[0].month, project: ref?.key ?? key, name: ref?.name ?? list[0].work ?? "Delivery project", client: ref?.client ?? null,
      months: list.map((a) => ({ month: a.month, percent: a.percent })), technologies: [], trace: await traceOf(tx, tenantId, list[0].id, { module: "allocations", label: "Allocation plan", href: "/allocations" }) };
  }));
}

/** What hr, allocations and learning hold after the cutover, read through their contracts (AC-1). */
export async function liveOf(tx: Tx, reader: Reader, tenantId: string, person: PersonRef, cut: string | null, today: string, on: Sources, refs: ProjectRef[]): Promise<CareerEvent[]> {
  const after = (day: string) => !cut || day > cut;
  const hr = (await hrEvents(tx, reader, tenantId, person)).filter((e) => after(e.on));
  const from = cut ?? person.joinedOn ?? today;
  const work = on.allocations ? (await projects(tx, reader, tenantId, person, from, today, refs)).map((p) => ({ ...p, months: p.months.filter((m) => after(m.month)) })).filter((p) => p.months.length) : [];
  const certs = on.learning ? await Promise.all((await certificationsOf(tx, person.id)).filter((c) => after(c.issuedOn)).map(async (c): Promise<CareerEvent> => ({
    id: c.id, kind: "certification", on: c.issuedOn, name: c.name, issuer: c.issuer, expiresOn: c.expiresOn, trace: await traceOf(tx, tenantId, c.id, { module: "learning", label: "Certification record", href: "/learning" }),
  }))) : [];
  return [...hr, ...work, ...certs];
}
