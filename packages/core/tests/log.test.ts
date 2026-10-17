import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "../src/log";

describe("logError keeps content out of logs", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ["a JSON parse error quoting the body", (() => { try { JSON.parse('{"password":"hunter2"'); } catch (e) { return e; } })()],
    ["a TypeError with user text", new TypeError("cannot read 'secret-from-user' of undefined")],
    ["a model output in a message", new Error("model said: here is the admin password")],
    ["a thrown string", "raw secret string"],
  ])("%s", (_name, err) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = logError("test", err);
    const line = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).toMatch(new RegExp(id));
    expect(line).not.toMatch(/hunter2|secret|password/);
  });
});
