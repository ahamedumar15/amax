import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { mask, type Masked, type Viewer } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import { amt, initialsOf, named, who } from "./read";

type Pay = string | Masked;
export type ChangeStatus = "accepted" | "open" | "queried" | "dismissed" | "expired" | "explaining";
export type ChangeRow = {
  id: string; personId: string; personName: string; initials: string; kind: "joiner" | "leaver" | "pay";
  amount: Pay; was: Pay; now: Pay; explanation: string; needsCheck: boolean; confidence: number;
  status: ChangeStatus; decidedBy: string | null; suggestionId: string | null;
};

/** The newest payroll-agent suggestion per change the viewer may decide, from 006. */
async function latestSuggestions(v: Viewer) {
  const latest = new Map<string, { id: string; status: string; createdAt: string }>();
  for (const s of await listSuggestions(v, { kind: "payroll.variance" })) {
    const had = latest.get(s.target.id);
    if (!had || had.createdAt < s.createdAt) latest.set(s.target.id, { id: s.id, status: s.status, createdAt: s.createdAt });
  }
  return latest;
}

const statusOf = (decision: unknown, s: { status: string } | undefined): ChangeStatus =>
  decision === "accepted" ? "accepted" : !s ? "explaining" : (["queried", "dismissed", "expired"].includes(s.status) ? s.status : "open") as ChangeStatus;

/** A run's changes since last period; HR reads the explanation, the amounts only with the pay class (002). */
export async function changesOf(tx: Tx, v: Viewer, runId: string): Promise<ChangeRow[]> {
  const rows = await tx.execute(sql`select c.*, ${named("c.decided_by")} as decided_name from payroll.change c where c.run_id = ${runId} order by c.needs_check desc, c.decision nulls first, c.person_name`);
  const sugg = rows.length ? await latestSuggestions(v) : new Map();
  return rows.map((c) => {
    const s = sugg.get(c.id as string);
    const row = {
      id: c.id as string, personId: c.person_id as string, personName: c.person_name as string, initials: initialsOf(c.person_name as string), kind: c.kind as ChangeRow["kind"],
      amount: amt(c.amount), was: amt(c.was_net), now: amt(c.now_net), explanation: c.explanation as string, needsCheck: Boolean(c.needs_check), confidence: Number(c.confidence),
      status: statusOf(c.decision, s), decidedBy: who(c.decided_by, c.decided_name), suggestionId: s?.id ?? null,
    };
    return mask(v, row, { amount: "pay", was: "pay", now: "pay" }, { legalEntityId: c.legal_entity_id as string, ownerUserId: (c.user_id as string | null) ?? null }) as ChangeRow;
  });
}
