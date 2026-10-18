import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSpecclaw } from "../../../modules/delivery/sync/specclaw";
// @ts-expect-error the generated plain-JS bundle has no types
import * as bundle from "../scripts/read-specclaw.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// 062 AC-2: fails when scripts/read-specclaw.mjs is stale; run `pnpm build:plugin` from the repo root.
describe("062 AC-2 the plugin reads specclaw exactly as amax's importer does", () => {
  it("AC-2 the bundled reader matches modules/delivery/sync/specclaw.ts on this repo, and finds the project key", () => {
    expect(bundle.readSpecclaw(repoRoot)).toEqual(readSpecclaw(repoRoot));
    expect(bundle.projectOf(repoRoot)).toBe("AMX");
    expect(bundle.projectOf(repoRoot, "CON")).toBe("CON");
  });
});
