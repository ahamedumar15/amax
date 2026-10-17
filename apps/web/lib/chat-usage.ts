import { aiUsage } from "@amax/ai/usage";
import { costLabel, plural } from "@amax/ai/usage-format";
import { rolesOf, type Viewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { getDb } from "./server";

/** The chat footer: the signed-in person's own AI usage this month, never anyone else's (048 AC-3). */
export async function myChatUsage(viewer: Viewer): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const { totals } = await aiUsage(db, { tenantId: viewer.tenantId, userId: viewer.userId, roles: rolesOf(viewer) }, { scope: "self" });
    return `This month: ${costLabel(totals)} · ${plural(totals.calls, "call")}`;
  } catch (e) {
    logError("chat.usage", e);
    return null;
  }
}
