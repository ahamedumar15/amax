import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { contextFor, defineService, getRuntime, type ServiceContext } from "@amax/core/server";
import { JOBS, WRITE_CONNECTOR } from "../contracts";
import { openSecret } from "./collect";
import { graphToken, type GraphApp } from "./graph";
import { COLLECT } from "./read";
import { postJson } from "./wire";

const BETA = "https://graph.microsoft.com/beta/deviceManagement";
type Queued = { id: string; devices: string[]; title: string };

export const recordRemediation = defineService({
  name: "experience.remediation.record", action: COLLECT, resource: "experience.remediation",
  input: z.object({ remediationId: z.uuid(), status: z.enum(["applied", "manual", "failed"]), outcome: z.string().max(300) }),
  async run(tx, a) {
    const [r] = await tx.execute(sql`update experience.remediation set status = ${a.status}, outcome = ${a.outcome}, applied_at = case when ${a.status} = 'applied' then now() else null end
      where id = ${a.remediationId} and status = 'queued' returning issue_id`);
    if (r && a.status === "applied") await tx.execute(sql`update experience.issue set status = 'done' where id = ${r.issue_id}`);
    return { result: { status: a.status }, resourceId: a.remediationId, after: { status: a.status } };
  },
});

async function run(ctx: ServiceContext, q: Queued, script: string) {
  return openSecret(ctx, WRITE_CONNECTOR, `approved remediation ${q.id}`, async (value) => {
    const token = await graphToken(JSON.parse(value) as GraphApp);
    for (const d of q.devices) await postJson(`${BETA}/managedDevices/${encodeURIComponent(d)}/initiateOnDemandProactiveRemediation`, JSON.stringify({ scriptPolicyId: script }),
      { "content-type": "application/json", authorization: `Bearer ${token}` });
  });
}

// AC-5: only approved remediations, and only through the write registration once an Admin switched it
// on with the script to run; otherwise each is left to IT in Intune. Each is recorded once.
export async function runRemediations(tenantId: string) {
  const ctx = contextFor.job(tenantId, JOBS.remediate);
  const { due, s } = await withTenant(getRuntime().db, tenantId, async (tx) => ({
    due: (await tx.execute(sql`select r.id, i.title, array(select d.external_id from experience.issue_device x join experience.device d on d.id = x.device_id where x.issue_id = i.id) as devices
      from experience.remediation r join experience.issue i on i.id = r.issue_id where r.status = 'queued' order by r.approved_at limit 20`)).map((r) => ({ id: r.id as string, title: r.title as string, devices: r.devices as string[] })),
    s: (await tx.execute(sql`select remediation_enabled, remediation_script, sandbox from experience.settings`))[0],
  }));
  const out = [];
  for (const q of due) {
    if (!s?.remediation_enabled || !s.remediation_script) out.push(await recordRemediation(ctx, { remediationId: q.id, status: "manual", outcome: "Remediation is off for this tenant: run it in Intune" }));
    else if (s.sandbox) out.push(await recordRemediation(ctx, { remediationId: q.id, status: "applied", outcome: `Ran on ${q.devices.length} devices in the sandbox Intune (fictional)` }));
    else {
      try {
        await run(ctx, q, s.remediation_script as string);
        out.push(await recordRemediation(ctx, { remediationId: q.id, status: "applied", outcome: `Ran on ${q.devices.length} devices through the write registration` }));
      } catch (e) {
        out.push(await recordRemediation(ctx, { remediationId: q.id, status: "failed", outcome: (e instanceof Error ? e.message : "failed").replace(/^secrets: /, "").slice(0, 300) }));
      }
    }
  }
  return out;
}
