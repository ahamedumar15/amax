import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { SecretNotConfiguredError } from "@amax/core/secrets";
import { acceptSuggestion } from "@amax/agents/server";
import { setSyncSources } from "../sources";
import { applyDue } from "../server/apply";
import { ctxFor } from "../server/read";
import { runSync, setSecretOpener } from "../server/sync";
import { sharedDb, T } from "./db";

describe.skipIf(!hasDb)("sync and the write registration (Postgres)", () => {
  const use = sharedDb(true);
  afterAll(() => { setSecretOpener(null); setSyncSources(null); });

  it("AC1 sync opens only read credentials; approved changes use msgraph-write only after an Admin consents with named scopes", async () => {
    const db = use();
    const opened: string[] = [];
    setSecretOpener(async (_ctx, connector, _purpose, fn) => {
      opened.push(connector);
      if (connector === "github") throw new SecretNotConfiguredError(connector, "missing");
      return connector === "msgraph-write" ? (undefined as never) : fn("{}");
    });
    const [kasun] = await db.q(sql`select external_id from it_access.account where display_name = 'Kasun Dias'`);
    setSyncSources([
      { id: "graph", label: "Microsoft Graph", connector: "msgraph-read", fetch: async () => ({ products: [{ externalId: "0e3f0000-0000-4000-8000-00000000e301", seats: 200 }], accounts: [{ externalId: kasun.external_id as string, lastActiveOn: null, adminRoles: ["Teams admin"] }], devices: [] }) },
      { id: "github", label: "GitHub", connector: "github", fetch: async () => { throw new Error("unreachable"); } },
    ]);
    expect((await runSync(T)).map((r) => [r.source, r.status])).toEqual([["graph", "ok"], ["github", "skipped"]]);
    expect(opened).toEqual(["msgraph-read", "github"]);
    expect(await db.q(sql`select seats from it_access.product where key = 'm365-e3'`)).toEqual([{ seats: 200 }]);

    const [ravi, maya] = [await db.as("ravi"), await db.as("maya")];
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'it-access.remove-seats' and target_label = 'Figma Professional'`);
    await acceptSuggestion(ctxFor(ravi), { id: s.id as string });
    await applyDue(T);
    expect(await db.q(sql`select distinct status from it_access.change`)).toEqual([{ status: "manual" }]);
    expect(opened).not.toContain("msgraph-write");

    await expect(db.registry.call(ravi, "set_access_write_consent", { enabled: true, scopes: ["LicenseAssignment.ReadWrite.All"] }, { source: "mcp" })).rejects.toThrow();
    await db.registry.call(maya, "set_access_write_consent", { enabled: true, scopes: ["LicenseAssignment.ReadWrite.All"] }, { source: "mcp" });
    const [m365] = await db.q(sql`select id from it_access.product where key = 'm365-e3'`);
    const [dataco] = await db.q(sql`select id from it_access.account where display_name = 'Vendor contractor, DataCo'`);
    const grant = (await db.registry.call(ravi, "request_access_change", { action: "grant", accountId: dataco.id, productId: m365.id }, { source: "mcp" })) as { id: string };
    await expect(acceptSuggestion(ctxFor(ravi), { id: grant.id })).rejects.toThrow();
    await acceptSuggestion(ctxFor(maya), { id: grant.id });
    await applyDue(T);
    expect(opened.filter((c) => c === "msgraph-write")).toHaveLength(1);
    expect(await db.q(sql`select action, status from it_access.change where action = 'grant'`)).toEqual([{ action: "grant", status: "applied" }]);
  }, 240_000);
});
