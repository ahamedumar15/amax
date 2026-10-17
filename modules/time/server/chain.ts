import { can, canEver, type Viewer } from "@amax/auth";
import type { ApprovalChain } from "../contracts";

export function chainFor(v: Viewer | undefined, ownerId: string, projectIds: string[]): ApprovalChain | null {
  if (!v || ownerId === v.userId) return null;
  if (can(v, "time:approve")) return "admin";
  if (v.reports.includes(ownerId) && canEver(v, "time:approve")) return "manager";
  if (projectIds.some((projectId) => can(v, "time:approve", { projectId }))) return "project";
  return null;
}

export const seesWeek = (v: Viewer, ownerId: string, projectIds: string[]) =>
  ownerId !== v.userId && (can(v, "time:team") || chainFor(v, ownerId, projectIds) !== null);
