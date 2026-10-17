import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

test("033 AI and data: Admins see the policy; changes are asked in chat (047)", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and data");
  await expect(page.getByRole("alert").filter({ hasText: "AI features are off" })).toHaveCount(0);
  const pay = page.locator("tr", { hasText: "Pay" });
  await expect(pay).toContainText("Redacted");
  await pay.getByRole("button", { name: "Ask to allow Pay" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Allow pay fields to be sent to the AI provider");
  await expect(page.locator(".pinchip > span")).toHaveText(["Pay"]);
  await expect(page.locator("main form")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("033 AI and data is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings/ai");
  expect((await page.goto("/settings/ai"))?.status()).toBe(404);
  await expect(page.getByText("This page could not be found")).toBeVisible();
});
