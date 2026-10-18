import { can, ScopeError, type Viewer } from "@amax/auth";
import { ForbiddenError, isSystemContext, type ServiceContext } from "@amax/core/server";
import { READ } from "./context";

/** Who reads: a signed-in viewer, or a ServiceContext (a system job, or a call acting for a viewer). */
export type Reader = Viewer | ServiceContext;
export type Resolved = { kind: "viewer"; viewer: Viewer } | { kind: "system" };

/** A ServiceContext reads as its viewer; without one only a context core issued with contextFor.job may read. Fails closed. */
export function readerOf(r: Reader): Resolved {
  if (!("actor" in r)) return { kind: "viewer", viewer: r };
  if (r.viewer) return { kind: "viewer", viewer: r.viewer as Viewer };
  if (isSystemContext(r)) return { kind: "system" };
  throw new ScopeError(READ);
}

export const mayRead = (who: Resolved) => who.kind === "system" || can(who.viewer, READ);

export function assertRead(who: Resolved) {
  if (!mayRead(who)) throw new ForbiddenError(READ, "compliance");
  return who;
}
