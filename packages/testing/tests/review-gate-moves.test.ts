import { beforeAll, describe, expect, it } from "vitest";
import { gateRepo } from "./review-gate-fixture";

const { init, branch, run } = gateRepo();
const heads: Record<string, string> = {};
const folder = (name: string, extra = "") => ({
  [`.specclaw/changes/${name}/change.md`]: `**Change:** ${name} · **Review:** covered-by 073-cover\n## Verify\n${extra}`,
  [`.specclaw/changes/${name}/state.json`]: `{ "change": "${name}", "branch": "specclaw/074-demo" }\n`,
});
const gone = { ".specclaw/changes/074-demo/change.md": null, ".specclaw/changes/074-demo/state.json": null };

beforeAll(() => {
  init(() => folder("074-demo"));
  heads.moved = branch("moved", [() => ({ ...gone, ...folder("099-demo") })]);
  heads.movedAndEdited = branch("moved-and-edited", [() => ({ ...gone, ...folder("099-demo", "- AC-1: pass\n") })]);
  heads.otherSlug = branch("other-slug", [() => ({ ...gone, ...folder("099-other") })]);
});

describe("098 review gate", () => {
  it("AC-7 a fork PR skips a folder it only moved, and judges one it moved and changed", () => {
    expect(run(heads.moved, true)).toMatchObject({ code: 0, out: expect.stringMatching(/099-demo\s+scope=move\s+skip — moved from 074-demo/) });
    expect(run(heads.movedAndEdited, true)).toMatchObject({ code: 1, out: expect.stringMatching(/099-demo\s+scope=covered-by .*fail/) });
    expect(run(heads.otherSlug, true)).toMatchObject({ code: 1, out: expect.stringMatching(/099-other\s+scope=covered-by .*fail/) });
  });
});
