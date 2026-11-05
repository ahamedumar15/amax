import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { getProjectRef, type ProjectRef } from "@amax/delivery/contracts";
import { listPeople } from "@amax/hr/contracts";
import { listAllocations } from "../contracts";
import { windowMonths } from "./months";
import { readAlloc } from "./read";

// 081 amendment 6: `userId` (null for someone with no sign-in) lets chat name a person as a proposal's owner.
export type TeamMember = { personId: string; userId: string | null; employeeNo: string; name: string; role: string; percents: (number | null)[] };
export type ProjectTeam = { project: ProjectRef; months: string[]; people: TeamMember[]; hidden: number };

export async function teamIn(tx: Tx, v: Viewer, projectKey: string, today: Date): Promise<ProjectTeam | null> {
  const project = await getProjectRef(tx, projectKey);
  if (!project) return null;
  const months = windowMonths(today, 3);
  const { rows, hidden } = await listAllocations(tx, v, { from: months[0], to: months[2], projectIds: [project.id] });
  const people = await listPeople(tx, v, { ids: [...new Set(rows.map((r) => r.personId))] });
  return {
    project, months, hidden,
    people: people.map((p) => ({
      personId: p.id, userId: p.userId, employeeNo: p.employeeNo, name: p.name, role: p.title,
      percents: months.map((m) => rows.find((r) => r.personId === p.id && r.month === m)?.percent ?? null),
    })).sort((a, b) => (b.percents[0] ?? 0) - (a.percents[0] ?? 0) || a.name.localeCompare(b.name)),
  };
}

export const teamFor = (v: Viewer, projectKey: string, today = new Date()) => readAlloc(v, (tx) => teamIn(tx, v, projectKey, today));
