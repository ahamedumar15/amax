import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, ScopeError, viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";

export { today } from "./inforce";
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, e.g. 2026-11-02");

/**
 * HR writes are scoped by legal entity: an HR role limited to Australia can't change Sri Lankan records.
 * Fails closed: without a viewer to check, only trusted system code (a job) may write.
 */
export function inScope(ctx: ServiceContext, action: string, legalEntityId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { legalEntityId });
  else if (ctx.actor.kind !== "system") throw new ScopeError(action);
}

export async function personByNo(tx: Tx, employeeNo: string) {
  const [p] = await tx.execute(sql`select * from hr.person where employee_no = ${employeeNo} for update`);
  if (!p) throw new Error(`no person ${employeeNo}`);
  return p;
}
