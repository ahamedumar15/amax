import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatTurn } from "../src";
import { repinAll, repinConversations, repinOf, type Repin } from "../src/repin";
import { chatWorld, registry, scripted, T } from "./world";

// 057: a rename rewrites the open conversation's pins that name the record by its old name.
describe("057 repin after a rename", () => {
  const tag: Repin = { tools: ["get_release", "get_release_history", "get_deployment"], match: { projectKey: "CON", version: "v2.4.0" }, set: { version: "v2.4.1" }, label: ["v2.4.0", "v2.4.1"] };
  const env: Repin = { tools: ["get_environment"], match: { projectKey: "HRI", name: "Staging" }, set: { name: "Preview" }, label: ["Staging", "Preview"] };
  it.each([
    ["a release-history pin by version", tag, { label: "CON v2.4.0 proposals", tool: "get_release_history", args: { projectKey: "CON", version: "v2.4.0" } },
      { label: "CON v2.4.1 proposals", tool: "get_release_history", args: { projectKey: "CON", version: "v2.4.1" } }],
    ["a release-list row pin", tag, { label: "Contoso Portal v2.4.0", tool: "get_release", args: { projectKey: "CON", version: "v2.4.0" } },
      { label: "Contoso Portal v2.4.1", tool: "get_release", args: { projectKey: "CON", version: "v2.4.1" } }],
    ["an environment pin by name", env, { label: "HRI Staging", tool: "get_environment", args: { projectKey: "HRI", name: "Staging" } },
      { label: "HRI Preview", tool: "get_environment", args: { projectKey: "HRI", name: "Preview" } }],
    ["another project's release", tag, { label: "VID v2.4.0", tool: "get_release", args: { projectKey: "VID", version: "v2.4.0" } }, null],
    ["an id-keyed pin", tag, { label: "CON v2.4.0", tool: "get_release_history", args: { releaseId: "r-1" } }, null],
    ["a pin of another tool", tag, { label: "CON v2.4.0", tool: "list_releases", args: { projectKey: "CON", version: "v2.4.0" } }, null],
    ["a short old name elsewhere in the label", { tools: ["get_environment"], match: { projectKey: "QA", name: "QA" }, set: { name: "Test" }, label: ["QA", "Test"] as [string, string] },
      { label: "QA QA", tool: "get_environment", args: { projectKey: "QA", name: "QA" } }, { label: "QA Test", tool: "get_environment", args: { projectKey: "QA", name: "Test" } }],
    ["the old name inside a longer word", { tools: ["get_environment"], match: { projectKey: "HRI", name: "UAT" }, set: { name: "Pre" }, label: ["UAT", "Pre"] as [string, string] },
      { label: "HRI UAT2 UAT", tool: "get_environment", args: { projectKey: "HRI", name: "UAT" } }, { label: "HRI UAT2 Pre", tool: "get_environment", args: { projectKey: "HRI", name: "Pre" } }],
  ])("%s", (_n, repin, pin, want) => expect(repinAll([pin], repin)).toEqual([want ?? pin]));

  it.each([
    ["a tag result", { version: "v2.4.1", repin: tag }, tag],
    ["no repin", { version: "v2.4.1" }, undefined],
    ["an empty match", { repin: { ...tag, match: {} } }, undefined],
    ["a non-string set", { repin: { ...tag, set: { version: 3 } } }, undefined],
    ["tools not a list", { repin: { ...tag, tools: "get_release" } }, undefined],
  ])("repinOf: %s", (_n, result, want) => expect(repinOf(result)).toEqual(want));
});

describe.skipIf(!hasDb)("057 repinConversations rewrites this person's saved pins (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  beforeAll(async () => { world = await chatWorld(); }, 60_000);
  afterAll(() => world?.t.drop());

  const pin = (version: string) => ({ label: `CON ${version} proposals`, tool: "get_release_history", args: { projectKey: "CON", version } });
  const say = async (who: Viewer, pins: ReturnType<typeof pin>[]) => {
    scripted(world.app, [() => ({ text: "Noted." })]);
    return (await chatTurn(world.app, registry, who, { text: "look", pins })).conversationId;
  };
  const saved = async (id: string) => (await withTenant(world.app, T, (tx) => tx.execute(sql`select pins from chat.conversation where id = ${id}`)))[0].pins;

  it("the open conversation, another of mine and History all read the new version; someone else's and untouched pins stay", async () => {
    const [maya, sahan] = [await world.as("maya"), await world.as("sahan")];
    const open = await say(maya, [pin("v2.4.0"), pin("v2.3.0")]);
    const older = await say(maya, [pin("v2.4.0")]);
    const theirs = await say(sahan, [pin("v2.4.0")]);
    const tag: Repin = { tools: ["get_release_history"], match: { projectKey: "CON", version: "v2.4.0" }, set: { version: "v2.4.1" }, label: ["v2.4.0", "v2.4.1"] };
    const back = await repinConversations(world.app, maya, open, tag);
    expect(back).toEqual([pin("v2.4.1"), pin("v2.3.0")]);
    expect(await saved(open)).toEqual([pin("v2.4.1"), pin("v2.3.0")]);
    expect(await saved(older)).toEqual([pin("v2.4.1")]);
    expect(await saved(theirs)).toEqual([pin("v2.4.0")]);
  }, 60_000);
});
