import type { Viewer } from "@amax/auth";
import type { ServiceContext, Source } from "@amax/core/server";

// A screen or tool acting for the signed-in viewer.
export const ctxFor = (viewer: Viewer, source: Source = "ui"): ServiceContext => ({
  tenantId: viewer.tenantId,
  actor: { id: `user:${viewer.userId}`, kind: "user", roles: viewer.actualRoles },
  source,
  viewer,
});
