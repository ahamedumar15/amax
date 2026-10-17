import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

test("029 Scheduler and runs: Admins see recurring work and switch a schedule off and on", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/workflows");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scheduler and runs");
  const row = page.locator("tr", { hasText: "Audit chain check" });
  await expect(row).toContainText("Daily 02:30");
  const toggle = row.getByRole("switch", { name: "Audit chain check" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(row.getByRole("switch", { name: "Audit chain check" })).toHaveAttribute("aria-checked", "false");
  await expect(row).toContainText("Off");
  await row.getByRole("switch", { name: "Audit chain check" }).click();
  await expect(row.getByRole("switch", { name: "Audit chain check" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("029 Scheduler and runs is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings/workflows");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Scheduler and runs");
});
