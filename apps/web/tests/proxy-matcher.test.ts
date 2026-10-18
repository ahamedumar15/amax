import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Next reads proxy.ts's matcher statically, so the test reads the same literal (importing proxy.ts pulls in next-auth).
const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const config = { matcher: JSON.parse(source.match(/matcher: (\[.*\]) \}/)![1]) as string[] };

// 063 AC-2: signed-out visitors fetch the marketing media straight from public/, never through the gate.
describe("063 AC-2 the proxy skips the marketing media and still gates pages", () => {
  it.each(["amax-product.mp4", "amax-product.webm", "amax-product-poster.jpg", "amax-product.en.vtt", "amax-og.jpg"])("skips /marketing/%s", (f) => {
    expect(unstable_doesMiddlewareMatch({ config, url: `/marketing/${f}` })).toBe(false);
  });
  it.each(["/", "/welcome", "/marketing/admin", "/time/clip.mp4", "/marketing/nested/x.mp4"])("gates %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});
