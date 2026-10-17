import type { Viewer } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";

export const adminContext = (viewer: Viewer): ServiceContext => ({
  tenantId: viewer.tenantId,
  actor: { id: `user:${viewer.userId}`, kind: "user", roles: viewer.actualRoles },
  source: "ui",
  viewer,
});
