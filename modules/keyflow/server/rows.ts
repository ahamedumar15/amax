import type { Goal, GoalStatus, Recognition, ReviewScore } from "../contracts";

type Row = Record<string, unknown>;

export const day = (v: unknown) => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
export const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

export const toGoal = (r: Row): Goal => ({
  id: r.id as string, personId: r.person_id as string, title: r.title as string, status: r.status as GoalStatus, progress: Number(r.progress),
  dueOn: day(r.due_on), period: (r.period as string | null) ?? null,
});
export const toReview = (r: Row): ReviewScore => ({
  id: r.id as string, personId: r.person_id as string, cycle: r.cycle as string, score: Number(r.score), scale: Number(r.scale), rating: (r.rating as string | null) ?? null, reviewedOn: day(r.reviewed_on)!,
});
export const toRecognition = (r: Row): Recognition => ({
  id: r.id as string, personId: r.person_id as string, fromName: r.from_name as string, message: r.message as string, givenOn: day(r.given_on)!,
});
