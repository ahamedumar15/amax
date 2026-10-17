import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import type { McpToolDef } from "@amax/core";

// 052 review round 3: when the decided step can't be written, a confirm still reports the outcome
// that is already settled (replay, cancel, expiry, missing value); only `run` fails closed, and then
// the write never runs.
const trace = { failDecided: false };
vi.mock("@amax/core/server", async (orig) => {
  const real = await orig<typeof import("@amax/core/server")>();
  return {
    ...real,
    traceStep: async (step: Parameters<typeof real.traceStep>[0]) => {
      if (trace.failDecided && step.kind === "decided") throw new Error("trace store down");
      return real.traceStep(step);
    },
  };
});

const { claimKey, withIdempotency } = await import("@amax/core/server");
const { createRegistry } = await import("@amax/mcp");
const { chatPlatform, chatTurn, confirmAction } = await import("../src");
const { chatWorld, registry, scripted, T } = await import("./world");

const vault = { id: "vault", mcpTools: [{ name: "set_code", description: "Set the door code.", input: z.object({}).strict(), scope: "write", permission: "", secretInput: { label: "Code" },
  run: async () => ({ ok: true }) } as unknown as McpToolDef] };
const withVault = createRegistry([chatPlatform, vault]);

describe.skipIf(!hasDb)("052 a failed decided-step write never hides a settled outcome (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let app: Db, maya: Viewer;
  const rows = (q: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(q));
  const note = async (text: string) => {
    scripted(app, [() => ({ text: "Noted." })]);
    return (await chatTurn(app, registry, maya, { text })).conversationId;
  };
  const propose = async (tool: string, input: Record<string, unknown>, reg = registry) => {
    scripted(app, [() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: tool, input }] }), () => ({ text: "Confirm?" })]);
    const turn = await chatTurn(app, reg, maya, { text: `please ${tool}` });
    return { conversationId: turn.conversationId, card: turn.pending[0] };
  };

  beforeAll(async () => {
    world = await chatWorld();
    app = world.app;
    maya = await world.as("maya");
  });
  afterAll(() => world?.t.drop());

  it.each([
    { name: "already_done still resolves with the earlier result", setup: "ran", reg: "chat", expects: { resolves: true } },
    { name: "already_cancelled still throws the cancelled error", setup: "cancelled", reg: "chat", expects: { rejects: /already cancelled/ } },
    { name: "expired still throws the expiry", setup: "expire", reg: "chat", expects: { rejects: /already expired/ } },
    { name: "needs_secret still asks for the value", setup: null, reg: "vault", expects: { rejects: /type the code first/ } },
    { name: "run fails closed and the write never runs", setup: null, reg: "chat", expects: { rejects: /trace store down/, notRun: true } },
  ] as const)("$name", async ({ setup, reg, expects }) => {
    const r = reg === "vault" ? withVault : registry;
    const target = reg === "vault" ? null : await note("target");
    const { conversationId, card } = reg === "vault" ? await propose("set_code", {}, r) : await propose("archive_conversation", { id: target });
    const key = `chat:${card.id}`;
    if (setup === "expire") await rows(sql`update chat.conversation set pending = jsonb_set(pending, '{0,createdAt}', '"2026-01-01T00:00:00Z"') where id = ${conversationId}`);
    if (setup === "ran") await withIdempotency(key, () => r.call(maya, card.tool, card.input, { source: "chat" }));
    if (setup === "cancelled") await withTenant(app, T, (tx) => claimKey(tx, T, key, { cancelled: true }));
    trace.failDecided = true;
    try {
      const run = confirmAction(app, r, maya, conversationId, card.id);
      if ("resolves" in expects) await expect(run).resolves.toMatchObject({ action: { id: card.id } });
      else await expect(run).rejects.toThrow(expects.rejects);
    } finally {
      trace.failDecided = false;
    }
    if ("notRun" in expects) {
      expect(await rows(sql`select archived_at from chat.conversation where id = ${target}`)).toEqual([{ archived_at: null }]);
      expect(await rows(sql`select count(*)::int as n from core.idempotency where key = ${key}`)).toEqual([{ n: 0 }]);
    }
  });
});
