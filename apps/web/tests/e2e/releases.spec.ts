import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("042 AC-1 environments per project: add, rename and choose Prod from the project page", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/HRI");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Environments" }) });
  await card.getByLabel("New environment").fill("Staging");
  await card.getByRole("button", { name: "Add environment" }).click();
  await expect(card.locator("tbody tr")).toHaveCount(5);
  await card.getByLabel("Rename Staging").fill("Preview");
  await card.locator("tr", { has: page.getByLabel("Rename Staging") }).getByRole("button", { name: "Rename" }).click();
  await expect(card.getByLabel("Rename Preview")).toBeVisible();
  await card.getByRole("button", { name: "Preview is not Prod" }).click();
  await expect(card).toContainText("Released means it reached Preview");
  await card.getByRole("button", { name: "Preview is Prod" }).click();
  await expect(card).toContainText("No Prod");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("042 AC-2/AC-3 a release page: re-tag, deploy to any environment, void with a reason", async ({ page }) => {
  await signIn(page, "sahan@lumenlabs.test", "/delivery/releases");
  await page.getByRole("link", { name: "v2.4.0" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contoso Portal v2.4.0");
  await page.getByLabel("Version tag").fill("v2.4.1");
  await page.getByRole("button", { name: "Save release" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contoso Portal v2.4.1");
  await page.getByLabel("Environment").selectOption("Prod");
  await page.getByRole("button", { name: "Record deployment" }).click();
  const prodRow = page.locator("tbody tr", { hasText: "Prod" }).first();
  await expect(prodRow).toContainText("deployed");
  await prodRow.getByLabel(/Reason to void/).fill("wrong pipeline");
  await prodRow.getByRole("button", { name: "Void" }).click();
  await expect(page.locator("tbody tr", { hasText: "Prod" }).first()).toContainText("Voided: wrong pipeline");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
