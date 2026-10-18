// One person's career as events. Dates are ISO days; a project's months are the first of each month.

/** Where an event came from and who stood behind it (AC-4). `recordedFor` makes "agent for <person>". */
export type Trace = {
  recordedBy: string | null; recordedFor: string | null; recordedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  source: { module: string; label: string; href: string | null }; traceRef: string | null;
};

export type Technology = { name: string; proposed: boolean };
export type AllocationMonth = { month: string; percent: number };

type Base = { id: string; on: string; trace: Trace };
export type Joined = Base & { kind: "joined"; grade: string; department: string; entity: string };
export type GradeChange = Base & { kind: "grade"; before: string; after: string };
export type Move = Base & { kind: "move"; field: "manager" | "department" | "entity"; before: string | null; after: string };
export type Project = Base & { kind: "project"; project: string; name: string; client: string | null; months: AllocationMonth[]; technologies: Technology[] };
export type Certification = Base & { kind: "certification"; name: string; issuer: string | null; expiresOn: string | null };
export type Proposal = Base & { kind: "technology"; project: string; projectName: string; names: string[] };

export type CareerEvent = Joined | GradeChange | Move | Project | Certification | Proposal;
export type CareerKind = CareerEvent["kind"];
