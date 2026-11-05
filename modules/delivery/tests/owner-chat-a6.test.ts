import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatIntents } from "../chat";
import { createProposalCard, updateCard } from "../server/proposal-card";
import { proposalDb } from "./proposal-db";

describe("081 amendment 6 picking a proposal's owner in chat", () => {
  it("AC69 New proposal asks who owns it on a choice card: Me first, then the project's team", () => {
    const intent = chatIntents.find((i) => i.id === "delivery.new-proposal")!;
    expect(intent.required).not.toContain("ownerUserId");
    const ask = intent.fields.find((f) => f.name === "ownerUserId")!.ask;
    expect(ask).toMatch(/get_project_team/);
    expect(ask).toMatch(/offer_choices/);
    expect(ask).toMatch(/first "Me"/);
  });
});

describe.skipIf(!hasDb)("081 amendment 6 owner cards (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer, kasun: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    [maya, nimal, kasun] = await Promise.all([db.as("maya"), db.as("nimal"), db.as("kasun")]);
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC70 the create card says someone else named as owner will be told", async () => {
    const other = await createProposalCard(maya, { projectKey: "CON", title: "Dunning", ownerUserId: nimal.userId });
    expect(other.lines).toContainEqual({ label: "Owner", value: "Nimal Silva · they'll be told" });
    expect((await createProposalCard(maya, { projectKey: "CON", title: "Mine", ownerUserId: maya.userId })).lines).toContainEqual({ label: "Owner", value: "You" });
  });

  it("AC71 the owner-change card shows From and To and names who will be told", async () => {
    const card = await updateCard(maya, { key: "CON-017", ownerUserId: kasun.userId });
    expect(card.lines).toEqual([{ label: "From", value: "Nimal Silva" }, { label: "To", value: "Kasun Dias" }, { label: "Told", value: "Kasun Dias and Nimal Silva will be told" }]);
    expect(card.look).toMatchObject({ confirm: "Change owner", done: "Kasun Dias now owns CON-017" });
  });
});
