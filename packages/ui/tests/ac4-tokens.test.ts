import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../src/styles/tokens.css"), "utf8");
const block = (start: string) => css.slice(css.indexOf(start), css.indexOf("}", css.indexOf(start)));
const tokens = (text: string) => Object.fromEntries([...text.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = tokens(block(":root{"));
const dark = { ...light, ...tokens(block(':root[data-theme="dark"]{')) };

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs = [["ink", "card"], ["ink-2", "card"], ["ink-3", "card"], ["ink-3", "sunken"], ["ink-2", "sunken"], ["chip-agent", "violet-soft"], ["chip-good", "chip-good-bg"], ["chip-bad", "chip-bad-bg"], ["chip-warn", "chip-warn-bg"], ["yellow-ink", "yellow"]];

describe("AC4 design tokens", () => {
  it("AC4 text tokens meet WCAG AA in both themes and components use no literal colours", () => {
    for (const theme of [light, dark]) for (const [fg, bg] of pairs) expect(ratio(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    const dir = join(__dirname, "../src/components");
    for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
  });
});
