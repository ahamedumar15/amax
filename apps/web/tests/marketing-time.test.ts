import { describe, expect, it } from "vitest";
import { surfaces } from "./marketing-prose";

// Any clause that mentions hours must say they are drafted or accepted, unless it is a listed neutral
// label. A closed list, so a new wording fails by default whatever verb it uses (review rounds 10–12).
const HOURS = /\b\d+(?:\.\d+)?\s*(?:h|hours?)\b|\bhours\b|\btimes?(?:heets?)?\b|\bbookkeeping\b/i;
const OWNED = /\b(accept\w*|draft\w*|suggest\w*)\b/i;
const NEUTRAL = new Set(["Time and approvals."]);

const clauses = (body: string) => body.split(/(?<=[!?]|[^\d]\.)\s+|\n+/).flatMap((s) => s.split(/[,;:]/)).map((c) => c.trim());
const unowned = (body: string) => clauses(body).filter((c) => HOURS.test(c) && !OWNED.test(c) && !NEUTRAL.has(c));

describe("062 AC-3 commit hours are drafted and accepted, never written on their own", () => {
  it.each(surfaces())("%s", (_where, body) => {
    expect(unowned(body)).toEqual([]);
  });
  it.each([
    ["Commits close tasks and log time."],
    ["amax logs 2.5 h to Contoso Portal (fictional) and asks the PM to approve the week."],
    ["Wednesday goes from 5.0 to 7.5 hours: +2.5 h, agent for Kasun Dias."],
    ["In amax, agents fill in the timesheet over MCP."],
    ["In amax, agents do that bookkeeping over MCP."],
    ["Agents log 2.5 h, and the draft is reviewed later."],
    ["amax is logging 2.5 h for Kasun on Wednesday."],
    ["The 2.5 h landed on Kasun's timesheet."],
    ["Wednesday went from 5.0 to 7.5 h."],
    ["The agent submits Kasun's hours."],
  ])("rejects %s", (claim) => {
    expect(unowned(claim).length).toBeGreaterThan(0);
  });
});
