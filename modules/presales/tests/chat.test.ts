import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction, type Intent } from "@amax/chat";
import manifest from "../module";
import { chatIntents } from "../chat";
import { presalesDb, T } from "./db";

describe("AC-3 the new-opportunity intent", () => {
  it("names the create tool and asks for client, title and value", () => {
    expect(manifest.chatIntents).toEqual(chatIntents);
    expect(chatIntents.map((i) => [i.id, i.tool, i.required])).toEqual([["presales.new-opportunity", "create_opportunity", ["client", "title", "value"]]]);
    const create = manifest.mcpTools!.find((t) => t.name === "create_opportunity")!;
    expect(create.input.safeParse({ client: "Woodgrove Bank", title: "AI governance", value: 60000 }).success).toBe(true);
  });
});

describe.skipIf(!hasDb)("AC-3 new opportunity through chat (Postgres, scripted model)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  beforeAll(async () => {
    db = await presalesDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  });
  afterAll(() => db?.t.drop());

  it("becomes a confirm card, and confirming adds it with the original currency and a USD value", async () => {
    const liam = await db.as("liam");
    const input = { client: "Woodgrove Bank", title: "AI governance and ISO 42001 readiness", value: 60000, currency: "USD", ownerName: "Maya Fernando" };
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "create_opportunity", input }] }), () => ({ text: "Here it is. Add it?" })]), db: db.app, model: "claude-haiku-5-5" });
    const intent = chatIntents[0] as unknown as Intent;
    const registry = createRegistry(db.modules);
    const turn = await chatTurn(db.app, registry, liam, { text: "Woodgrove Bank wants AI governance help, about $60k, Maya to lead", intent });
    expect(turn.pending).toHaveLength(1);
    expect(await db.q(sql`select 1 from presales.opportunity where title = ${input.title}`)).toHaveLength(0);
    const { result } = await confirmAction(db.app, registry, liam, turn.conversationId, turn.pending[0].id);
    expect(result).toMatchObject({ number: "PS-0143", valueUsd: "60000.0000" });
    const [audit] = await db.q(sql`select source from core.audit_event where action = 'presales.opportunity.create' order by seq desc limit 1`);
    expect(audit.source).toBe("chat");
  });
});
