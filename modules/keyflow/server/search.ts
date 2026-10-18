import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import type { SearchHit } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";

/** People whose name matches and who have Keyflow goals, scores or recognition the viewer may open. */
export async function peopleWithProfiles(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q || !canEver(viewer, "keyflow:profile")) return [];
  return withTenant(getRuntime().db, viewer.tenantId, async (tx) => {
    const ids = new Set((await tx.execute(sql`select person_id from keyflow.goal union select person_id from keyflow.review_score union select person_id from keyflow.recognition`)).map((r) => r.person_id as string));
    const people = (await listPeople(tx, viewer, { ids: [...ids] })).filter((p) => p.name.toLowerCase().includes(q) && can(viewer, "keyflow:profile", { ownerUserId: p.userId, legalEntityId: p.legalEntityId }));
    return people.slice(0, 10).map((p) => ({ type: "Keyflow performance", id: p.id, title: `${p.name}, performance`, url: `/hr/p/${p.employeeNo}/performance`, summary: "Goals, review scores and recognition from Keyflow" }));
  });
}
