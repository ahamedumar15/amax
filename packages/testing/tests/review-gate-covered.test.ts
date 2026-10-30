import { beforeAll, describe, expect, it } from "vitest";
import { gateRepo, round } from "./review-gate-fixture";

const { init, branch, run } = gateRepo();
const cover = ".specclaw/changes/archive/101-cover";
const covered = (name: string, header: string) => () => ({ [`.specclaw/changes/${name}/change.md`]: `**Review:** ${header}\n` });
const heads: Record<string, string> = {};

beforeAll(() => {
  init(
    () => ({ [`${cover}/change.md`]: "**Review:** change\n## Verify\n" }),
    (h) => ({ [`${cover}/review/round-1.json`]: round(1, h, { final: true, status: "clean" }) }),
  );
  heads.covered = branch("covered", [covered("103-stacked", "covered-by 101-cover")]);
  heads.missing = branch("missing", [covered("103-stacked", "covered-by 109-nowhere")]);
  heads.self = branch("self", [covered("103-stacked", "covered-by 103-stacked")]);
  heads.unnamed = branch("unnamed", [covered("103-stacked", "covered-by")]);
  heads.chain = branch("chain", [covered("103-stacked", "covered-by 101-cover"), covered("104-chained", "covered-by 103-stacked")]);
});

describe("078 covered-by review scope", () => {
  it("AC1 AC2 a fork PR judges a covered-by change by the named change's rounds, touched or not", () => {
    expect(run(heads.covered, true)).toMatchObject({
      code: 0,
      out: expect.stringMatching(/103-stacked\s+scope=covered-by pass — covered by 101-cover: final round 1\/5 clean/),
    });
  });

  it("AC3 fails when the named change is missing, unnamed, itself, or covered-by in turn", () => {
    expect(run(heads.missing, true)).toMatchObject({ code: 1, out: expect.stringMatching(/fail — covered by 109-nowhere: no such change/) });
    expect(run(heads.unnamed, true).out).toMatch(/fail — covered by \(none\): covered-by names no change/);
    expect(run(heads.self, true).out).toMatch(/fail — covered by 103-stacked: a change can't cover itself/);
    expect(run(heads.chain, true).out).toMatch(/104-chained .*fail — covered by 103-stacked: 103-stacked is itself covered-by, no chains/);
  });

  it("AC4 a same-repo PR skips a covered-by change", () => {
    expect(run(heads.missing, false)).toMatchObject({ code: 0, out: expect.stringMatching(/103-stacked\s+scope=covered-by skip/) });
  });
});
