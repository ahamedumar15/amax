import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import type { Json } from "./types";

export type StartOptions = {
  /** Starting twice with the same key returns the first run instead of a second one. */
  key?: string;
  /** The person the run acts for (recorded on every run and its audit). */
  actsFor?: string | null;
  startedBy: string;
  scheduleId?: string;
  legalEntityId?: string | null;
  /** Start inside the caller's transaction, so the run exists only if the caller's write commits. */
  tx?: Tx;
};

export type RunAction = "pause" | "resume" | "cancel" | "retry";
export type SignalOptions = {
  tx?: Tx;
  /** The event's id (e.g. the outbox event id): delivering the same id twice is a no-op. */
  id?: string;
};
export type WorkflowTickResult = { runs: number; runsFailed: number; schedulesFired: number };

/** What modules and the app talk to. Modules never import an engine; they get this from the host. */
export type WorkflowEngine = {
  kind: "postgres" | "temporal";
  start: (tenantId: string, workflow: string, input: Json, options: StartOptions) => Promise<string>;
  /** Delivers an event to every run waiting for it (payload must contain the wait's match). */
  signal: (tenantId: string, event: string, payload: Json, options?: SignalOptions) => Promise<number>;
  /** One scheduler pass (and, for Postgres, drives due runs). Called from /api/jobs/tick. */
  tick: () => Promise<WorkflowTickResult>;
  /** Pause, resume, cancel or retry, as the signed-in admin (`ctx.viewer` set, needs workflows:admin). */
  control: (ctx: ServiceContext, runId: string, action: RunAction) => Promise<void>;
};
