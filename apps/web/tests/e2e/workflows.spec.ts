import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMINS, DOLLARS } from "./admins";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

for (const who of ADMINS) test(`029 Scheduler and runs: Admins see recurring work, with pause and resume asked in chat (047), as ${who.role} (055)`, async ({ page }) => {
  await signIn(page, who.email, "/settings/workflows");
  await expect(page.locator(".ticket", { hasText: "Model and API cost" })).toContainText(who.pricing ? "Across the latest" : "Hidden for your role");
  if (!who.pricing) expect(await page.locator("main").innerHTML()).not.toMatch(DOLLARS);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scheduler and runs");
  const row = page.locator("tr", { hasText: "Audit chain check" });
  await expect(row).toContainText("Daily 02:30");
  await expect(row).toContainText("On");
  await expect(row.getByRole("button", { name: "Ask to pause Audit chain check" })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("029 Scheduler and runs is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings/workflows");
  expect((await page.goto("/settings/workflows"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduler and runs" })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
});
