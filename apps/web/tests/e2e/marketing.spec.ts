import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AREAS } from "../../components/marketing/areas";

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
  await expect(coming).toHaveCount(AREAS.filter((a) => a.coming.length > 0).length);
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
  await page.getByRole("tabpanel").getByRole("button", { name: "Accept" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ok-en1")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Submit week" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("✓ Accepted by you, Liam Walsh · drafted by Git ingestion · in chat");
  await expect(page.getByRole("status")).toHaveText("Accepted by you, Liam Walsh · drafted by Git ingestion · in chat");
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
