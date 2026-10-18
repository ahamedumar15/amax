import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn } from "@amax/chat";
import { putSecret, type CredentialRow } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { expiringSoon } from "../../lib/admin/credentials";
import { adminDb, AU, T } from "./fixture";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const row = (expiresAt: Date): CredentialRow => ({ connector: "github", status: "active", expiresAt, lastRotatedAt: null, lastUsedAt: null, lastUsedPurpose: null, revokedAt: null, revokeReason: null });

describe("053 AC-7 the shared expiringSoon never counts a credential past its expiry", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it.each([[-3, false], [0, false], [0.5, true], [10, true], [45, false]])("expires in %s days → %s", (days, soon) => {
    expect(expiringSoon(row(new Date(now.getTime() + days * DAY)), now)).toBe(soon);
  });
});

describe.skipIf(!hasDb)("053 settings hardening (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  let maya: Viewer;
  const call = (name: string, args: Record<string, unknown>) => db.registry.call(maya, name, args, { source: "mcp" });
  beforeAll(async () => {
    db = await adminDb();
    maya = await db.as("maya");
    const seed = (connector: string, days: number) => putSecret(contextFor.job(T, "seed"), { connector, value: `test-${connector}`, expiresAt: `${at(days)}T23:59:59Z` });
    await seed("github", 10);
    await seed("xero", 200);
    await seed("teams", 5);
    await db.t.owner`update secrets.credential set expires_at = now() - interval '5 days' where connector = 'teams'`;
  });
  afterAll(() => db?.t.drop());

  it("AC-5 rotating an expired credential without a new expiry makes no card, and the model is told why", async () => {
    configureAi({ db: db.app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "rotate_secret", input: { connector: "teams" } }, { type: "tool_use", id: "c2", name: "rotate_secret", input: { connector: "xero" } }] }),
      () => ({ text: "Done." }),
    ]) });
    const turn = await chatTurn(db.app, db.registry, maya, { text: "rotate them" });
    expect(turn.pending.map((p) => p.input.connector)).toEqual(["xero"]);
    const [convo] = await db.t.owner`select messages::text as m from chat.conversation where id = ${turn.conversationId}`;
    expect(convo.m).toMatch(/No confirm card was made: the teams credential's expiry \(\d{4}-\d{2}-\d{2}\) has passed/);
  }, 60_000);

  it("AC-6 each Keys ticket's list_secrets filter returns exactly what it counts", async () => {
    const names = async (filter?: string) => ((await call("list_secrets", filter ? { filter } : {})) as { connector: string }[]).map((r) => r.connector).sort();
    expect(await names("expiring")).toEqual(["github"]);
    expect(await names("rotated")).toEqual(["github", "xero"]);
    expect(await names("all")).toEqual(await names());
    expect(await names()).toEqual(["github", "teams", "xero"]);
  }, 60_000);

  it("AC-7 the hub counts the expired credential as expired and shows an unpriced call as unknown, never $0", async () => {
    const [keys] = (await call("settings_overview", { area: "keys" })) as { chip: { text: string } }[];
    expect(keys.chip.text).toBe("1 expired");
    await db.t.owner`insert into ai.call (tenant_id, caller, source, purpose, model, ok, cost_usd) values (${T}, 'user:maya', 'chat', 'chat', 'm', true, null)`;
    const [usage] = (await call("settings_overview", { area: "ai-usage" })) as { chip: { text: string } }[];
    expect(usage.chip.text).toMatch(/^(Unknown|\$\d+\.\d\d \+ unknown) this month$/);
  }, 60_000);

  it("AC-8 set_entity_zone refuses an ambiguous entity name and lists the candidates", async () => {
    await db.t.owner`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${T}, ${AU.name.toUpperCase()}, 'AU', 'AUD')`;
    const set = call("set_entity_zone", { entity: AU.name.toLowerCase(), timezone: "Australia/Sydney" });
    await expect(set).rejects.toMatchObject({ code: "invalid_input" });
    await expect(set).rejects.toThrow(new RegExp(`names 2 legal entities; give the id of one: .*${AU.id}`));
    await expect(call("set_entity_zone", { entity: AU.id, timezone: "Australia/Sydney" })).resolves.toBeTruthy();
  }, 60_000);
});
