import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Db } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { chatTurn } from "@amax/chat";
import { chatWorld, registry, scripted } from "../../../packages/chat/tests/world";

const signedIn = vi.hoisted(() => ({ viewer: undefined as unknown, db: undefined as unknown }));
vi.mock("@amax/auth", async (real) => ({ ...(await real<object>()), currentViewer: async () => signedIn.viewer }));
vi.mock("../lib/server", () => ({ getDb: () => signedIn.db, toolRegistry: () => registry }));

const { listChats, openChat } = await import("../app/actions/chat-history");

describe.skipIf(!hasDb)("049 history page actions (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let maya: Viewer, sahan: Viewer, id: string;

  beforeAll(async () => {
    world = await chatWorld();
    signedIn.db = world.app as Db;
    maya = await world.as("maya");
    sahan = await world.as("sahan");
    scripted(world.app, [() => ({ text: "Sure." })]);
    id = (await chatTurn(world.app, registry, maya, { text: "Plan the November bench" })).conversationId;
  });
  afterAll(() => world?.t.drop());

  it("AC4 user B, an Admin, gets nothing when listing or opening user A's chat", async () => {
    signedIn.viewer = maya;
    expect(await listChats("")).toMatchObject({ ok: true, items: [{ id, title: "Plan the November bench" }] });
    expect(await openChat(id)).toMatchObject({ ok: true, conversation: { id } });
    signedIn.viewer = sahan;
    expect(await listChats("")).toEqual({ ok: true, items: [] });
    expect(await listChats("November")).toEqual({ ok: true, items: [] });
    expect(await openChat(id)).toEqual({ ok: false, error: "That chat isn't in your history." });
  });
});
