import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import { configureAi } from "@amax/ai";
import { fakeProvider, type FakeStep } from "@amax/ai/fake";

type Canned = ReturnType<FakeStep>;
import { createRegistry } from "@amax/mcp";
import { createPostgresEngine, getRun, workflowRegistry, type RunStatus } from "@amax/workflows/server";
import { agentsPlatform, configureAgents } from "../src/server";
import { agentsDb, ANA, T, viewer } from "./setup";

/** A fictional module's tools: one read, one write that an agent run must never reach. */
export async function runHarness(steps: Canned[]) {
  const db = await agentsDb();
  await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
  const writes: unknown[] = [];
  const tools = [
    { name: "get_limit", description: "Read the limit.", input: z.object({}), permission: "", scope: "read", readOnly: true, run: async () => ({ limit: await db.setting("limit") }) },
    { name: "set_limit", description: "Set the limit.", input: z.object({ value: z.number() }), permission: "", scope: "write", run: async (_v: unknown, a: unknown) => writes.push(a) },
  ] as unknown as McpToolDef[];
  const registry = createRegistry([{ id: "demo", mcpTools: tools }]);
  const provider = fakeProvider(steps.map((r) => () => r));
  configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
  configureAgents({ tools: () => registry, viewerFor: async () => viewer(ANA, ["Admin"]) });
  const workflows = workflowRegistry([agentsPlatform]);
  const engine = createPostgresEngine({ db: db.app, registry: workflows });
  const settle = async (id: string, want: RunStatus[]) => {
    let run = null;
    for (let i = 0; i < 40; i++) {
      await engine.tick();
      run = await getRun(db.app, workflows, T, id, () => true);
      if (run && want.includes(run.status)) return run;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`run ${id} never reached ${want.join("/")}: ${JSON.stringify(run)}`);
  };
  return { ...db, provider, engine, workflows, writes, settle };
}

export const call = (name: string, input: unknown, id = name) => ({ toolCalls: [{ type: "tool_use" as const, id, name, input }] });
export const runInput = (over: Record<string, unknown> = {}) => ({ agent: "demo.check", agentName: "Demo check", actsFor: ANA, instructions: "Check the limit.", task: "Is the limit right?", tools: ["get_limit", "set_limit"], kinds: ["demo.setting", "demo.pay"], ...over });
