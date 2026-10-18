import { describe, expect, it } from "vitest";
import { repinAll } from "@amax/chat/pins";
import { followMove, movedOf } from "../lib/chat-move";

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


// 057 follow-up: after a rename the panel rewrites only the matching pins in its own current state.
describe("057 the chat panel merges a repin into its current pins", () => {
  const repin = { tools: ["get_release_history"], match: { projectKey: "CON", version: "v2.4.0" }, set: { version: "v2.4.1" }, label: ["v2.4.0", "v2.4.1"] as [string, string] };
  const rel = (version: string) => ({ label: `CON ${version} proposals`, tool: "get_release_history", args: { projectKey: "CON", version } });
  const other = { label: "HRI environments", tool: "list_environments", args: { projectKey: "HRI" } };
  const added = { label: "CON-017 CSV import", tool: "get_proposal", args: { key: "CON-017" } };
  it.each([
    ["a pin added since the last message stays", [rel("v2.4.0"), added], [rel("v2.4.1"), added]],
    ["a pin removed since the last message stays removed", [rel("v2.4.0")], [rel("v2.4.1")]],
    ["untouched pins keep their order", [other, rel("v2.4.0"), rel("v2.3.0")], [other, rel("v2.4.1"), rel("v2.3.0")]],
    ["no matching pin: nothing changes", [other, added], [other, added]],
  ])("%s", (_n, panel, want) => expect(repinAll(panel, repin)).toEqual(want));
});
