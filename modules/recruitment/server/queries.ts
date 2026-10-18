import { sql } from "drizzle-orm";
import { mask, type Viewer } from "@amax/auth";
import { listOpenRoles } from "../contracts";
import type { CvSection } from "./match";
import { levelOf, quarterOf, read } from "./read";
import { appRows } from "./rows";
import { funnelOf, hiresByMonth, lanesOf, statsOf } from "./view";

export type { AppRow } from "./rows";

/** Every candidate field the read tools return; declared `sensitive` so chat redacts them (002). */
export const CANDIDATE_SENSITIVE = { name: "candidate", initials: "candidate", email: "candidate", cv: "candidate", evidence: "candidate" } as const;

/** The whole screen: open roles, the four stats, the board, the funnel and hires per month; one role's when `roleId` is set. */
export const pipelineView = (v: Viewer, roleId?: string) => read(v, async (tx) => {
  const all = await listOpenRoles(tx, v);
  const roles = roleId ? all.filter((r) => r.id === roleId) : all;
  const rows = await appRows(tx, v, { roleId });
  return {
    roles: all, role: roleId ? (roles[0] ?? null) : null, quarter: quarterOf(), stats: statsOf(roles, rows), lanes: lanesOf(rows), funnel: funnelOf(rows), monthly: hiresByMonth(rows),
    seesCandidates: rows.some((r) => typeof r.name === "string"),
  };
});
export type PipelineView = Awaited<ReturnType<typeof pipelineView>>;

/** One application with its stage history, the agent's evidence and (for HR) the CV; null when the viewer may not see it. */
export const getApplication = (v: Viewer, applicationId: string) => read(v, async (tx) => {
  const [row] = await appRows(tx, v, { applicationId });
  if (!row) return null;
  const [c] = await tx.execute(sql`select c.cv from recruitment.application a join recruitment.candidate c on c.id = a.candidate_id where a.id = ${applicationId}`);
  return mask(v, { ...row, cv: (c.cv as CvSection[]) ?? [] }, { cv: "candidate" }, { legalEntityId: row.legalEntityId });
});

/** One role: its openings, skills, who raised it, and its applications by stage. */
export const getRole = (v: Viewer, roleId: string) => read(v, async (tx) => {
  const [r] = await tx.execute(sql`select * from recruitment.role where id = ${roleId}`);
  if (!r || !levelOf(v, r.legal_entity_id as string)) return null;
  const rows = await appRows(tx, v, { roleId });
  return {
    id: r.id as string, title: r.title as string, department: r.department as string, legalEntityId: r.legal_entity_id as string, openings: Number(r.openings), status: r.status as string,
    skills: r.skills as string[], raisedBy: r.raised_by as string, reason: (r.reason as string | null) ?? null,
    lanes: lanesOf(rows).map((l) => ({ stage: l.stage, label: l.label, count: l.count, applications: l.cards.map((c) => ({ id: c.id, name: c.name, agentScore: c.agentScore, matchScore: c.matchScore })) })),
  };
});
