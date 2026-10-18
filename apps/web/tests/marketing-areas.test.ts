import { describe, expect, it } from "vitest";
import { modules } from "../generated/modules";
import { AREAS, isPlatform } from "../components/marketing/areas";
import { surfaces } from "./marketing-prose";

describe("062 AC-3 the marketing page claims only what ships", () => {
  const installed = new Set(modules.map((m) => m.id));
  const live = AREAS.flatMap((a) => a.live.filter((c) => !isPlatform(c)).map((c) => [a.title, c.text, c.module ?? ""] as const));
  const planned = AREAS.flatMap((a) => a.coming.map((c) => [a.title, c.text, c.module] as const));
  it.each(live)("%s: %s comes from installed module %s", (_area, _text, id) => {
    expect(installed.has(id)).toBe(true);
  });
  it.each(planned)("%s: %s is Coming because module %s is not installed", (_area, _text, id) => {
    expect(installed.has(id)).toBe(false);
  });
  it.each(surfaces())("the %s names no Coming feature", (_where, text) => {
    for (const word of AREAS.flatMap((a) => a.coming.flatMap((c) => c.words))) expect(text.toLowerCase()).not.toContain(word);
  });
});
