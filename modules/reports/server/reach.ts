import { can, canEver, type Viewer } from "@amax/auth";

// Reports re-apply each source module's visibility, never wider than it. Hours: the whole timesheet
// is visible to its owner, time:team, an unscoped time approver, or a manager who approves time
// (time's chain, less its project-approver path, which reaches single weeks, not a person).
export const seesHours = (v: Viewer, userId: string) =>
  userId === v.userId || can(v, "time:team") || can(v, "time:approve") || (v.reports.includes(userId) && canEver(v, "time:approve"));

// Leave: its owner, their manager, or leave:team in the person's legal entity (leave's own rule).
export const seesLeave = (v: Viewer, p: { userId: string | null; legalEntityId: string }) =>
  (!!p.userId && (p.userId === v.userId || v.reports.includes(p.userId))) || can(v, "leave:team", { legalEntityId: p.legalEntityId });
