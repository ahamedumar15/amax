import { z } from "zod";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import type { Registry } from "@amax/mcp";
import type { WorkflowRegistry } from "@amax/workflows/server";
import { defineWorkflow, NonRetryableError, step, waitForEvent, type Json } from "@amax/workflows";
import { suggestionKinds } from "./kinds";
import { createSuggestion, Source } from "./store";
import { think, type ThinkInput } from "./think";

/** What runs need from the host: the tool registry, and the person a run acts for. */
export type AgentDeps = { tools: () => Registry; viewerFor: (tenantId: string, userId: string) => Promise<Viewer | null>; workflows?: () => WorkflowRegistry };
let deps: AgentDeps | undefined;
export const configureAgents = (d: AgentDeps) => {
  deps = d;
};
export const host = () => {
  if (!deps) throw new NonRetryableError("amax: configureAgents({ tools, viewerFor }) before agent runs");
  return deps;
};

export const RunInput = z.object({
  agent: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
  agentName: z.string().min(2),
  actsFor: z.uuid(),
  instructions: z.string().min(1),
  task: z.string().min(1),
  data: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
  source: Source.default({ channel: "internal" }),
  tools: z.array(z.string()).default([]),
  kinds: z.array(z.string()).min(1),
}).refine((r) => !r.data.length || r.source.channel !== "internal", { message: "a run over untrusted text names its external source", path: ["source"] });
export type RunInput = z.input<typeof RunInput>;

const classes = () => Object.assign({}, ...suggestionKinds().map((k) => k.fields ?? {}));

// 006 AC-4: an agent run is a durable workflow. It thinks once (tool calls and cost recorded on the
// step), stores its suggestions, then waits, using no compute, until a person decides each one.
export const agentRun = defineWorkflow({
  name: "agents.run",
  title: "Agent run",
  waitsFor: ["agents.suggestion.decided"],
  async run(ctx, raw: Json) {
    const input = RunInput.parse(raw);
    const sensitive = classes();
    const proposals = await step("think", async (s) => {
      const viewer = await host().viewerFor(ctx.tenantId, input.actsFor);
      if (!viewer) throw new NonRetryableError("the person this run acts for can't sign in");
      return (await think(host().tools(), viewer, input as ThinkInput, s)).proposals;
    }, { timeout: "5m", retry: { maxAttempts: 2 }, sensitive });
    const ids = await step("suggest", async () => {
      const job = contextFor.job(ctx.tenantId, `agents.run:${input.agent}`, `user:${input.actsFor}`);
      const out: string[] = [];
      for (const p of proposals) out.push((await createSuggestion(job, { ...p, agentName: input.agentName, source: input.source, runId: ctx.runId })).id);
      return out;
    }, { sensitive });
    const decisions: string[] = [];
    for (const [i, id] of ids.entries()) {
      const d = await waitForEvent<{ decision: string }>(`decision-${i + 1}`, { event: "agents.suggestion.decided", match: { suggestionId: id }, timeout: "30d" });
      decisions.push(d?.decision ?? "expired");
    }
    const n = (x: string) => decisions.filter((d) => d === x).length;
    return { suggestions: ids, summary: ids.length ? `${ids.length} suggested: ${n("accepted")} accepted, ${n("dismissed")} dismissed, ${n("expired")} expired` : "Nothing to suggest" };
  },
});
