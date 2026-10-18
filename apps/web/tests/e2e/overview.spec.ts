import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("008 AC-4 the Overview's Agent activity feed names the agent and the person it acted for", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  const feed = page.locator(".card", { has: page.getByRole("heading", { name: "Agent activity" }) });
  await expect(feed.locator(".feed li").first()).toContainText("Claude for Nimal finished task 3 of CON-014 Invoice export");
  await expect(feed.locator(".feed li .by").first()).toHaveText("Claude for Nimal");
  await expect(feed.locator(".feed li", { hasText: "promoted Contoso v2.4.0 to QA" }).locator("b")).toHaveText("Ayesha");
  await expect(feed.locator(".feed li", { hasText: "verified CON-012" }).locator(".by")).toHaveText("specclaw");
  for (const li of await feed.locator(".feed li").all()) await expect(li.getByRole("button", { name: /^Add .* to chat$/ })).toHaveCount(1);
  await page.mouse.move(900, 500);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
