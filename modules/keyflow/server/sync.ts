import { withTenant } from "@amax/db";
import { EgressError } from "@amax/api/egress";
import { contextFor, getRuntime, type ServiceContext } from "@amax/core/server";
import { SecretNotConfiguredError, useSecret } from "@amax/core/secrets";
import { httpTransport } from "./http";
import { planSync, type Plan } from "./plan";
import { failSync, recordSync } from "./record";
import { sandboxTransport } from "./sandbox";
import { KeyflowError, type KeyflowTransport } from "./transport";

type Reply = { refused: Awaited<ReturnType<KeyflowTransport["push"]>>["refused"]; changes: Awaited<ReturnType<KeyflowTransport["changes"]>> };
export type SyncResult = { ok: boolean; summary: string };

let testTransport: ((plan: Plan) => KeyflowTransport) | null = null;
/** Tests stand in for Keyflow here; the real Keyflow is never reachable from a test. */
export const setTestTransport = (fn: typeof testTransport) => void (testTransport = fn);

const exchange = async (t: KeyflowTransport, plan: Plan): Promise<Reply> => ({ refused: (await t.push(plan.batch)).refused, changes: await t.changes(plan.connection!.cursor) });

// The key is opened through 031 only for a real endpoint; its value never leaves the callback.
function talk(ctx: ServiceContext, plan: Plan): Promise<Reply> {
  if (testTransport) return exchange(testTransport(plan), plan);
  if (plan.connection!.sandbox) return exchange(sandboxTransport(plan.directory), plan);
  return useSecret(ctx, { connector: "keyflow", purpose: "Keyflow sync" }, (key) => exchange(httpTransport(plan.connection!.endpoint!, key.reveal()), plan));
}

const KNOWN = [KeyflowError, EgressError, SecretNotConfiguredError];
const failureOf = (e: unknown) => {
  if (KNOWN.some((k) => e instanceof k)) return (e as Error).message.replace(/^secrets: /, "");
  const code = (e as { code?: unknown })?.code;
  return `couldn't reach Keyflow${typeof code === "string" ? ` (${code})` : ""}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One sync for a tenant: plan what changed, talk to Keyflow outside any transaction, then record the outcome as one audited write. */
export async function runSync(tenantId: string): Promise<SyncResult> {
  const ctx = contextFor.job(tenantId, "keyflow.sync");
  const startedAt = new Date().toISOString();
  const plan = await withTenant(getRuntime().db, tenantId, (tx) => planSync(tx, ctx));
  if (!plan.connection) return { ok: true, summary: "Skipped: Keyflow isn't connected" };
  let reply: Reply;
  try {
    reply = await talk(ctx, plan);
  } catch (e) {
    const failure = failureOf(e);
    await failSync(ctx, { startedAt, failure });
    return { ok: false, summary: `Failed: ${failure}` };
  }
  const out = await recordSync(ctx, { startedAt, sent: plan.sent, refused: reply.refused, changes: reply.changes });
  return { ok: true, summary: `Sent ${plural(out.peopleOut, "person", "people")} and ${plural(out.teamsOut, "team")}; got ${plural(out.goalsIn, "goal")}, ${plural(out.reviewsIn, "review score")} and ${plural(out.recognitionIn, "recognition")}${out.errors ? `; ${plural(out.errors, "error")}` : ""}` };
}
