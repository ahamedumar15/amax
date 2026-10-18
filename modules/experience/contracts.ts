// The only import surface for other modules (docs/module-standard.md). Groups of 5 or more people
// only: no contract returns a device, a reading or a named person's score, except the person's own.
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";
import { dropsOf, groupScores as scores, mine } from "./server/groups";

export const DIMENSIONS = ["department", "site", "model"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const CHOICES = ["well", "sometimes", "a-lot"] as const;
export type Choice = (typeof CHOICES)[number];
export const CHOICE_LABEL: Record<Choice, string> = { well: "Works well", sometimes: "Gets in the way sometimes", "a-lot": "Gets in the way a lot" };
export const CHOICE_VALUE: Record<Choice, number> = { well: 10, sometimes: 5, "a-lot": 0 };

/** k-anonymity: no group under 5 people (or 5 answers) is ever reported; the screen lists five groups and "Other". */
export const MIN_GROUP = 5;
export const SHOWN_GROUPS = 5;
/** At most one pulse a fortnight (AC-4). */
export const PULSE_EVERY_DAYS = 14;
export const FORMULA = "Score = 40% device health + 40% app reliability + 20% pulse, each out of 10";

/** AC-1: everything collected, per table. A test fails if the schema gains a column outside this list. */
export const COLLECTED = {
  device: ["id", "tenant_id", "external_id", "model", "owner_user_id", "person_id", "legal_entity_id", "department", "last_seen_at"],
  device_day: ["tenant_id", "device_id", "owner_user_id", "day", "collected_at", "startup_score", "boot_seconds", "app_score", "crashes", "hangs", "battery_pct", "risk"],
  device_app_day: ["tenant_id", "device_id", "owner_user_id", "day", "collected_at", "app", "app_version", "crashes", "hangs"],
} as const;

export const FIX_KIND = "experience.fix";
export const AGENT = "agent:experience";
export const JOBS = { collect: "experience.collect", remediate: "experience.remediate" } as const;
/** The 031 connectors: 021's read registration for collection, its write registration for an approved remediation. */
export const READ_CONNECTOR = "msgraph-read" as const;
export const WRITE_CONNECTOR = "msgraph-write" as const;

export const EVENTS = {
  collected: "experience.collection.completed",
  collectionSet: "experience.collection.set",
  pulseSent: "experience.pulse.sent",
  fixAccepted: "experience.fix.accepted",
  scoreDropped: "experience.score.dropped",
} as const;
export type CollectionCompleted = { devices: number; entities: number; issues: number };
export type CollectionSet = { legalEntityId: string; enabled: boolean; noticeOn: string | null; by: string };
/** One per recipient, for 030's rule: the person and the question, never an answer. */
export type PulseSent = { pulseId: string; userId: string; question: string };
export type FixAccepted = { issueId: string; fix: "remediation" | "ticket"; devices: number; by: string };
export type ScoreDropped = { dimension: Dimension; group: string; from: number; to: number; asOf: string };

export type GroupScore = { dimension: Dimension; group: string; members: string[]; people: number; score: number; device: number; app: number; pulse: number | null };
/** 026's InsightSource shape: where the figure comes from and where to see it. */
export type ScoreDrop = ScoreDropped & { source: { label: string; evidenceRef: string } };
export type MyExperience = { score: number | null; devices: { model: string; device: number; app: number; risk: string }[] };

type Reader = Viewer | ServiceContext;

/** Group scores for groups of 5 or more people, in the legal entities the reader may see. */
export const groupScores = (tx: Tx, reader: Reader, dimension: Dimension): Promise<GroupScore[]> => scores(tx, reader, dimension);
/** Groups whose score fell 1 point or more against four weeks earlier, each with its source (for 026). */
export const scoreDrops = (tx: Tx, reader: Reader): Promise<ScoreDrop[]> => dropsOf(tx, reader);
/** The viewer's own devices and score: the only person-level read, and only ever for themself. */
export const myExperience = (tx: Tx, viewer: Viewer): Promise<MyExperience> => mine(tx, viewer.userId);
