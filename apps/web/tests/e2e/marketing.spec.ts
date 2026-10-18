import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const longHeadings = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll("main h1, main h2, main h3")].filter((h) => !h.closest(".sr") && !h.classList.contains("sr"))
    .filter((h) => h.getBoundingClientRect().height > 2.2 * parseFloat(getComputedStyle(h).lineHeight)).map((h) => h.textContent));

const SECTIONS = ["Agents keep the records. People decide.", "Product tour", "How it works", "Today at Lumen Labs (fictional)", "Built for audit", "Questions", "Ask it yourself."];

test("064 AC1 AC6 AC9 the sections in order, no app shell, no forms, fictional and honest", async ({ page }) => {
  await page.goto("/welcome");
  expect(await page.locator("main h1, main h2").allTextContents()).toEqual(SECTIONS);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /profile menu|Search/ })).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a demo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(3);
  const coming = page.getByText("Coming", { exact: true });
  await expect(coming).toHaveCount(3);
  for (const c of await coming.all()) await expect(c).toBeVisible();
});

test("064 AC2 the queue switches roles by keyboard and records who decided", async ({ page }) => {
  await page.goto("/welcome");
  const tabs = page.getByRole("tablist", { name: "View as" });
  await tabs.getByRole("tab", { name: "PM" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Finance" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Engineer" })).toBeFocused();
  await page.getByRole("tabpanel").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("✓ Accepted by you, Liam Walsh · drafted by Git ingestion");
  await expect(page.getByRole("status")).toHaveText("Accepted by you, Liam Walsh · drafted by Git ingestion");
});

test("064 AC3 the tour plays when asked, with captions, and never on its own", async ({ page, request }) => {
  for (const f of ["mp4", "webm", "en.vtt"]) expect((await request.get(`/marketing/amax-product.${f}`)).status()).toBe(200);
  expect((await request.get("/marketing/amax-product-poster.jpg")).status()).toBe(200);
  await page.goto("/welcome");
  const video = page.locator("#tour video");
  await expect(video).not.toHaveAttribute("autoplay");
  await expect(video.locator("source").first()).toHaveAttribute("type", "video/mp4");
  await expect(video.locator("track[kind=captions]")).toHaveAttribute("srclang", "en");
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole("button", { name: /Play the tour/ }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(video).toBeFocused();
});

test("064 AC1 AC7 accessible in light and dark, skip link, no sideways scroll on a phone", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/welcome");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  await page.addStyleTag({ content: "*{font-family:Verdana,'DejaVu Sans',sans-serif!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("064 AC1 no heading runs past two lines at 1440 and 768", async ({ page }) => {
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/welcome");
    expect(await longHeadings(page)).toEqual([]);
  }
});
