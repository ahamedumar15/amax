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

/**
 * 087 AC-1: has no owner: no owner user and no owner name. A row with only a name (made before 081, or named by a sync)
 * is owned, so no suggestion or pin replaces a named owner; linking it to a person is a deliberate update_proposal.
 */
export const hasNoOwner = (p: { ownerUserId: string | null; ownerName: string | null }) => !p.ownerUserId && !p.ownerName;

/** Over the estimate: approved hours above an estimate it has. */
export const overEstimate = (p: { hours: number; estimateHours: number | null }) => p.estimateHours !== null && p.hours > p.estimateHours;
