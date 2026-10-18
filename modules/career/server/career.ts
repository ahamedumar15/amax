import type { Tx } from "@amax/db";
import { listProjectRefs } from "@amax/delivery/contracts";
import { getPerson, type Reader } from "@amax/hr/contracts";
import type { CareerEvent, CareerKind, Project } from "../contracts";
import { maySee } from "./access";
import { historyOf, importOf, tagsOf, withTags } from "./history";
import { liveOf, type Sources } from "./live";
import { installed, todayOf } from "./read";

export type CareerData = { person: { id: string; employeeNo: string; name: string }; today: string; importedFrom: string | null; notes: string[]; events: CareerEvent[] };

const RANK: Record<CareerKind, number> = { joined: 0, move: 1, grade: 2, project: 3, certification: 4, technology: 5 };
export const inOrder = (a: CareerEvent, b: CareerEvent) => a.on.localeCompare(b.on) || RANK[a.kind] - RANK[b.kind];

const NOTES: Record<keyof Sources, string> = {
  allocations: "Allocations isn't installed, so projects aren't shown.",
  learning: "Learning isn't installed, so certifications aren't shown.",
  delivery: "Delivery isn't installed, so clients and the agent's proposed technologies aren't shown.",
};

/** A live project continues the imported one with the same project; anything else is added. */
const merged = (imported: CareerEvent[], live: CareerEvent[]) => live.reduce((out, e) => {
  const at = e.kind === "project" ? out.findIndex((o) => o.kind === "project" && o.project === e.project) : -1;
  return at < 0 ? [...out, e] : out.map((o, i) => (i === at ? { ...(o as Project), months: [...(o as Project).months, ...(e as Project).months] } : o));
}, imported);

/** One person's career as the reader may see it, oldest first; null when they may not see this person's career. */
export async function careerData(tx: Tx, reader: Reader, tenantId: string, idOrNo: string): Promise<CareerData | null> {
  const person = await getPerson(tx, reader, idOrNo);
  if (!person || !(await maySee(tx, reader, tenantId, person))) return null;
  const today = await todayOf(tx);
  const on: Sources = { allocations: await installed(tx, "allocations.allocation"), learning: await installed(tx, "learning.certification"), delivery: await installed(tx, "delivery.project") };
  const kept = (e: CareerEvent) => e.trace.source.module === "hr" || on[e.trace.source.module as keyof Sources];
  const imp = await importOf(tx, person.id);
  const imported = (await historyOf(tx, person.id)).filter(kept).map((e) => (on.delivery || e.kind !== "project" ? e : { ...e, client: null }));
  const all = merged(imported, await liveOf(tx, reader, tenantId, person, imp?.through ?? null, today, on, on.delivery ? await listProjectRefs(tx) : []));
  const names = new Map(all.flatMap((e) => (e.kind === "project" ? [[e.project, e.name] as const] : [])));
  const tags = (await tagsOf(tx, person.id)).filter((t) => names.has(t.project) && (on.delivery || !t.proposed));
  return {
    person: { id: person.id, employeeNo: person.employeeNo, name: person.name }, today, importedFrom: imp?.source ?? null,
    notes: (Object.keys(NOTES) as (keyof Sources)[]).filter((k) => !on[k]).map((k) => NOTES[k]),
    events: withTags(all, tags, names).filter(kept).sort(inOrder),
  };
}
