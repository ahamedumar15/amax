import { describe, expect, it } from "vitest";
import { keepFocusFor, takeKeptFocus } from "../components/shell/route-focus";

// 057: CI showed the re-tag follow moving focus to the h1 mid-typing, so "Prod" landed before the prompt.
describe("057 a navigation chat starts keeps focus in the chat, once, for that path only", () => {
  it.each([
    ["the path chat opened", "/delivery/releases/CON/v2.4.1", "/delivery/releases/CON/v2.4.1", true],
    ["the same path, percent-encoded", "/delivery/releases/CON/2.3.1%20rc%2F1", "/delivery/releases/CON/2.3.1 rc%2F1", true],
    ["another path", "/delivery/releases/CON/v2.4.1", "/delivery/releases", false],
    ["nothing kept", null, "/delivery/releases/CON/v2.4.1", false],
  ])("%s", (_n, kept, path, want) => {
    if (kept) keepFocusFor(kept);
    expect(takeKeptFocus(path)).toBe(want);
    expect(takeKeptFocus(path)).toBe(false); // used up either way
  });
});
