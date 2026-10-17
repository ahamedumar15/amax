import { describe, expect, it } from "vitest";
import { maskEvent, webhookEvents } from "../src";

// Review 058 (rounds 1 and 2): outgoing payloads are masked by what the emitting module declared for
// that event, and fail closed: a field it didn't declare never leaves amax in the clear.
const fields = { personId: "plain", epfNumber: "pay", bankAccount: "bank", detail: "plain" } as const;

describe("058 outgoing webhook masking follows the event's declaration and fails closed", () => {
  it.each([
    ["a plain field is sent", { personId: "p-1" }, { personId: "p-1" }],
    ["a classified field is masked with its class", { epfNumber: "EPF-123" }, { epfNumber: { masked: true, class: "pay" } }],
    ["another class", { bankAccount: "000-111" }, { bankAccount: { masked: true, class: "bank" } }],
    ["an undeclared field is masked", { epf_number: "EPF-123" }, { epf_number: { masked: true, class: "undeclared" } }],
    ["an undeclared harmless-looking field is masked too", { amount: 10 }, { amount: { masked: true, class: "undeclared" } }],
    ["a pay field nested in a plain one is caught by the net", { detail: { salary: 1, note: "x" } }, { detail: { salary: { masked: true, class: "pay" }, note: "x" } }],
  ])("%s", (_, payload, want) => expect(maskEvent(payload, fields)).toEqual(want));

  it("an event with no declaration sends nothing in the clear", () => {
    expect(maskEvent({ personId: "p-1", name: "Test Person" }, undefined)).toEqual({ personId: { masked: true, class: "undeclared" }, name: { masked: true, class: "undeclared" } });
  });

  it("each module's declaration applies only to its own events", () => {
    const events = webhookEvents([
      { events: { emits: ["a.thing.done"], payloads: { "a.thing.done": { amount: "plain" } } } },
      { events: { emits: ["b.pay.run"], payloads: { "b.pay.run": { amount: "pay" } } } },
    ]);
    const a = events.find((e) => e.name === "a.thing.done")!;
    const b = events.find((e) => e.name === "b.pay.run")!;
    expect([maskEvent({ amount: 5 }, a.fields), maskEvent({ amount: 5 }, b.fields)]).toEqual([{ amount: 5 }, { amount: { masked: true, class: "pay" } }]);
  });

  it.each([
    ["one says plain, one classifies: the class wins", { amount: "plain" }, { amount: "pay" }, { amount: 5 }, { amount: { masked: true, class: "pay" } }],
    ["classified first, plain second: the class still wins", { amount: "pay" }, { amount: "plain" }, { amount: 5 }, { amount: { masked: true, class: "pay" } }],
    ["a field only one declares is undeclared", { amount: "plain", note: "plain" }, { amount: "plain" }, { amount: 5, note: "x" }, { amount: 5, note: { masked: true, class: "undeclared" } }],
    ["an emitter with no declaration masks everything", { amount: "plain" }, undefined, { amount: 5 }, { amount: { masked: true, class: "undeclared" } }],
  ] as const)("two emitters of one event: %s", (_, first, second, payload, want) => {
    const [e] = webhookEvents([{ events: { emits: ["x.y.z"], payloads: { "x.y.z": first } } }, { events: { emits: ["x.y.z"], payloads: second ? { "x.y.z": second } : {} } }]);
    expect(maskEvent(payload, e.fields)).toEqual(want);
  });
});

