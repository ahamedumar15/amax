import { describe, expect, it } from "vitest";
import { scriptedWrite } from "@amax/ai/scripted-writes";
import { approveAllPrompt, decidePrompt, fixOtherPrompt, remindAllPrompt } from "../ui/prompts";

const rows = [
  { weekId: "11111111-1111-4111-8111-111111111111", personName: "Nimal Silva" },
  { weekId: "22222222-2222-4222-8222-222222222222", personName: "Kasun Dias" },
  { weekId: "33333333-3333-4333-8333-333333333333", personName: "Seán O'Neill" },
];
const run = (prompt: string) => scriptedWrite(prompt)?.map((c) => [c.name, c.input]);

// 057: the Team time buttons' prompts name the exact week by id, and the scripted model reads that id back.
describe("057 Team time prompts carry the week id end to end", () => {
  it.each([
    ["Approve, one row", decidePrompt("Approve", rows[0], "2026-W42"), [["approve_week", { weekId: rows[0].weekId }]]],
    ["Remind, a name with an apostrophe", decidePrompt("Remind", rows[2], "2026-W42"), [["remind_week", { weekId: rows[2].weekId }]]],
    ["Approve all, two", approveAllPrompt(rows.slice(0, 2), "2026-W42"), rows.slice(0, 2).map((r) => ["approve_week", { weekId: r.weekId }])],
    ["Remind all, three", remindAllPrompt(rows, "2026-W42"), rows.map((r) => ["remind_week", { weekId: r.weekId }])],
  ])("%s", (_n, prompt, want) => {
    expect(prompt).toContain("week id");
    expect(run(prompt)).toEqual(want);
  });
});

describe("070 AC-14 Team time's Fix hours prompt", () => {
  it("AC14 names the person and the week id and asks for a reason", () => {
    const prompt = fixOtherPrompt(rows[1], "2026-W42");
    expect(prompt).toContain(`Kasun Dias's hours for 2026-W42 (week id ${rows[1].weekId})`);
    expect(prompt).toMatch(/Reason: $/);
  });
});
