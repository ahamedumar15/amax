import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { AREAS } from "../../components/marketing/areas";

const SECTIONS = ["Agents keep the records. People decide.", "Your tools were built for people typing updates", "How it works", "One system for delivery, people and money", "Trust and security", "Ask amax", "Stop typing updates. Start deciding."];

test("062 AC3 AC4 AC10 the public page sells amax with no app shell and no forms", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(SECTIONS[0]);
  expect(await page.locator("main h1, main h2").allTextContents()).toEqual(SECTIONS);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ask amax|Search/ })).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a demo" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Marketing" }).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
  await expect(page.getByText("Coming", { exact: true })).toHaveCount(AREAS.filter((a) => a.coming.length > 0).length);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(3);
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /profile menu/ })).toHaveCount(0);
});

test("062 AC5 the product video is captioned, lazy and never autoplays", async ({ page, request }) => {
  await page.goto("/welcome");
  const video = page.locator("video");
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("autoplay");
  await expect(video.locator("track[kind=captions]")).toHaveAttribute("srclang", "en");
  for (const f of ["amax-product.mp4", "amax-product.webm", "amax-product.en.vtt", "amax-product-poster.jpg"]) expect((await request.get(`/marketing/${f}`)).status()).toBe(200);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test("062 AC6 accessible in light and dark, keyboard skip link, no sideways scroll on a phone", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/welcome");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme}: ${v.id}`)).toEqual([]);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  await page.addStyleTag({ content: "*{font-family:Verdana,'DejaVu Sans',sans-serif!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("062 AC7 search and sharing tags, robots and sitemap", async ({ page, request }) => {
  await page.goto("/welcome");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /amax-og\.jpg$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  expect(robots).toContain("Allow: /$");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("<loc>");
});
