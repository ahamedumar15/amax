import { sql } from "drizzle-orm";
import { textArray, withTenant, type Db } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { repinAll, type Pin, type Repin } from "./pins";

export { relabel, repinAll, repinOf, type Repin } from "./pins";

/**
 * Applies a repin to every saved conversation of this person, so History reopens them with working
 * pins (057). Chat's own transcript state: owner-scoped, like the rest of chat.conversation.
 * Returns the pins of `conversationId` as now saved.
 */
export async function repinConversations(db: Db, viewer: Viewer, conversationId: string, repin: Repin): Promise<Pin[]> {
  return withTenant(db, viewer.tenantId, async (tx) => {
    const rows = await tx.execute(sql`select id, pins from chat.conversation where user_id = ${viewer.userId}
      and exists (select 1 from jsonb_array_elements(pins) p where p->>'tool' = any(${textArray(repin.tools)}))`);
    for (const r of rows) {
      const before = (r.pins ?? []) as Pin[];
      const after = repinAll(before, repin);
      if (JSON.stringify(after) !== JSON.stringify(before)) await tx.execute(sql`update chat.conversation set pins = ${JSON.stringify(after)}::jsonb where id = ${r.id} and user_id = ${viewer.userId}`);
    }
    const [mine] = await tx.execute(sql`select pins from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId}`);
    return ((mine?.pins ?? []) as Pin[]);
  });
}
