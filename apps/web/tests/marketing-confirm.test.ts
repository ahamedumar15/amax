import { describe, expect, it } from "vitest";
import { sentences, surfaces } from "./marketing-prose";

const CONFIRM = /confirm|asks before|waits for|approval before/i;
const TIME = /\blog(s|ged)?\b[^.]*\b(time|hours)\b|\b(time|hours)\b[^.]*\blogged\b/i;
const confirmClaims = (body: string) => sentences(body, CONFIRM).filter((s) => !/^\s*Confirm\b/.test(s));
const chatOnly = (s: string) => /\bin chat\b/i.test(s) && !/\b(MCP|over the API)\b[^.]*\b(asks|waits|confirm)/i.test(s);
const accepted = (s: string) => /\b(accept|accepts|accepted|draft|drafts|suggest|suggests|suggested)\b/i.test(s);

describe("062 AC-3 the page claims only how amax really behaves", () => {
  it.each(surfaces())("%s: every confirm is scoped to chat", (_where, body) => {
    expect(body.length).toBeGreaterThan(40);
    for (const s of confirmClaims(body)) expect([s, chatOnly(s)]).toEqual([s, true]);
  });
  it.each(surfaces())("%s: commit hours are drafted and accepted, never logged on their own", (_where, body) => {
    for (const s of sentences(body, TIME)) expect([s, accepted(s)]).toEqual([s, true]);
  });
  it.each([["Each write waits for a confirm, then is audited."], ["amax asks before it changes anything."], ["In chat and over MCP, amax asks before it changes anything."]])("rejects the confirm claim %s", (claim) => {
    expect(confirmClaims(claim).every(chatOnly)).toBe(false);
  });
  it.each([["Commits close tasks and log time."], ["Agents log time for you."], ["Wednesday's hours are logged by the agent."]])("rejects the time claim %s", (claim) => {
    expect(sentences(claim, TIME).every(accepted)).toBe(false);
  });
});
