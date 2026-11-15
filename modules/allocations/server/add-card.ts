import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardField, ToolCard } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { ToolError } from "@amax/mcp";
import { getProjectRef } from "@amax/delivery/contracts";
import { getPerson, listPeople } from "@amax/hr/contracts";
import { listAllocations } from "../contracts";
import { monthLabel, windowMonths } from "./months";
import { readAlloc } from "./read";
import { freeIn } from "./team";

export type AddInput = { person?: string; projectKey?: string; work?: string; month?: string; percent?: number; standing?: boolean };
const PICKS = 4;

export const freeLabel = (free: number | null) => (free === null ? "" : free === 0 ? " · fully allocated" : free < 0 ? ` · over-allocated by ${-free}%` : ` · ${free}% free this month`);

async function picks(v: Viewer, projectId: string, month: string) {
  return readAlloc(v, async (tx) => {
    const on = new Set((await listAllocations(tx, v, { from: month, to: month, projectIds: [projectId] })).rows.map((r) => r.personId));
    const people = (await listPeople(tx, v, { status: ["active"] })).filter((p) => !on.has(p.id));
    const free = await freeIn(tx, v, people.map((p) => p.id), month);
    return people.map((p) => ({ p, free: free(p.id) })).sort((a, b) => (b.free ?? -1e9) - (a.free ?? -1e9) || a.p.name.localeCompare(b.p.name)).slice(0, PICKS)
      .map(({ p, free: f }) => ({ value: p.name, label: `${p.name} · ${p.title}${freeLabel(f)}` }));
  });
}

/**
 * 107 AC-8: before the card and while it is edited, the person must be in HR. Someone who can sign in but has no HR
 * record yet is named, with the way on: add them to HR first (HR's own write, then this card again).
 */
export async function proposeAllocate(v: Viewer, a: AddInput) {
  if (!a.person) return;
  const who = a.person.trim();
  const known = await readAlloc(v, async (tx) => {
    const job = contextFor.job(v.tenantId, "allocations.propose");
    if (await getPerson(tx, job, who)) return true;
    return (await listPeople(tx, job, { status: ["active", "joining"] })).some((p) => p.name.toLowerCase() === who.toLowerCase());
  });
  if (known) return;
  const [account] = await readAlloc(v, (tx) => tx.execute(sql`select name from auth.user where status = 'active' and (lower(name) = lower(${who}) or lower(email) = lower(${who}))`));
  const name = account ? String(account.name) : null;
  throw new ToolError(name ? `${name} can sign in but has no HR record yet. Add them to HR first: "add ${name} to HR for ${a.projectKey ?? "the project"}"` : `No one called ${who} is in HR`, "invalid_input", "person");
}

/** 107 AC-7: the Add to project card, a 106 form: likely people, a percent, and This month or Until further notice. */
export async function addCard(v: Viewer, a: AddInput): Promise<ToolCard> {
  const project = a.projectKey ? await readAlloc(v, (tx) => getProjectRef(tx, a.projectKey!)) : null;
  const month = a.month ?? windowMonths(new Date(), 1)[0];
  const who = a.person ?? "someone";
  if (!project) return { title: `Allocate ${who}${a.work ? ` to ${a.work}` : ""}`, lines: [{ label: "Percent", value: `${a.percent ?? 0}%` }] };
  const internal = project.billing === "internal";
  const fields: CardField[] = [
    { name: "person", label: "Who", kind: "chips", options: await picks(v, project.id, month), other: "Someone else…", required: true },
    { name: "percent", label: "Percent", kind: "text", value: String(internal ? 100 : 50) },
    { name: "standing", label: "For", kind: "chips", value: String(internal), options: [{ value: "false", label: "This month" }, { value: "true", label: "Until further notice" }] },
  ];
  const when = a.standing ? "until further notice" : `in ${monthLabel(month, "long")}`;
  return {
    title: `Add ${who} to ${project.key}`, lines: [],
    look: { kind: "Add to project", confirm: `Add ${who} to ${project.key}`, done: `Added ${who} to ${project.key} · ${a.percent ?? ""}% ${when}` },
    form: { fields, confirm: { label: `Add {person} to ${project.key}` } },
  };
}
