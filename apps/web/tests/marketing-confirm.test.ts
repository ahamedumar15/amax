import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREAS } from "../components/marketing/areas";
import { DESCRIPTION, HERO_LEDE, STEPS } from "../components/marketing/copy";

const mock = readFileSync(new URL("../../../.specclaw/mock/index.html", import.meta.url), "utf8");
const section = mock.slice(mock.indexOf('data-change="062-marketing-site"'), mock.indexOf("</section>", mock.indexOf('data-change="062-marketing-site"'))).replace(/<[^>]+>/g, " ");
const CONFIRM = /confirm|asks before|waits for|approval before/i;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => CONFIRM.test(s) && !/^Confirm\b/.test(s.trim()));

describe("062 AC-3 a confirm is claimed only for chat, never for every write or MCP", () => {
  const surfaces = [
    ["hero", HERO_LEDE], ["description", DESCRIPTION],
    ["how it works", STEPS.map((s) => `${s.title}. ${s.body}`).join(" ")],
    ["features", AREAS.flatMap((a) => a.live.map((c) => `${c.text}.`)).join(" ")],
    ["mock 062 section", section],
  ] as const;
  it.each(surfaces)("%s scopes every confirm sentence to chat", (_where, text) => {
    for (const s of sentences(text)) expect(s).toMatch(/\bin chat\b/i);
  });
  it.each([["Each write waits for a confirm, then is audited."], ["amax asks before it changes anything."], ["Every MCP write waits for approval before it runs."]])("rejects the unscoped claim %s", (claim) => {
    expect(sentences(claim).every((s) => /\bin chat\b/i.test(s))).toBe(false);
  });
});
