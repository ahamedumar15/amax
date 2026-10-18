import { describe, expect, it } from "vitest";
import { surfaces } from "./marketing-prose";

const HOURS = /\b\d+(?:\.\d+)?\s*(?:h|hours?)\b|\bhours\b|\btimes?(?:heets?)?\b|\bbookkeeping\b/i;
const WRITES = /\b(log|logs|logged|add|adds|added|book|books|booked|record|records|recorded|fill|fills|filled|track|tracks|tracked|lands?|goes from|do(?:es)? that)\b/i;
const OWNED = /\b(accept|accepts|accepted|draft|drafts|drafted|suggest|suggests|suggested|suggestion)\b/i;

const claims = (body: string) => body.split(/(?<=[!?]|[^\d]\.)\s+|\n+/).flatMap((s) => s.split(/[,;:]/)).filter((c) => HOURS.test(c) && WRITES.test(c));

describe("062 AC-3 commit hours are drafted and accepted, never written on their own", () => {
  it.each(surfaces())("%s", (_where, body) => {
    for (const c of claims(body)) expect([c.trim(), OWNED.test(c)]).toEqual([c.trim(), true]);
  });
  it.each([
    ["Commits close tasks and log time."],
    ["amax logs 2.5 h to Contoso Portal (fictional) and asks the PM to approve the week."],
    ["Wednesday goes from 5.0 to 7.5 hours: +2.5 h, agent for Kasun Dias."],
    ["In amax, agents fill in the timesheet over MCP."],
    ["In amax, agents do that bookkeeping over MCP."],
    ["Agents log 2.5 h, and the draft is reviewed later."],
  ])("rejects %s", (claim) => {
    expect(claims(claim).length).toBeGreaterThan(0);
    expect(claims(claim).every((c) => OWNED.test(c))).toBe(false);
  });
});
