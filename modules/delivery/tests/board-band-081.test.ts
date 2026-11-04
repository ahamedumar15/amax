import { describe, expect, it } from "vitest";
import { proposalsBand, stepsOf, tasksBand, timeBand } from "../ui/band";

describe("081 amendment 4: the board's band, the stepper and the Time band", () => {
  it("AC42 Proposals counts what is in flight per phase, leaves out released, and says it in one sentence", () => {
    const b = proposalsBand([{ phase: "proposed" }, { phase: "proposed" }, { phase: "planned" }, { phase: "building" }, { phase: "building" }, { phase: "verified" }, { phase: "verified" }, { phase: "released" }]);
    expect(b.total).toBe(7);
    expect(b.segments).toEqual([{ phase: "proposed", count: 2 }, { phase: "planned", count: 1 }, { phase: "building", count: 2 }, { phase: "verified", count: 2 }]);
    expect(b.sentence).toBe("7 proposals in flight: 2 proposed, 1 planned, 2 building, 2 verified");
    expect(proposalsBand([{ phase: "released" }])).toEqual({ total: 0, segments: [], sentence: "0 proposals in flight" });
  });

  it("AC42 Tasks splits the done ones by who closed them, and never claims more than were done", () => {
    expect(tasksBand(9, 16, { agents: 6, people: 3 })).toMatchObject({ agents: 6, people: 3, unrecorded: 0, open: 7, sentence: "9 of 16 tasks done: 6 by agents, 3 by people, 7 open" });
    expect(tasksBand(9, 16, { agents: 2, people: 1 })).toMatchObject({ unrecorded: 6, sentence: "9 of 16 tasks done: 2 by agents, 1 by people, 6 not recorded, 7 open" });
    expect(tasksBand(3, 4, { agents: 10, people: 4 })).toMatchObject({ agents: 3, people: 0, unrecorded: 0, open: 1 });
  });

  const base = { withdrawn: false, createdAt: "2026-10-02T10:30:00.000Z", releasedAt: null, history: [
    { kind: "moved" as const, to: "planned", at: "2026-10-09T09:00:00.000Z" },
    { kind: "moved" as const, to: "building", at: "2026-10-15T09:02:00.000Z" },
    { kind: "task" as const, at: "2026-10-20T10:00:00.000Z" },
  ] };

  it("AC47 the stepper marks done steps with the date they were entered, the current one, and those to come", () => {
    expect(stepsOf({ ...base, phase: "building" })).toEqual([
      { phase: "proposed", state: "done", at: "2026-10-02T10:30:00.000Z" },
      { phase: "planned", state: "done", at: "2026-10-09T09:00:00.000Z" },
      { phase: "building", state: "current", at: "2026-10-15T09:02:00.000Z" },
      { phase: "verified", state: "todo", at: null },
      { phase: "released", state: "todo", at: null },
    ]);
  });

  it("AC47 a withdrawn proposal crosses out the step it was in; a released one is done throughout", () => {
    expect(stepsOf({ ...base, phase: "building", withdrawn: true }).map((s) => s.state)).toEqual(["done", "done", "withdrawn", "todo", "todo"]);
    const released = stepsOf({ ...base, phase: "released", releasedAt: "2026-10-30T12:00:00.000Z" });
    expect(released.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done"]);
    expect(released.at(-1)?.at).toBe("2026-10-30T12:00:00.000Z");
    expect(released[3].at).toBeNull();
  });

  it("AC49 the Time band shows hours over the estimate as their own part, and says when there is no estimate", () => {
    expect(timeBand(18, 16)).toMatchObject({ within: 16, over: 2, left: 0, figure: "18 h", rest: "of 16 h estimated", sentence: "18 h approved of 16 h estimated, 2 h over" });
    expect(timeBand(11.5, 16)).toMatchObject({ within: 11.5, over: 0, left: 4.5, sentence: "11.5 h approved of 16 h estimated, 4.5 h left" });
    expect(timeBand(11.5, null)).toMatchObject({ estimate: null, figure: "11.5 h", rest: "approved · no estimate" });
  });
});
