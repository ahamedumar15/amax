import { describe, expect, it } from "vitest";
import { followMove, movedOf, repinAll, repinOf, type Repin } from "../lib/chat-move";

const moved = { from: "/delivery/releases/CON/v2.4.0", to: "/delivery/releases/CON/v2.4.1" };

// 057: after a confirmed re-tag, the release page follows the release to its new URL.
describe("057 chat follows a renamed record's page", () => {
  it.each([
    ["on the old page", "/delivery/releases/CON/v2.4.0", moved, moved.to],
    ["on the old page, percent-encoded", "/delivery/releases/CON/v2%2E4%2E0", moved, moved.to],
    ["on another page", "/delivery/releases", moved, null],
    ["on another release", "/delivery/releases/CON/v2.3.0", moved, null],
    ["with nothing moved", "/delivery/releases/CON/v2.4.0", undefined, null],
  ])("%s", (_n, path, m, want) => expect(followMove(path, m)).toBe(want));

  it.each([
    ["a tag result", { version: "v2.4.1", moved }, moved],
    ["a result with no move", { key: "CON-1" }, undefined],
    ["no result", null, undefined],
    ["another site", { moved: { from: moved.from, to: "https://evil.example/x" } }, undefined],
    ["a protocol-relative URL", { moved: { from: moved.from, to: "//evil.example/x" } }, undefined],
    ["a backslash URL", { moved: { from: moved.from, to: "/\\evil.example" } }, undefined],
  ])("movedOf: %s", (_n, result, want) => expect(movedOf(result)).toEqual(want));
});

// 057: a rename rewrites the open conversation's pins that name the record by its old name.
describe("057 repin after a rename", () => {
  const tag: Repin = { tools: ["get_release", "get_release_history", "get_deployment"], match: { projectKey: "CON", version: "v2.4.0" }, set: { version: "v2.4.1" }, label: ["v2.4.0", "v2.4.1"] };
  const env: Repin = { tools: ["get_environment"], match: { projectKey: "HRI", name: "Staging" }, set: { name: "Preview" }, label: ["Staging", "Preview"] };
  it.each([
    ["a release-history pin by version", tag, { label: "CON v2.4.0 proposals", tool: "get_release_history", args: { projectKey: "CON", version: "v2.4.0" } },
      { label: "CON v2.4.1 proposals", tool: "get_release_history", args: { projectKey: "CON", version: "v2.4.1" } }],
    ["a release-list row pin", tag, { label: "Contoso Portal v2.4.0", tool: "get_release", args: { projectKey: "CON", version: "v2.4.0" } },
      { label: "Contoso Portal v2.4.1", tool: "get_release", args: { projectKey: "CON", version: "v2.4.1" } }],
    ["an environment pin by name", env, { label: "HRI Staging", tool: "get_environment", args: { projectKey: "HRI", name: "Staging" } },
      { label: "HRI Preview", tool: "get_environment", args: { projectKey: "HRI", name: "Preview" } }],
    ["another project's release", tag, { label: "VID v2.4.0", tool: "get_release", args: { projectKey: "VID", version: "v2.4.0" } }, null],
    ["an id-keyed pin", tag, { label: "CON v2.4.0", tool: "get_release_history", args: { releaseId: "r-1" } }, null],
    ["a pin of another tool", tag, { label: "CON v2.4.0", tool: "list_releases", args: { projectKey: "CON", version: "v2.4.0" } }, null],
  ])("%s", (_n, repin, pin, want) => expect(repinAll([pin], repin)).toEqual([want ?? pin]));

  it.each([
    ["a tag result", { version: "v2.4.1", repin: tag }, tag],
    ["no repin", { version: "v2.4.1" }, undefined],
    ["an empty match", { repin: { ...tag, match: {} } }, undefined],
    ["a non-string set", { repin: { ...tag, set: { version: 3 } } }, undefined],
    ["tools not a list", { repin: { ...tag, tools: "get_release" } }, undefined],
  ])("repinOf: %s", (_n, result, want) => expect(repinOf(result)).toEqual(want));
});
