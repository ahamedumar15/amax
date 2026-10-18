import { expect, test } from "@playwright/test";

test("062 AC1 signed out, / is the marketing page; signed in, / is the app", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Agents keep the records. People decide.");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ask amax|Search|profile menu/ })).toHaveCount(0);
  await expect(page.getByRole("search")).toHaveCount(0);
  await page.goto("/delivery");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL(/\/delivery$/);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByText("Agents keep the records. People decide.")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
