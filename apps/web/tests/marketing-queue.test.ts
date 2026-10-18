import { canEver, setGrants } from "@amax/auth/can";
import type { Viewer } from "@amax/auth/viewer";
import { describe, expect, it } from "vitest";
import { modules } from "../generated/modules";
import { QUEUES, type Card, type Role } from "../components/marketing/queues";

type Tool = { name: string; permission?: string };
type Kind = { kind: string; permission: string };
type Manifest = { mcpTools?: Tool[]; suggestions?: readonly unknown[]; permissions?: string[] };
const all = modules as unknown as Manifest[];
setGrants(modules);

const permissionOf = (tool: string) => {
  if (tool.startsWith("suggestion:")) return all.flatMap((m) => (m.suggestions ?? []) as Kind[]).find((k) => k.kind === tool.slice(11))?.permission;
  return all.flatMap((m) => m.mcpTools ?? []).find((t) => t.name === tool)?.permission;
};
const declared = new Set(all.flatMap((m) => m.permissions ?? []));
const holds = (role: Role, permission: string) => canEver({ assignments: [{ role }] } as unknown as Viewer, permission);

/** What is wrong with a card shown on a role's tab: an unknown tool, or a permission the role lacks. */
const check = (role: Role, card: Pick<Card, "tool" | "step">) => {
  const permission = permissionOf(card.tool);
  if (!permission) return [`${card.tool} is not a shipped MCP tool or suggestion kind`];
  return [permission, ...(card.step ? [card.step] : [])].flatMap((p) => [
    ...(declared.has(p) ? [] : [`${p} is not a declared permission`]),
    ...(holds(role, p) ? [] : [`${role} does not hold ${p}`]),
  ]);
};

describe("064 AC-6 every hero queue card runs a shipped tool, at a step its role may take", () => {
  const cards = Object.entries(QUEUES).flatMap(([role, list]) => list.map((c) => [role as Role, c.id, c] as const));
  it.each(cards)("%s card %s", (role, _id, card) => expect(check(role, card)).toEqual([]));
  it.each([
    ["PM", { tool: "issue_payroll" }],
    ["HR", { tool: "record_deployment" }],
    ["Engineer", { tool: "approve_expense", step: "expenses:approve-finance" }],
    ["PM", { tool: "approve_leave", step: "leave:admin" }],
    ["Finance", { tool: "approve_leave", step: "leave:admin" }],
  ] as const)("rejects %s running %o", (role, card) => expect(check(role, card)).not.toEqual([]));
});
