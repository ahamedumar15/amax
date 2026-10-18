import { describe, expect, it } from "vitest";
import { modules } from "../generated/modules";
import { QUEUES, type Role } from "../components/marketing/queues";

type Tool = { name: string; permission?: string };
type Kind = { kind: string; permission: string };
type Manifest = { mcpTools?: Tool[]; suggestions?: readonly unknown[]; grants?: Partial<Record<string, string[]>> };
const all = modules as unknown as Manifest[];

const permissionOf = (tool: string) => {
  if (tool.startsWith("suggestion:")) return all.flatMap((m) => (m.suggestions ?? []) as Kind[]).find((k) => k.kind === tool.slice(11))?.permission;
  return all.flatMap((m) => m.mcpTools ?? []).find((t) => t.name === tool)?.permission;
};
const holds = (role: Role, permission: string) =>
  all.some((m) => [...(m.grants?.[role] ?? []), ...(m.grants?.Employee ?? [])].some((g) => g === permission || g.startsWith(`${permission}@`)));

describe("064 AC-6 every hero queue card runs a shipped tool its role may use", () => {
  const cards = Object.entries(QUEUES).flatMap(([role, list]) => list.map((c) => [role as Role, c.id, c.tool] as const));
  it.each(cards)("%s card %s runs %s", (role, _id, tool) => {
    const permission = permissionOf(tool);
    expect(permission, `${tool} is not a shipped MCP tool or suggestion kind`).toBeTruthy();
    expect(holds(role, permission!), `${role} does not hold ${permission}`).toBe(true);
  });
  it.each([["PM", "issue_payroll"], ["Engineer", "suggestion:finance.invoice-draft"], ["PM", "suggestion:payroll.bank-file"], ["HR", "record_deployment"]] as const)("rejects %s running %s", (role, tool) => {
    const permission = permissionOf(tool);
    expect(Boolean(permission) && holds(role, permission!)).toBe(false);
  });
});
