import { describe, expect, it, vi } from "vitest";
import type { Viewer } from "@amax/auth";

// A viewer who can see no releases at all: the refusal must not depend on the data (057, round 4).
vi.mock("../server/queries", async (orig) => ({ ...(await orig<typeof import("../server/queries")>()), listReleases: async () => [] }));
const { mcpTools } = await import("../mcp");
const { isRelease } = await import("../server/queries");
const getRelease = mcpTools.find((t) => t.name === "get_release")!;
const v = {} as Viewer;

describe("057 get_release checks the ref before it reads", () => {
  it.each([[{}], [{ projectKey: "CON" }], [{ version: "v2.3.0" }]])("refuses %j even when no release is visible", async (args) => {
    await expect(getRelease.run(v as never, args as never, "chat" as never)).rejects.toThrow(/say which release/);
  });
  it.each([[{ releaseId: "00000000-0000-4000-8000-000000000000" }], [{ projectKey: "CON", version: "v2.3.0" }]])("reads %j as not found when none is visible", async (args) => {
    expect(await getRelease.run(v as never, args as never, "chat" as never)).toBeNull();
  });

  const r = { id: "r-1", projectKey: "CON", version: "v2.3.0" };
  it.each([
    ["the id", { releaseId: "r-1" }, true],
    ["the id and its project", { releaseId: "r-1", projectKey: "CON" }, true],
    ["the id with another project", { releaseId: "r-1", projectKey: "HRI" }, false],
    ["the id with another version", { releaseId: "r-1", version: "v9" }, false],
    ["project and version", { projectKey: "CON", version: "v2.3.0" }, true],
  ])("isRelease: %s", (_n, ref, want) => expect(isRelease(r, ref)).toBe(want));
});
