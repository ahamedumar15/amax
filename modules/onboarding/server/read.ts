import { withTenant, type Tx } from "@amax/db";
import { canEver, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext } from "@amax/core/server";

// "Could ever read": a manager holding only onboarding:read@own still reads the checklists with a
// task of theirs; queries.ts narrows the rows to what each viewer may see.
export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!canEver(viewer, "onboarding:read")) throw new ForbiddenError("onboarding:read", "onboarding");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
