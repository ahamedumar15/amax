import { can, contextForViewer, viewerOf, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext, type Source } from "@amax/core/server";
import { withTenant, type Tx } from "@amax/db";

export const READ = "notifications:read";
export const MANAGE = "notifications:manage";

export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => contextForViewer(viewer, source);

/** Notifications are always the viewer's own: every read and write is keyed on their user id. */
export function selfOf(ctx: ServiceContext): string {
  const v = viewerOf(ctx);
  if (!v) throw new ForbiddenError(MANAGE, "notifications");
  return v.userId;
}

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, READ)) throw new ForbiddenError(READ, "notifications");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
