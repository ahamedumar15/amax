import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";
import { getPerson, listPeople, type PersonRef } from "@amax/hr/contracts";

/** The person a request is for: the caller, or someone named by employee number or full name that the caller may see in hr. */
export async function personFor(tx: Tx, ctx: ServiceContext, ref?: string): Promise<PersonRef> {
  const v = viewerOf(ctx);
  if (!ref) {
    if (!v) throw new Error("say whose leave this is");
    const me = (await listPeople(tx, ctx, { status: ["active", "joining"] })).find((p) => p.userId === v.userId);
    if (!me) throw new Error("you have no HR record, so there's no leave to request; ask HR to add you");
    return me;
  }
  const byNo = await getPerson(tx, ctx, ref);
  if (byNo) return byNo;
  const named = (await listPeople(tx, ctx, { status: ["active", "joining"] })).filter((p) => p.name.toLowerCase() === ref.trim().toLowerCase());
  if (named.length > 1) throw new Error(`more than one ${ref}; use their employee number`);
  if (!named.length) throw new Error(`no one called ${ref} that you can see`);
  return named[0];
}
