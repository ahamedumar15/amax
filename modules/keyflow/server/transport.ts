import { z } from "zod";
import { GOAL_STATUSES } from "../contracts";

// What amax sends Keyflow and what Keyflow sends back. People and teams go out keyed by amax's own
// ids (`ref`); goals, review scores and recognition come back naming the person by that ref. Every
// record from Keyflow is untrusted: each one is checked here, and one bad record is an error row,
// never a failed sync.
export type OutPerson = { ref: string; employeeNo: string; name: string; title: string; team: string | null; managerRef: string | null; status: "active" | "joining" | "left"; joinedOn: string | null };
export type OutTeam = { ref: string; name: string; members: number };
export type Batch = { people: OutPerson[]; teams: OutTeam[] };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const ref = z.string().min(1).max(100);

export const InGoal = z.object({ id: ref, personRef: ref, title: text(300), status: z.enum(GOAL_STATUSES), progress: z.number().int().min(0).max(100), dueOn: date.nullable().default(null), period: text(40).nullable().default(null) });
export const InReview = z.object({ id: ref, personRef: ref, cycle: text(80), score: z.number().min(0), scale: z.number().positive(), rating: text(80).nullable().default(null), reviewedOn: date })
  .refine((r) => r.score <= r.scale, "score is above its scale");
export const InRecognition = z.object({ id: ref, personRef: ref, fromName: text(120), message: text(1000), givenOn: date });
export type InGoal = z.infer<typeof InGoal>;
export type InReview = z.infer<typeof InReview>;
export type InRecognition = z.infer<typeof InRecognition>;

export const PushReply = z.object({ refused: z.array(z.object({ ref, reason: text(500) })).max(10_000).default([]) });
export const ChangesReply = z.object({
  goals: z.array(z.unknown()).max(50_000).default([]),
  reviews: z.array(z.unknown()).max(50_000).default([]),
  recognition: z.array(z.unknown()).max(50_000).default([]),
  cursor: z.string().max(200).nullable().default(null),
});
export type PushReply = z.infer<typeof PushReply>;
export type ChangesReply = z.infer<typeof ChangesReply>;

export type KeyflowTransport = {
  push: (batch: Batch) => Promise<PushReply>;
  changes: (cursor: string | null) => Promise<ChangesReply>;
};

/** A failure talking to Keyflow: its message is what the sync screen shows, so it never carries the key. */
export class KeyflowError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "KeyflowError";
  }
}
