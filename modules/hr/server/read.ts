import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";

/** Every HR screen read: needs hr:read, runs under the viewer's tenant. */
export const readHr = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "hr:read")) throw new ForbiddenError("hr:read", "hr");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
