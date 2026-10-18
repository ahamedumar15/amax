import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { configureRuntime, contextFor } from "@amax/core/server";
import { installAuthorizer } from "@amax/auth";
import { createCredential } from "@amax/auth/credentials";

const ENGINEERS = ["nimal", "kasun", "ayesha", "tharushi", "dinesh"].map((k) => `${k}@lumenlabs.test`);
const CREDENTIALS = [
  { name: "specclaw CI", scopes: ["delivery:write", "time:write"], actsFor: ENGINEERS, days: 180 },
  { name: "Azure Pipelines deploys", scopes: ["delivery:write"], actsFor: [], days: 90 },
  { name: "Power BI export", scopes: ["reports:read"], actsFor: [], days: 150 },
  { name: "Old Jenkins token", scopes: ["delivery:read"], actsFor: [], days: 16 },
];
const HOOKS = [
  { name: "Payroll export", url: "https://payroll.example.test/amax", events: ["hr.person.left"] },
  { name: "IT offboarding", url: "https://it.example.test/hooks/people", events: ["hr.person.joined", "hr.person.left"] },
  { name: "People analytics", url: "https://lake.example.test/amax", events: ["hr.person.left"] },
];

const lastTuesday = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 5) % 7), 12)).toISOString();

export async function seedApi(db: Db, tenantId: string) {
  configureRuntime({ db, auditKey: "e2e-audit-key-e2e-audit-key-e2e-audit" });
  installAuthorizer();
  const ctx = contextFor.job(tenantId, "e2e-seed");
  const [maya] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`));
  for (const c of CREDENTIALS) await createCredential(ctx, { ...c, ownerUserId: maya.id as string });
  // Fixture rows, written directly: subscribing needs the amax-webhook signing secret (060 AC-7), which
  // the secrets screen's own fixtures leave unset.
  await withTenant(db, tenantId, async (tx) => {
    const ids: string[] = [];
    for (const h of HOOKS) {
      const [w] = await tx.execute(sql`insert into api.webhook (tenant_id, name, url, events, created_by) values (${tenantId}, ${h.name}, ${h.url}, ${sql.raw(`array['${h.events.join("','")}']`)}, ${`user:${maya.id}`}) returning id`);
      ids.push(w.id as string);
    }
    await tx.execute(sql`insert into api.delivery (tenant_id, webhook_id, event_id, event, ok, attempts, response_status, delivered_at)
      select ${tenantId}, (${sql.raw(`array['${ids.join("','")}']::uuid[]`)})[1 + i % 3], gen_random_uuid(), 'hr.person.left', i > 9, case when i > 9 then 1 else 5 end,
        case when i > 9 then 204 else null end, now() - make_interval(mins => i * 3) from generate_series(1, 2140) i`);
    await tx.execute(sql`insert into api.inbound (tenant_id, provider, event_id, verified, reason, received_at)
      select ${tenantId}, 'github', case when i <= 40 then gen_random_uuid()::text end, i <= 40, case when i > 40 then 'signature' end, now() - make_interval(hours => i)
      from generate_series(1, 52) i`);
    await tx.execute(sql`insert into api.rate_limited (tenant_id, hour, channel, subject, count) values (${tenantId}, ${lastTuesday()}, 'mcp', 'token:e2e0000000000001', 86)`);
  });
}
