import { sql } from "drizzle-orm";
import { z } from "zod";
import { publicHttps } from "@amax/api/egress";
import { defineService } from "@amax/core/server";
import { by } from "./context";

// Pointing amax at a Keyflow: a public https address only (the 035 egress rule). A new address starts
// over: everyone is sent again and every goal, score and recognition is pulled again.
export const connectKeyflow = defineService({
  name: "keyflow.connection.set", action: "keyflow:manage", resource: "keyflow.connection",
  input: z.object({ endpoint: z.url().max(300) }),
  async run(tx, { endpoint }, ctx) {
    if (!publicHttps(endpoint)) throw new Error("the Keyflow address must be a public https URL, such as https://lumen.keyflow.example");
    const [before] = await tx.execute(sql`select endpoint, sandbox from keyflow.connection`);
    const changed = !before || before.endpoint !== endpoint || before.sandbox;
    if (changed) await tx.execute(sql`delete from keyflow.link`);
    await tx.execute(sql`insert into keyflow.connection (tenant_id, endpoint, sandbox, set_by) values (${ctx.tenantId}, ${endpoint}, false, ${by(ctx)})
      on conflict (tenant_id) do update set endpoint = excluded.endpoint, sandbox = false, set_by = excluded.set_by, set_at = now(),
        change_cursor = case when ${changed} then null else keyflow.connection.change_cursor end`);
    return { result: { endpoint, resent: changed }, resourceId: ctx.tenantId, before: before ? { endpoint: before.endpoint, sandbox: before.sandbox } : null, after: { endpoint } };
  },
});

export const dismissSyncError = defineService({
  name: "keyflow.sync_error.dismiss", action: "keyflow:manage", resource: "keyflow.sync_error",
  input: z.object({ errorId: z.uuid() }),
  async run(tx, { errorId }, ctx) {
    const [row] = await tx.execute(sql`update keyflow.sync_error set dismissed_at = now(), dismissed_by = ${by(ctx)} where id = ${errorId} and dismissed_at is null returning id, kind, message`);
    if (!row) throw new Error("that sync error is already dismissed, or there is no such error");
    return { result: { id: errorId, dismissed: true }, resourceId: errorId, before: { dismissed: false }, after: { dismissed: true, kind: row.kind } };
  },
});
