import { describe, expect, it } from "vitest";
import { matchRoute } from "../lib/registry";

describe("module routes", () => {
  it("matches static and :param segments", () => {
    expect(matchRoute("", [])).toEqual({});
    expect(matchRoute("proposals", ["proposals"])).toEqual({});
    expect(matchRoute("p/:key", ["p", "CON"])).toEqual({ key: "CON" });
    expect(matchRoute("p/:key", ["p"])).toBeNull();
    expect(matchRoute("proposals", ["releases"])).toBeNull();
  });
  it.each([["v1+2"], ["50%"], ["a%41"], ["a b"]])("passes the already-decoded segment %s through unchanged (final review)", (v) => {
    expect(matchRoute("releases/:key/:version", ["releases", "CON", v])).toEqual({ key: "CON", version: v });
  });
});
