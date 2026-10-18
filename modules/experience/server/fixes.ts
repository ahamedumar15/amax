import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { canEver, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { mine } from "./groups";
import { fixDetail, fixTitle, issues } from "./phrases";
import { OWN, read, todayOf } from "./read";

/** One fix with its evidence: how many devices, first seen, the likely cause, and any remediation. Never which devices. */
export const getFix = (v: Viewer, issueId: string) => read(v, async (tx) => {
  const [i] = await issues(tx, sql`id = ${issueId}`);
  if (!i) return null;
  const today = await todayOf(tx);
  const [r] = await tx.execute(sql`select status, outcome, approved_at from experience.remediation where issue_id = ${issueId} order by approved_at desc limit 1`);
  return { ...i, fixTitle: fixTitle(i), detail: fixDetail(i, today), remediation: r ? { status: r.status as string, outcome: (r.outcome as string | null) ?? null } : null };
});

/** The viewer's own devices and score (AC-3): the only person-level read. */
export const myView = (v: Viewer) => {
  if (!canEver(v, OWN)) throw new ForbiddenError(OWN, "experience");
  return withTenant(getRuntime().db, v.tenantId, (tx) => mine(tx, v.userId));
};
