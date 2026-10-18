import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { getPerson, type PersonRef } from "@amax/hr/contracts";
import { keyflowProfile, lastSync, type KeyflowProfile } from "../contracts";
import { toGoal, toRecognition, toReview } from "./rows";
import { seesScores } from "./scope";

// keyflow:profile may be held for anyone hr:read reaches (HR, Leadership, PM) or only for oneself
// ("@own"); hr's getPerson applies its own data scope on top.
const readProfiles = <T>(viewer: Viewer, fn: (tx: Tx, may: (p: PersonRef) => boolean) => Promise<T>) => {
  if (!canEver(viewer, "keyflow:profile")) throw new ForbiddenError("keyflow:profile", "keyflow");
  return withTenant(getRuntime().db, viewer.tenantId, (tx) => fn(tx, (p) => can(viewer, "keyflow:profile", { ownerUserId: p.userId, legalEntityId: p.legalEntityId })));
};

/** A person's Keyflow goals, scores and recognition, by employee number or id; scores masked per 002 performance. */
export const personProfile = (viewer: Viewer, idOrEmployeeNo: string): Promise<KeyflowProfile | null> => readProfiles(viewer, async (tx, may) => {
  const person = await getPerson(tx, viewer, idOrEmployeeNo);
  return person && may(person) ? keyflowProfile(tx, viewer, person.id) : null;
});

/** The Performance page: the profile and when the sync last ran. */
export const performanceView = (viewer: Viewer, employeeNo: string) => readProfiles(viewer, async (tx, may) => {
  const person = await getPerson(tx, viewer, employeeNo);
  if (!person || !may(person)) return null;
  return { profile: (await keyflowProfile(tx, viewer, person.id))!, syncedAt: (await lastSync(tx)).lastRunAt };
});

export type KeyflowRecord = { id: string; kind: "goal" | "review" | "recognition"; personId: string; personName: string; record: unknown };

/** One goal, review score or recognition by its id, for a pin; a review score is masked unless the viewer may see it. */
export const getRecord = (viewer: Viewer, recordId: string): Promise<KeyflowRecord | null> => readProfiles(viewer, async (tx, may) => {
  const [r] = await tx.execute(sql`select 'goal' as kind, to_jsonb(g) as row from keyflow.goal g where id = ${recordId}
    union all select 'review', to_jsonb(s) from keyflow.review_score s where id = ${recordId}
    union all select 'recognition', to_jsonb(k) from keyflow.recognition k where id = ${recordId}`);
  if (!r) return null;
  const row = r.row as Record<string, unknown>;
  const person = await getPerson(tx, viewer, row.person_id as string);
  if (!person || !may(person)) return null;
  const kind = r.kind as KeyflowRecord["kind"];
  const record = kind === "goal" ? toGoal(row) : kind === "recognition" ? toRecognition(row) : seesScores(viewer, person) ? toReview(row) : { masked: true, class: "performance" };
  return { id: recordId, kind, personId: person.id, personName: person.name, record };
});
