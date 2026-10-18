import { canSee, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

/** Who reads: a signed-in viewer, or a ServiceContext (a system job, or a call acting for a viewer). */
export type Reader = Viewer | ServiceContext;

/** Review scores (002 performance): HR, Leadership, the person and their manager; system code core issued. Fails closed. */
export function seesScores(r: Reader, person: { userId: string | null; legalEntityId: string }): boolean {
  if (!("actor" in r)) return canSee(r, "performance", { ownerUserId: person.userId, legalEntityId: person.legalEntityId });
  if (r.viewer) return seesScores(r.viewer as Viewer, person);
  return isSystemContext(r);
}
