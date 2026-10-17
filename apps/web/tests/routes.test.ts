import { describe, expect, it } from "vitest";
import type { ModuleManifest } from "@amax/core";
import { matchRoute, routeIn } from "../lib/registry";

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

describe("mounted routes (051)", () => {
  const screen = () => null;
  const delivery = { id: "delivery", routes: [{ path: "", title: "Projects", component: screen }, { path: "p/:key/team", title: "Team", component: screen }] };
  const allocations = { id: "allocations", routes: [{ path: "", title: "Allocations", component: screen }, { path: "p/:key/team", title: "Team", mount: "delivery", component: screen }] };
  const mods = [delivery, allocations] as unknown as ModuleManifest[];

  it("AC3 serves a route another module mounts, ahead of the owner's fallback", () => {
    expect(routeIn(mods, "delivery", ["p", "CON", "team"])?.route).toBe(allocations.routes[1]);
    expect(routeIn(mods, "delivery", ["p", "CON", "team"])?.params).toEqual({ key: "CON" });
    expect(routeIn([delivery] as unknown as ModuleManifest[], "delivery", ["p", "CON", "team"])?.route).toBe(delivery.routes[1]);
    expect(routeIn(mods, "allocations", ["p", "CON", "team"])).toBeNull();
  });
});
