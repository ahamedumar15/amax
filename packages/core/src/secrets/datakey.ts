import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import type { ServiceContext } from "../authorize";
import { defineService, getRuntime } from "../service";
import { newDataKey } from "./crypto";
import { requireKms } from "./runtime";

const createDataKey = defineService({
  name: "secrets.data_key.create",
  action: "secrets:credential:manage",
  resource: "secrets.data_key",
  keyless: true,
  input: z.object({}),
  async run(tx, _input, ctx) {
    const k = requireKms();
    const w = await k.wrap(ctx.tenantId, newDataKey());
    const created = await tx.execute(sql`insert into secrets.data_key (tenant_id, kms, key_ref, wrapped) values (${ctx.tenantId}, ${k.id}, ${w.keyRef}, ${w.wrapped}) on conflict do nothing returning tenant_id`);
    return { result: created.length > 0, resourceId: ctx.tenantId, after: { kms: k.id, keyRef: w.keyRef, created: created.length > 0 } };
  },
});

export async function ensureDataKey(ctx: ServiceContext) {
  const [row] = await withTenant(getRuntime().db, ctx.tenantId, (tx) => tx.execute(sql`select 1 from secrets.data_key where tenant_id = ${ctx.tenantId}`));
  if (!row) await createDataKey(ctx, {});
}
