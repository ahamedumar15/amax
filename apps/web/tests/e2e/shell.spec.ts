import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#001-amax-foundation`;
const shared = { 1440: [".top .search", ".top .launcher", ".rail .logo", ".rail a"], 390: [".top .search", ".top .launcher"] };
const widths = [1440, 390] as const;

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("AC5 shell matches the mock, is keyboard-complete and respects reduced motion", async ({ page, context }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const mockPage = await context.newPage();
    await mockPage.setViewportSize({ width, height: 900 });
    await mockPage.goto(mock);
    await page.goto("/");
    expect(await noHorizontalScroll(page)).toBe(true);
    for (const selector of shared[width]) {
      const want = await capture(mockPage.locator(selector).first());
      const got = await capture(page.locator(selector).first());
      expect(got.box, selector).toEqual(want.box);
      expect(diffRatio(want, got), selector).toBeLessThanOrEqual(0.02);
    }
    const bar = async (p: Page) => (await p.locator(".rail").boundingBox())?.[width === 390 ? "y" : "x"];
    expect(await bar(page)).toBe(await bar(mockPage));
    for (const path of ["/", "/hello"]) {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`), path).toEqual([]);
    }
    await mockPage.close();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page.getByRole("main")).toHaveCount(1);
  const hello = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Hello" });
  await hello.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/hello$/);
  const heading = page.locator("main h1");
  await expect(heading).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(`${await heading.textContent()} screen`);
  await expect(hello).toHaveAttribute("aria-current", "page");
  const transition = await hello.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition.split(",").every((d) => parseFloat(d) === 0)).toBe(true);
});
