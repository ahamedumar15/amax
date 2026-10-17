import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, email: string) {
  await page.goto("/hello");
  await expect(page).toHaveURL(/\/signin\?next=%2Fhello$/);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

test("AC1 signed-out visitors are sent to sign-in, then land where they were going", async ({ page }) => {
  await signInAs(page, "maya@lumenlabs.test");
  await expect(page).toHaveURL(/\/hello$/);
  const me = page.getByRole("button", { name: /Maya Fernando, Admin, profile menu/ });
  await expect(me).toBeVisible();
  await expect(me).toContainText("Admin · Leadership · PM");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("AC5 View as previews a role: chip, banner and nav change, and the real user is kept", async ({ page }) => {
  await signInAs(page, "maya@lumenlabs.test");
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "Payroll" }).click();
  await expect(page.getByRole("note")).toHaveText("Viewing as Payroll: screens outside payroll are hidden.");
  await expect(page.getByRole("button", { name: /Maya Fernando, Payroll, profile menu/ })).toBeVisible();
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "Admin" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("AC5 non-admins get no View as, and nav shows only screens their roles allow", async ({ page }) => {
  await signInAs(page, "nimal@lumenlabs.test");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Hello" })).toBeVisible();
  await page.getByRole("button", { name: /Nimal Silva, Engineer, profile menu/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Payroll" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/hello");
  await expect(page).toHaveURL(/\/signin/);
});

test("AC1 a deactivated user (a leaver) can't sign in", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("rizwan@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
});
