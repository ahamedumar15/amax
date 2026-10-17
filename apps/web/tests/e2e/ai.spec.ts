import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

test("033 AI and data: Admins see the policy, region warning and can change what's sent", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI and data");
  await expect(page.getByRole("alert").filter({ hasText: "AI features are off" })).toHaveCount(0);
  const pay = page.locator("tr", { hasText: "Pay" });
  await expect(pay).toContainText("Redacted");
  await page.getByLabel("pay", { exact: true }).check();
  await page.getByLabel("Zero data retention confirmed with the provider").check();
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(pay).toContainText("Allowed");
  // AC-4: AI running outside the data region turns it off, with a blocking warning.
  await page.getByLabel("Data region").selectOption("AU");
  await page.getByLabel("Database in").selectOption("AU");
  await page.getByLabel("Files in").selectOption("AU");
  await page.getByLabel("AI runs in").selectOption("US");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "AI features are off" })).toContainText("outside the data region");
  await page.getByLabel("Data region").selectOption("");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "AI features are off" })).toHaveCount(0);
  await expect(page.getByText(/^Policy v\d+$/)).not.toHaveText("Policy v1");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("033 AI and data is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings/ai");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("AI and data");
});
