import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 Ask amax, ⌘K and Ctrl+K open the chat; Escape closes it and returns focus; closed it's inert", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  const chat = page.getByRole("complementary", { name: "amax chat" });
  await expect(chat).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await expect(page.getByLabel("Message amax")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ask amax" })).toBeFocused();
  await expect(chat).toHaveAttribute("inert", "");
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Message amax")).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).include("#chat").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test("AC3 chat-first create: a confirm card with coloured fields; Add it creates the proposal on the board", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await page.getByRole("button", { name: "New proposal" }).click();
  await page.getByLabel("Message amax").fill("add Export invoices to PDF to CON");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await expect(card).toContainText("Export invoices to PDF");
  await expect(page.locator(".m.me mark.x")).toHaveCount(2);
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText(/Done: CON-\d+ added\./);
  await page.reload();
  await expect(page.locator(".tcard", { hasText: "Export invoices to PDF" })).toBeVisible();
});

test("Cancel writes nothing; read questions show the tools used", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill("add Never ship this to CON");
  await page.keyboard.press("Enter");
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toContainText("Nothing was changed");
  await page.getByLabel("Message amax").fill("how many projects?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".m .tools span").last()).toHaveText("list_projects");
  await page.goto("/delivery/proposals");
  await expect(page.getByText("Never ship this")).toHaveCount(0);
});

test("AC4 pins: Add to chat adds a chip; AC5 a role without access gets a refusal", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  const row = page.locator("tr", { hasText: "Fleet Tracker" });
  await row.hover();
  await row.getByRole("button", { name: "Add Fleet Tracker to chat" }).click();
  await expect(page.locator(".pinchip")).toContainText("Fleet Tracker");
  await page.getByRole("button", { name: "Remove Fleet Tracker from chat" }).click();
  await expect(page.locator(".pinchip")).toHaveCount(0);
});

test("AC5 the same refusal the page would give", async ({ page }) => {
  await signIn(page, "liam@lumenlabs.test", "/");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await page.getByLabel("Message amax").fill("list the projects");
  await page.keyboard.press("Enter");
  await expect(page.locator(".m .b").last()).toContainText(/couldn't do that/);
});
