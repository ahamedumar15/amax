import { describe, expect, it } from "vitest";
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
