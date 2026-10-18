import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, type ServiceContext } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";

export const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "learning:read")) throw new ForbiddenError("learning:read", "learning");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

export const today = () => new Date().toISOString().slice(0, 10);
export const yearOf = (on: string) => ({ from: `${on.slice(0, 4)}-01-01`, to: `${on.slice(0, 4)}-12-31` });
export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** The people behind these hr.person ids that the reader may see in hr; anyone else is left out. */
export async function peopleById(tx: Tx, reader: Viewer | ServiceContext, ids: string[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids)];
  return new Map((unique.length ? await listPeople(tx, reader, { ids: unique }) : []).map((p) => [p.id, p]));
}
