import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Closing } from "../components/marketing/Closing";
import { Hero } from "../components/marketing/Hero";
import { MarketingBar } from "../components/marketing/MarketingBar";

const html = (salesEmail?: string) => [MarketingBar, Hero, Closing].map((C) => renderToStaticMarkup(createElement(C, { salesEmail }))).join("");

describe("062 AC-4 Book a demo is a mailto from AMAX_SALES_EMAIL, hidden when unset", () => {
  it("renders one mailto per call to action when set", () => {
    const links = html("sales@amax.example").match(/href="mailto:[^"]+"/g) ?? [];
    expect(links).toEqual(Array(3).fill('href="mailto:sales@amax.example?subject=amax%20demo"'));
  });
  it("renders no demo link when unset, and the closing falls back to Sign in", () => {
    const out = html(undefined);
    expect(out).not.toContain("mailto:");
    expect(out).not.toContain("Book a demo");
    expect(out).toContain('href="/signin"');
  });
});
