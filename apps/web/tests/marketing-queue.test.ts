import { canEver, setGrants } from "@amax/auth/can";
import type { Viewer } from "@amax/auth/viewer";
import { describe, expect, it } from "vitest";
import { modules } from "../generated/modules";
import { QUEUES, type Role } from "../components/marketing/queues";

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

describe("064 AC-6 every hero queue card runs a shipped tool its role may use", () => {
  const cards = Object.entries(QUEUES).flatMap(([role, list]) => list.map((c) => [role as Role, c.id, c.tool, c.step] as const));
  it.each(cards)("%s card %s runs %s", (role, _id, tool, step) => {
    const permission = permissionOf(tool);
    expect(permission, `${tool} is not a shipped MCP tool or suggestion kind`).toBeTruthy();
    for (const p of [permission!, ...(step ? [step] : [])]) {
      expect(declared.has(p), `${p} is not a declared permission`).toBe(true);
      expect(holds(role, p), `${role} does not hold ${p}`).toBe(true);
    }
  });
  it.each([["PM", "issue_payroll"], ["Engineer", "suggestion:finance.invoice-draft"], ["PM", "suggestion:payroll.bank-file"], ["HR", "record_deployment"]] as const)("rejects %s running %s", (role, tool) => {
    const permission = permissionOf(tool);
    expect(Boolean(permission) && holds(role, permission!)).toBe(false);
  });
  it("rejects a step the role cannot take", () => expect(holds("Engineer", "expenses:approve-finance")).toBe(false));
});
