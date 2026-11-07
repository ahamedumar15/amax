import type { Phase } from "../contracts";

/**
 * Review 081 round 1 (B4): the attention rules, once. The list's chips and order (attention.ts), the agent's "Ready to
 * verify" suggestion (agent.ts) and a person's Overview panel (overview.ts) all ask these, so they can't disagree.
 */
export type ReadinessFacts = { phase: Phase; source: string | null; tasksDone: number; tasksTotal: number; withdrawn: boolean };

/**
 * Ready to verify: a proposal made by hand, still open, in Building, with every task done. A spec proposal's phase
 * follows its repo (move_proposal refuses it), so amax never calls one ready: there is nothing to do here.
 */
export const isReadyToVerify = (p: ReadinessFacts) =>
  !p.withdrawn && p.source === null && p.phase === "building" && p.tasksTotal > 0 && p.tasksDone === p.tasksTotal;

/** Over the estimate: approved hours above an estimate it has. */
export const overEstimate = (p: { hours: number; estimateHours: number | null }) => p.estimateHours !== null && p.hours > p.estimateHours;
