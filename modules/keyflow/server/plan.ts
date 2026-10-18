import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import type { Batch, OutPerson, OutTeam } from "./transport";

export type Connection = { endpoint: string | null; sandbox: boolean; cursor: string | null };
export type Sent = { kind: "person" | "team"; localId: string; hash: string };
/** What one sync sends: everyone Keyflow should know (`directory`), and only what changed since the last send (`batch`). */
export type Plan = { connection: Connection | null; directory: OutPerson[]; batch: Batch; sent: Sent[] };

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const toOut = (p: PersonRef): OutPerson => ({
  ref: p.id, employeeNo: p.employeeNo, name: p.name, title: p.title, team: p.department ? `team:${slug(p.department)}` : null,
  managerRef: p.managerPersonId, status: p.status, joinedOn: p.joinedOn,
});

function teamsOf(people: OutPerson[], names: Map<string, string>): OutTeam[] {
  const counts = new Map<string, number>();
  for (const p of people) if (p.team) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
  return [...counts].map(([ref, members]) => ({ ref, name: names.get(ref) ?? ref, members })).sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function connectionOf(tx: Tx): Promise<Connection | null> {
  const [c] = await tx.execute(sql`select endpoint, sandbox, change_cursor from keyflow.connection`);
  return c ? { endpoint: (c.endpoint as string | null) ?? null, sandbox: Boolean(c.sandbox), cursor: (c.change_cursor as string | null) ?? null } : null;
}

/** Active and joining people go out; a leaver goes out once more, as left, if Keyflow ever had them. Teams are hr departments. */
export async function planSync(tx: Tx, ctx: ServiceContext): Promise<Plan> {
  const connection = await connectionOf(tx);
  const links = new Map((await tx.execute(sql`select kind, local_id, hash from keyflow.link`)).map((r) => [`${r.kind}:${r.local_id}`, r.hash as string]));
  const people = (await listPeople(tx, ctx)).filter((p) => p.status !== "left" || links.has(`person:${p.id}`));
  const directory = people.map(toOut);
  const current = directory.filter((p) => p.status !== "left");
  const teams = teamsOf(current, new Map(people.flatMap((p) => (p.department ? [[`team:${slug(p.department)}`, p.department] as const] : []))));
  const changed = <T extends { ref: string }>(kind: Sent["kind"], xs: T[]) => xs.map((x) => ({ x, s: { kind, localId: x.ref, hash: hash(x) } })).filter(({ s }) => links.get(`${kind}:${s.localId}`) !== s.hash);
  const p = changed("person", directory), t = changed("team", teams);
  return { connection, directory, batch: { people: p.map((c) => c.x), teams: t.map((c) => c.x) }, sent: [...p, ...t].map((c) => c.s) };
}
