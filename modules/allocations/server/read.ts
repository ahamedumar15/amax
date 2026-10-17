import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";

/** Every allocations screen read: needs allocations:read, runs under the viewer's tenant. */
export const readAlloc = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "allocations:read")) throw new ForbiddenError("allocations:read", "allocations");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
