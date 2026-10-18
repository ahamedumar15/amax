import type { ServiceContext, Source } from "@amax/core/server";
import type { Viewer } from "./viewer";

/**
 * The one way a screen or tool turns the viewer into a service context (review 058 B10). A viewer
 * reached through a service credential carries its principal, so the audit names the credential as the
 * actor (kind "service") acting for the person (AGENTS rule 4); the person's roles still decide what it
 * may do. A signed-in person, in chat, MCP or a screen, is the actor themself.
 */
export function contextForViewer(viewer: Viewer, source: Source = "ui"): ServiceContext {
  if (viewer.principal) {
    return { tenantId: viewer.tenantId, actor: { id: `sp:${viewer.principal.id}`, kind: "service" }, onBehalfOf: `user:${viewer.userId}`, source, viewer };
  }
  return { tenantId: viewer.tenantId, actor: { id: `user:${viewer.userId}`, kind: "user", roles: viewer.actualRoles }, source, viewer };
}
