import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { githubCallback } from "../server/callback";
import { ctxFor } from "../server/context";
import { latestResult } from "../server/read";
import { ResultNote, UNMATCHED } from "../ui/ResultNote";
import { gitAccountsDatabase } from "./setup";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup(node as never).replace(/&#x27;/g, "'");

// 112 AC-2: the note after GitHub's return comes from the person's own connect record, never from the URL.
describe.skipIf(!hasDb)("112 the Git accounts note reads the person's own connect (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, nimal: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, nimal] = [await db.as("kasun"), await db.as("nimal")]; await db.setUpApp(); }, 120_000);
  afterAll(() => db?.drop());
  const returnWith = async (v: Viewer, code: string) => {
    const r = (await db.registry.call(v, "connect_github", {}, { source: "mcp" })) as { open: { url: string } };
    return githubCallback(ctxFor(v), { state: new URL(r.open.url).searchParams.get("state")!, code });
  };
  const note = async (v: Viewer, connectedAs?: { logins: string[]; emails: number }) =>
    html(ResultNote({ shown: true, record: await latestResult(v), connectedAs }));

  it.each([
    ["a connect that worked, from its record", "kasun", "good", { logins: ["kasun-dias"], emails: 2 }, "GitHub connected as @kasun-dias: 2 emails"],
    ["a connect GitHub refused, from its record", "kasun", "noverified", undefined, "GitHub has no verified email for you"],
    ["someone with no connect of their own, whatever the URL says", "nimal", null, { logins: ["x"], emails: 9 }, UNMATCHED],
  ])("AC2 %s", async (_name, who, code, connectedAs, text) => {
    const v = who === "kasun" ? kasun : nimal;
    if (code) await returnWith(v, code);
    expect(await note(v, connectedAs)).toContain(text);
  });

  it("AC2 the URL alone shows nothing when the note isn't asked for", async () => {
    expect(await html(ResultNote({ shown: false, record: await latestResult(kasun) }))).toBe("");
  });
});
