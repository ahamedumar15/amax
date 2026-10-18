// The only import surface for other modules (docs/module-standard.md). Goals, review scores and
// recognition synced in from Keyflow, per hr.person. Reads go through hr's data scope (a viewer sees
// the people their hr:read reaches, and always themself); review scores are 002 `performance`, so
// only HR, Leadership, the person and their manager see them. Trusted system code sees everything.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Masked } from "@amax/auth";
import { getPerson } from "@amax/hr/contracts";
import { toGoal, toRecognition, toReview } from "./server/rows";
import { seesScores, type Reader } from "./server/scope";

export type { Reader };

export const GOAL_STATUSES = ["on-track", "at-risk", "off-track", "done"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const RUN_STATUSES = ["completed", "completed-with-errors", "failed", "skipped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** 002 classes of a profile's classified fields. */
export const PROFILE_SENSITIVE = { reviews: "performance" } as const;

export const EVENTS = { completed: "keyflow.sync.completed", failed: "keyflow.sync.failed" } as const;
/** Counts only: what went out and what came in, never a person's data. */
export type SyncCompleted = { runId: string; status: RunStatus; peopleOut: number; teamsOut: number; goalsIn: number; reviewsIn: number; recognitionIn: number; errors: number };
export type SyncFailed = { runId: string; failure: string };

export type Goal = { id: string; personId: string; title: string; status: GoalStatus; progress: number; dueOn: string | null; period: string | null };
export type ReviewScore = { id: string; personId: string; cycle: string; score: number; scale: number; rating: string | null; reviewedOn: string };
export type Recognition = { id: string; personId: string; fromName: string; message: string; givenOn: string };
export type KeyflowProfile = { personId: string; userId: string | null; employeeNo: string; name: string; goals: Goal[]; reviews: ReviewScore[] | Masked; recognition: Recognition[] };
export type SyncState = { lastRunAt: string | null; lastStatus: RunStatus | null; openErrors: number };

/** A person's Keyflow goals, review scores and recognition, or null when the reader may not see the person. */
export async function keyflowProfile(tx: Tx, reader: Reader, personId: string): Promise<KeyflowProfile | null> {
  const person = await getPerson(tx, reader, personId);
  if (!person) return null;
  const goals = await tx.execute(sql`select * from keyflow.goal where person_id = ${person.id} order by (status = 'done'), due_on nulls last, title`);
  const reviews = await tx.execute(sql`select * from keyflow.review_score where person_id = ${person.id} order by reviewed_on desc`);
  const recognition = await tx.execute(sql`select * from keyflow.recognition where person_id = ${person.id} order by given_on desc`);
  return {
    personId: person.id, userId: person.userId, employeeNo: person.employeeNo, name: person.name,
    goals: goals.map(toGoal), reviews: seesScores(reader, person) ? reviews.map(toReview) : { masked: true, class: "performance" }, recognition: recognition.map(toRecognition),
  };
}

/** When the sync last ran, how it ended, and how many errors are open. Counts only, no personal data. */
export async function lastSync(tx: Tx): Promise<SyncState> {
  const [run] = await tx.execute(sql`select finished_at, status from keyflow.sync_run order by finished_at desc limit 1`);
  const [errors] = await tx.execute(sql`select count(*)::int as n from keyflow.sync_error where dismissed_at is null`);
  return { lastRunAt: run ? new Date(run.finished_at as string).toISOString() : null, lastStatus: (run?.status as RunStatus | undefined) ?? null, openErrors: Number(errors?.n ?? 0) };
}
