import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, ScopeError, viewerOf } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

import { employmentAt, subjectOf, today } from "./inforce";

export { today, subjectOf };
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, e.g. 2026-11-02");

/**
 * HR writes are scoped by legal entity: an HR role limited to Australia can't change Sri Lankan records.
 * Fails closed: without a viewer to check, only a context core issued for a job (contextFor.job) may write.
 */
export function inScope(ctx: ServiceContext, action: string, subject: { legalEntityId: string; department: string | null }) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { legalEntityId: subject.legalEntityId, department: subject.department });
  else if (!isSystemContext(ctx)) throw new ScopeError(action);
}

/** The person, locked, with the department in force today (for the write scope). */
export async function personByNo(tx: Tx, employeeNo: string) {
  const [p] = await tx.execute(sql`select p.*, emp.department from hr.person p ${employmentAt(today())} where p.employee_no = ${employeeNo} for update of p`);
  if (!p) throw new Error(`no person ${employeeNo}`);
  return p;
}
