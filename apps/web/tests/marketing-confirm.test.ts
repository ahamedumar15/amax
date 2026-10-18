import { describe, expect, it } from "vitest";
import { sentences, surfaces } from "./marketing-prose";

const CONFIRM = /confirm|asks before|waits for|approval before/i;
const confirmClaims = (body: string) => sentences(body, CONFIRM).filter((s) => !/^\s*Confirm\b/.test(s));
const chatOnly = (s: string) => /\bin chat\b/i.test(s) && !/\b(MCP|over the API)\b[^.]*\b(asks|waits|confirm)/i.test(s);

describe("062 AC-3 a confirm is claimed only for chat", () => {
  it.each(surfaces())("%s: every confirm is scoped to chat", (_where, body) => {
    expect(body.length).toBeGreaterThan(40);
    for (const s of confirmClaims(body)) expect([s, chatOnly(s)]).toEqual([s, true]);
  });
  it.each([["Each write waits for a confirm, then is audited."], ["amax asks before it changes anything."], ["In chat and over MCP, amax asks before it changes anything."]])("rejects the confirm claim %s", (claim) => {
    expect(confirmClaims(claim).every(chatOnly)).toBe(false);
  });
});
