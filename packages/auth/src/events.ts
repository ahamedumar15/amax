import { sql } from "drizzle-orm";
import type { EventHandlerDef } from "@amax/core";
import { revokeUserTx } from "./revoke";

// hr.person.left (011) revokes the leaver's access. The payload names the user by id or work email.
export const authEventHandlers: EventHandlerDef[] = [{
  id: "auth.revoke-on-left",
  event: "hr.person.left",
  async handle({ tx, tenantId, event }) {
    const { userId, email } = event.payload as { userId?: string; email?: string };
    const [u] = await tx.execute(userId ? sql`select id from auth.user where id = ${userId}` : sql`select id from auth.user where email = ${String(email ?? "").toLowerCase()}`);
    if (u) await revokeUserTx(tx, tenantId, u.id as string, { deactivate: true, reason: "hr.person.left" });
  },
}];
