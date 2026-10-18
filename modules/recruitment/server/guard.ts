import { assertCan, viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";

/** The viewer acting (if any) must hold the write's permission in the record's legal entity. */
export function mayAct(ctx: ServiceContext, action: string, legalEntityId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { legalEntityId });
}
