import { aiUsageTotals } from "@amax/ai/usage";
import { costLabel, plural } from "@amax/ai/usage-format";
import { rolesOf, type Viewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { getDb } from "./server";

export async function myChatUsage(viewer: Viewer): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const totals = await aiUsageTotals(db, { tenantId: viewer.tenantId, userId: viewer.userId, roles: rolesOf(viewer) }, { scope: "self" });
    return `This month: ${costLabel(totals)} · ${plural(totals.calls, "call")}`;
  } catch (e) {
    logError("chat.usage", e);
    return null;
  }
}
