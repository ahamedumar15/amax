import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import type { RunStatus } from "../contracts";
import { iso } from "./rows";

export type RunRow = { id: string; startedAt: string; finishedAt: string; status: RunStatus; peopleOut: number; teamsOut: number; goalsIn: number; reviewsIn: number; recognitionIn: number; errors: number; failure: string | null; startedBy: string };
export type ErrorRow = { id: string; kind: "refused" | "unmatched" | "invalid"; personId: string | null; personName: string | null; externalRef: string | null; message: string; runs: number; firstSeenAt: string; lastSeenAt: string; dismissedAt: string | null; dismissedBy: string | null };
type Row = Record<string, unknown>;

export const read = async <T>(viewer: Viewer, permission: string, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, permission)) throw new ForbiddenError(permission, "keyflow");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const toRun = (r: Row): RunRow => ({
  id: r.id as string, startedAt: iso(r.started_at)!, finishedAt: iso(r.finished_at)!, status: r.status as RunStatus, peopleOut: Number(r.people_out), teamsOut: Number(r.teams_out),
  goalsIn: Number(r.goals_in), reviewsIn: Number(r.reviews_in), recognitionIn: Number(r.recognition_in), errors: Number(r.errors), failure: (r.failure as string | null) ?? null, startedBy: r.started_by as string,
});
export const toError = (r: Row): ErrorRow => ({
  id: r.id as string, kind: r.kind as ErrorRow["kind"], personId: (r.person_id as string | null) ?? null, personName: (r.person_name as string | null) ?? null, externalRef: (r.external_ref as string | null) ?? null,
  message: r.message as string, runs: Number(r.runs), firstSeenAt: iso(r.first_seen_at)!, lastSeenAt: iso(r.last_seen_at)!, dismissedAt: iso(r.dismissed_at), dismissedBy: (r.dismissed_by as string | null) ?? null,
});

export const runsOf = async (tx: Tx, limit: number) => (await tx.execute(sql`select * from keyflow.sync_run order by finished_at desc limit ${limit}`)).map(toRun);
export const openErrors = async (tx: Tx) => (await tx.execute(sql`select * from keyflow.sync_error where dismissed_at is null order by (kind = 'refused') desc, first_seen_at, coalesce(person_name, external_ref), id`)).map(toError);

export async function totals(tx: Tx) {
  const [r] = await tx.execute(sql`select
    (select count(*) from keyflow.link where kind = 'person')::int as people, (select count(*) from keyflow.link where kind = 'team')::int as teams,
    (select count(*) from keyflow.goal)::int as goals, (select count(*) from keyflow.review_score)::int as reviews, (select count(*) from keyflow.recognition)::int as recognition`);
  return { out: { people: Number(r.people), teams: Number(r.teams) }, in: { goals: Number(r.goals), reviews: Number(r.reviews), recognition: Number(r.recognition) } };
}
