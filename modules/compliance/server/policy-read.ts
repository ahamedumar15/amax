import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { ScopeError } from "@amax/auth";
import { contextFor } from "@amax/core/server";
import { getPerson, listPeople, type PersonRef } from "@amax/hr/contracts";
import { day, READ, type Row } from "./context";
import { mayRead, type Resolved } from "./scope";

export type PolicyStatus = { policyId: string; key: string; title: string; version: number; publishedOn: string; acknowledged: boolean };
export type PolicySummary = { id: string; key: string; title: string; version: number; control: string; publishedOn: string; inScope: number; acknowledged: number; pending: number; pendingPeople: string[] };
export type PolicyCoverage = { policies: PolicySummary[]; people: number; fullyAcknowledged: number };

/** Every policy's current (highest) version. */
export const currentPolicies = (tx: Tx) => tx.execute(sql`select distinct on (key) * from compliance.policy order by key, version desc`);

/** Active people, read as a system job: compliance counts everyone in a policy's scope. */
export const activePeople = (tx: Tx, tenantId: string) => listPeople(tx, contextFor.job(tenantId, "compliance.scope"), { status: ["active"] });

export const inScope = (p: Row, people: PersonRef[]) => people.filter((x) => !p.legal_entity_id || x.legalEntityId === p.legal_entity_id);

async function acksOf(tx: Tx, policyIds: string[]) {
  if (!policyIds.length) return new Set<string>();
  const rows = await tx.execute(sql`select policy_id, person_id from compliance.acknowledgement where policy_id::text in (${sql.join(policyIds.map((i) => sql`${i}`), sql`, `)})`);
  return new Set(rows.map((r) => `${r.policy_id}:${r.person_id}`));
}

/** Acknowledgement rates of the current versions, and how many people have acknowledged all of theirs. */
export async function policyCoverage(tx: Tx, tenantId: string): Promise<PolicyCoverage> {
  const [policies, people] = [await currentPolicies(tx), await activePeople(tx, tenantId)];
  const acks = await acksOf(tx, policies.map((p) => p.id as string));
  const missing = (p: Row) => inScope(p, people).filter((x) => !acks.has(`${p.id}:${x.id}`));
  const summaries = policies.map((p) => {
    const scope = inScope(p, people).length, pending = missing(p);
    return { id: p.id as string, key: p.key as string, title: p.title as string, version: Number(p.version), control: p.control as string, publishedOn: day(p.published_on)!,
      inScope: scope, acknowledged: scope - pending.length, pending: pending.length, pendingPeople: pending.map((x) => x.name) };
  }).sort((a, b) => b.pending - a.pending || a.title.localeCompare(b.title));
  const behind = new Set(policies.flatMap((p) => missing(p).map((x) => x.id)));
  return { policies: summaries, people: people.length, fullyAcknowledged: people.length - behind.size };
}

/** One person's current policies and whether each is acknowledged: that person, or anyone with compliance:read. */
export async function policyStatusFor(tx: Tx, who: Resolved, tenantId: string, personId: string): Promise<PolicyStatus[]> {
  const person = await getPerson(tx, contextFor.job(tenantId, "compliance.scope"), personId);
  if (!person) return [];
  if (!mayRead(who) && !(who.kind === "viewer" && person.userId === who.viewer.userId)) throw new ScopeError(READ);
  const policies = (await currentPolicies(tx)).filter((p) => !p.legal_entity_id || p.legal_entity_id === person.legalEntityId);
  const acks = await acksOf(tx, policies.map((p) => p.id as string));
  return policies.map((p) => ({ policyId: p.id as string, key: p.key as string, title: p.title as string, version: Number(p.version), publishedOn: day(p.published_on)!, acknowledged: acks.has(`${p.id}:${personId}`) }));
}
