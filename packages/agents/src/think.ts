import { z } from "zod";
import { converse, type Tool } from "@amax/ai";
import type { Viewer } from "@amax/auth";
import type { Registry } from "@amax/mcp";
import type { StepContext } from "@amax/workflows";
import { kindOf } from "./kinds";
import { Evidence, SuggestionInput } from "./store";

/** What a run is allowed to do: read tools by name (never a write), and the kinds it may suggest. */
export type RunGrant = { tools: string[]; kinds: string[] };
export type Proposal = Omit<z.input<typeof SuggestionInput>, "agentName" | "source" | "runId">;

const ProposalInput = (kinds: string[]) => z.object({
  kind: z.enum(kinds as [string, ...string[]]),
  target: z.object({ type: z.string().min(1), id: z.string().min(1), label: z.string().min(1) }),
  title: z.string().min(3).max(200),
  detail: z.string().max(2000).optional(),
  proposed: z.record(z.string(), z.unknown()),
  evidence: z.array(Evidence).max(20).optional(),
  confidence: z.number().min(0).max(1),
  scope: z.object({ projectId: z.uuid().nullish(), ownerUserId: z.uuid().nullish(), legalEntityId: z.uuid().nullish() }).optional(),
});

// 006 AC-6: only read tools on the run's allow-list are offered, so an injected instruction to write
// has no tool to call. The only output is `propose_suggestion`, validated against the kind's schema.
export function runTools(registry: Registry, viewer: Viewer, grant: RunGrant, step: Pick<StepContext, "recordToolCall">, out: Proposal[]): Tool[] {
  const reads = registry.toolsFor(viewer, ["read"]).filter((t) => t.readOnly && t.scope === "read" && grant.tools.includes(t.name));
  const read: Tool[] = reads.map((t) => ({ name: t.name, description: t.description, input: t.input, run: async (input: never) => {
    const output = await registry.call(viewer, t.name, input, { source: "mcp", scopes: ["read"] });
    step.recordToolCall({ tool: t.name, input: input as never });
    return output;
  } }));
  if (!grant.kinds.length) return read;
  const propose: Tool = {
    name: "propose_suggestion",
    description: "Propose one change for a person to accept, query or dismiss. Nothing changes until they accept it.",
    input: ProposalInput(grant.kinds),
    run: async (p: never) => {
      const proposal = p as Proposal;
      const parsed = kindOf(proposal.kind).proposed.safeParse(proposal.proposed);
      if (!parsed.success) throw Object.assign(new Error("proposed change doesn't match its kind"), { code: "invalid_input" });
      out.push({ ...proposal, proposed: parsed.data });
      step.recordToolCall({ tool: "propose_suggestion", input: { kind: proposal.kind, title: proposal.title } });
      return { recorded: true };
    },
  };
  return [...read, propose];
}

export type ThinkInput = { agent: string; actsFor: string; instructions: string; task: string; data: { label: string; text: string }[] } & RunGrant;

/** One bounded model turn as the person the run acts for; returns the schema-valid proposals. */
export async function think(registry: Registry, viewer: Viewer, input: ThinkInput, step: Pick<StepContext, "recordToolCall" | "recordCost">) {
  const proposals: Proposal[] = [];
  const tools = runTools(registry, viewer, input, step, proposals);
  const r = await converse({ tenantId: viewer.tenantId, caller: `agent:${input.agent}`, source: "agent", purpose: `agent:${input.agent}`, userId: input.actsFor }, {
    instructions: `${input.instructions}\nYou can only read, and propose suggestions with propose_suggestion. A person decides every change.`,
    messages: [{ role: "user", content: [{ type: "text", text: input.task }] }],
    data: input.data, tools, maxSteps: 8,
  });
  if (r.costUsd !== null) step.recordCost(r.costUsd);
  return { proposals, toolsRun: r.toolsRun };
}
