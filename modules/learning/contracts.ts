// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction; people are hr.person ids, so a caller resolves names through hr's contract.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const KINDS = ["certification", "workshop", "compliance", "leadership", "course"] as const;
export type ProgrammeKind = (typeof KINDS)[number];
export type ProgrammeStatus = "planned" | "running" | "done";
/** The completion rate the Learning screen measures optional programmes against. */
export const COMPLETION_TARGET = 80;

export type ProgrammeRef = { id: string; number: string; title: string; kind: ProgrammeKind; delivery: "internal" | "external"; mandatory: boolean; startsOn: string; endsOn: string | null };
export type CertificationRef = { id: string; personId: string; name: string; issuer: string | null; issuedOn: string; expiresOn: string | null };

export const EVENTS = {
  programmeCreated: "learning.programme.created",
  enrolled: "learning.enrolment.created",
  completed: "learning.enrolment.completed",
  certificationRecorded: "learning.certification.recorded",
  certificationExpiring: "learning.certification.expiring",
} as const;
export type ProgrammeCreated = { programmeId: string; number: string; title: string; kind: ProgrammeKind; mandatory: boolean; by: string };
export type Enrolled = { programmeId: string; personIds: string[]; by: string };
export type Completed = { enrolmentId: string; programmeId: string; personId: string; completedOn: string; by: string };
export type CertificationRecorded = { certificationId: string; personId: string; name: string; expiresOn: string | null; by: string };
/** A reminder is due: notifications (030) turns it into a message to the person; `kind` says whether a person asked for it. */
export type CertificationExpiring = { certificationId: string; personId: string; name: string; expiresOn: string; daysLeft: number; kind: "scheduled" | "manual"; by: string };

export const numberOf = (n: number) => `LP-${String(n).padStart(4, "0")}`;
export const dayOf = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Planned before its start, done after its end, otherwise running. */
export const statusOn = (p: { startsOn: string; endsOn: string | null }, on: string): ProgrammeStatus =>
  p.startsOn > on ? "planned" : p.endsOn !== null && p.endsOn < on ? "done" : "running";

export const toProgrammeRef = (r: Record<string, unknown>): ProgrammeRef => ({
  id: r.id as string, number: numberOf(Number(r.number)), title: r.title as string, kind: r.kind as ProgrammeKind, delivery: r.delivery as "internal" | "external",
  mandatory: Boolean(r.mandatory), startsOn: dayOf(r.starts_on)!, endsOn: dayOf(r.ends_on),
});

const toCertRef = (r: Record<string, unknown>): CertificationRef => ({
  id: r.id as string, personId: r.person_id as string, name: r.name as string, issuer: (r.issuer as string | null) ?? null, issuedOn: dayOf(r.issued_on)!, expiresOn: dayOf(r.expires_on),
});

export async function listProgrammeRefs(tx: Tx): Promise<ProgrammeRef[]> {
  return (await tx.execute(sql`select * from learning.programme order by number`)).map(toProgrammeRef);
}

/** One person's certifications, soonest expiry first; those without an expiry last. */
export async function certificationsOf(tx: Tx, personId: string): Promise<CertificationRef[]> {
  return (await tx.execute(sql`select * from learning.certification where person_id = ${personId} order by expires_on nulls last, name`)).map(toCertRef);
}

/** Certifications still valid on `on` that lapse on or before `until`, soonest first. */
export async function expiringCertifications(tx: Tx, on: string, until: string): Promise<CertificationRef[]> {
  return (await tx.execute(sql`select * from learning.certification where expires_on >= ${on}::date and expires_on <= ${until}::date order by expires_on, name`)).map(toCertRef);
}
