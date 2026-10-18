import { sql } from "drizzle-orm";
import { z } from "zod";
import { viewerOf } from "@amax/auth";
import { getPerson, personIdsForUser } from "@amax/hr/contracts";
import { contextFor, defineService } from "@amax/core/server";
import { EVENTS, type AcknowledgementRequested, type PolicyAcknowledged, type PolicyPublished } from "../contracts";
import { by, day, entityNamed } from "./context";
import { activePeople, currentPolicies, inScope } from "./policy-read";

const slug = (title: string) => title.toLowerCase().replace(/\bpolicy\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A new version of a policy (or its first): everyone in its scope is asked to acknowledge it again.
export const publishPolicy = defineService({
  name: "compliance.policy.publish", action: "compliance:manage", resource: "compliance.policy",
  input: z.object({ title: z.string().min(3), summary: z.string().optional(), entity: z.string().optional(), key: z.string().optional() }),
  async run(tx, a, ctx) {
    const key = a.key ?? slug(a.title);
    const [prev] = await tx.execute(sql`select * from compliance.policy where key = ${key} order by version desc limit 1 for update`);
    const version = prev ? Number(prev.version) + 1 : 1;
    const entityId = a.entity ? (await entityNamed(tx, a.entity)).id : ((prev?.legal_entity_id as string | null) ?? null);
    const [row] = await tx.execute(sql`insert into compliance.policy (tenant_id, key, title, version, summary, legal_entity_id, control, published_on, published_by)
      values (${ctx.tenantId}, ${key}, ${a.title}, ${version}, ${a.summary ?? prev?.summary ?? null}, ${entityId}, ${(prev?.control as string) ?? "A.5.1"}, current_date, ${by(ctx)}) returning *`);
    const people = inScope(row, await activePeople(tx, ctx.tenantId));
    const asked = people.flatMap((p) => (p.userId ? [{ name: EVENTS.acknowledgementRequested, payload: { policyId: row.id as string, title: a.title, version, userId: p.userId } satisfies AcknowledgementRequested }] : []));
    const published: PolicyPublished = { policyId: row.id as string, key, title: a.title, version, inScope: people.length, by: by(ctx) };
    return {
      result: { id: row.id as string, title: a.title, version, publishedOn: day(row.published_on), inScope: people.length, asked: asked.length },
      resourceId: row.id as string, after: { key, version, legalEntityId: entityId }, events: [{ name: EVENTS.policyPublished, payload: published }, ...asked],
    };
  },
});

// The signed-in person acknowledges the current version of a policy in their scope.
export const acknowledgePolicy = defineService({
  name: "compliance.policy.acknowledge", action: "compliance:acknowledge", resource: "compliance.acknowledgement",
  input: z.object({ policyId: z.string().uuid() }),
  async run(tx, a, ctx) {
    const userId = viewerOf(ctx)?.userId;
    const [personId] = userId ? await personIdsForUser(tx, userId) : [];
    const person = personId ? await getPerson(tx, contextFor.job(ctx.tenantId, "compliance.scope"), personId) : null;
    if (!person) throw new Error("only a person with an HR record acknowledges policies");
    const policy = (await currentPolicies(tx)).find((p) => p.id === a.policyId);
    if (!policy) throw new Error("that is not the current version of a policy; ask for your policies to see the current ones");
    if (policy.legal_entity_id && policy.legal_entity_id !== person.legalEntityId) throw new Error("that policy isn't one of yours");
    const [row] = await tx.execute(sql`insert into compliance.acknowledgement (tenant_id, policy_id, person_id, user_id)
      values (${ctx.tenantId}, ${policy.id}, ${person.id}, ${userId}) on conflict do nothing returning id`);
    if (!row) throw new Error(`you have already acknowledged ${policy.title} v${policy.version}`);
    const payload: PolicyAcknowledged = { policyId: policy.id as string, version: Number(policy.version), personId: person.id, userId: userId ?? null };
    return { result: { policy: `${policy.title} v${policy.version}`, acknowledged: true }, resourceId: row.id as string, after: payload, events: [{ name: EVENTS.policyAcknowledged, payload }] };
  },
});
