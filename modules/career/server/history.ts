import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { CareerEvent, Proposal, Technology } from "../contracts";
import { asDay, asTime } from "./read";

export type Imported = { through: string; source: string } | null;

/** The person's cutover: events up to `through` come from the imported history. */
export async function importOf(tx: Tx, personId: string): Promise<Imported> {
  const [r] = await tx.execute(sql`select through, source from career.import where person_id = ${personId}`);
  return r ? { through: asDay(r.through), source: r.source as string } : null;
}

export async function historyOf(tx: Tx, personId: string): Promise<CareerEvent[]> {
  const rows = await tx.execute(sql`select * from career.history where person_id = ${personId} order by effective_on, id`);
  return rows.map((r) => ({
    ...(r.detail as object), id: r.id as string, kind: r.kind, on: asDay(r.effective_on),
    ...(r.kind === "project" ? { technologies: [] } : {}),
    trace: { recordedBy: (r.recorded_by as string | null) ?? null, recordedFor: (r.recorded_for as string | null) ?? null, recordedAt: asTime(r.recorded_at),
      approvedBy: (r.approved_by as string | null) ?? null, approvedAt: asTime(r.approved_at),
      source: { module: r.source_module as string, label: r.source_label as string, href: (r.source_href as string | null) ?? null }, traceRef: (r.trace_ref as string | null) ?? null },
  }) as CareerEvent);
}

type Tag = { id: string; project: string; name: string; proposed: boolean; source: string; by: string; for: string | null; at: string };

export async function tagsOf(tx: Tx, personId: string): Promise<Tag[]> {
  return (await tx.execute(sql`select * from career.technology where person_id = ${personId} order by proposed_at, name`)).map((r) => ({
    id: r.id as string, project: r.project as string, name: r.name as string, proposed: r.status === "proposed", source: r.source as string,
    by: r.proposed_by as string, for: (r.proposed_for as string | null) ?? null, at: asTime(r.proposed_at)!,
  }));
}

/** Each project's leaves (confirmed first, then proposed), and one "proposed" event per batch the agent put forward. */
export function withTags(events: CareerEvent[], tags: Tag[], names: Map<string, string>): CareerEvent[] {
  const leaves = (project: string): Technology[] => [...tags.filter((t) => t.project === project && !t.proposed), ...tags.filter((t) => t.project === project && t.proposed)].map((t) => ({ name: t.name, proposed: t.proposed }));
  const batches = new Map<string, Tag[]>();
  for (const t of tags.filter((x) => x.proposed)) {
    const key = `${t.project}|${t.at.slice(0, 10)}|${t.by}|${t.for}`;
    batches.set(key, [...(batches.get(key) ?? []), t]);
  }
  const proposals = [...batches.values()].map(([t, ...rest]): Proposal => ({
    id: t.id, kind: "technology", on: t.at.slice(0, 10), project: t.project, projectName: names.get(t.project) ?? t.project, names: [t, ...rest].map((x) => x.name),
    trace: { recordedBy: t.by, recordedFor: t.for, recordedAt: t.at, approvedBy: null, approvedAt: null, source: { module: "delivery", label: `From the ${t.source}`, href: null }, traceRef: null },
  }));
  return [...events.map((e) => (e.kind === "project" ? { ...e, technologies: leaves(e.project) } : e)), ...proposals];
}
