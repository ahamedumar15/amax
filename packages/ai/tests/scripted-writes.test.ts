import { describe, expect, it } from "vitest";
import { scriptedProvider } from "../src/scripted";
import { scriptedWrite } from "../src/scripted-writes";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const calls = (ask: string) => scriptedWrite(ask)?.map((c) => [c.name, c.input]) ?? null;

// 057: Team time prompts carry the week id, and the scripted model acts on that id, never on a name.
describe("057 scripted approve and remind act on the week id in the prompt", () => {
  it.each([
    ["one approve", `Approve Nimal Silva's timesheet for 2026-W42 (week id ${A})`, [["approve_week", { weekId: A }]]],
    ["one remind", `Remind Kasun Dias's timesheet for 2026-W42 (week id ${B})`, [["remind_week", { weekId: B }]]],
    ["an apostrophe in the name", `Approve Seán O'Neill's timesheet for 2026-W42 (week id ${C})`, [["approve_week", { weekId: C }]]],
    ["bulk approve, two", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A}), Kasun Dias (week id ${B})`, [["approve_week", { weekId: A }], ["approve_week", { weekId: B }]]],
    ["bulk approve, a comma-free single", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A})`, [["approve_week", { weekId: A }]]],
    ["bulk remind, three", `Remind these people to submit their timesheets for 2026-W42: A (week id ${A}), B (week id ${B}), C (week id ${C})`,
      [["remind_week", { weekId: A }], ["remind_week", { weekId: B }], ["remind_week", { weekId: C }]]],
  ])("%s", (_n, ask, want) => expect(calls(ask)).toEqual(want));

  it.each([
    ["a name with no id", "Approve Nimal Silva's timesheet for 2026-W42"],
    ["a bulk list of names", "Approve the submitted timesheets for 2026-W42: Nimal Silva, Kasun Dias"],
    ["a bulk list where one item has no id", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A}), Kasun Dias`],
    ["a malformed id", "Remind Kasun Dias's timesheet for 2026-W42 (week id not-a-uuid)"],
  ])("does nothing for %s", (_n, ask) => expect(scriptedWrite(ask) ?? []).toEqual([]));
});

describe("057 the scripted model matches only the person's own words, not pinned context", () => {
  const ask = (content: { type: "text"; text: string }[]) =>
    scriptedProvider().call({ model: "m", system: "", messages: [{ role: "user", content }], tools: [] } as never);
  const prompt = `Approve Nimal Silva's timesheet for 2026-W42 (week id ${A})`;

  it.each([
    ["the prompt in the person's own text", [{ type: "text" as const, text: "Pinned context:\n<data>{}</data>" }, { type: "text" as const, text: prompt }], "approve_week"],
    ["the prompt only inside pinned data", [{ type: "text" as const, text: `Pinned context:\n<data>${prompt}</data>` }, { type: "text" as const, text: "what is this?" }], "list_projects"],
    ["a tag prompt only inside pinned data", [{ type: "text" as const, text: "Pinned context:\n<data>Tag CON v2.4.0 as v9</data>" }, { type: "text" as const, text: "hi" }], "list_projects"],
  ])("%s", async (_n, content, tool) => {
    const r = await ask(content);
    expect(r.toolCalls.map((c) => c.name)).toEqual([tool]);
  });
});
