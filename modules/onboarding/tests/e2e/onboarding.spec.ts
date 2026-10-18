import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The fixtures are dated around Oct 2026 (fixtures.md); the screen counts from the real today, so this
// reads as the demo until Mohamed Rifkhan joins on Nov 2.
async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")]
    .filter((el) => !el.querySelector(".pin[data-pin]") && !el.querySelector(".empty-line"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 attention leads, then each checklist by owner; everything pinned, no forms, and Ask amax completes a task", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/onboarding");
  await expect(page.locator(".ticket .k")).toHaveText(["Overdue tasks", "Joiners starting soon", "Leavers this week", "Open tasks"]);
  const rifkhan = page.locator("section.card", { has: page.getByRole("heading", { name: "Mohamed Rifkhan" }) });
  await expect(rifkhan).toContainText("Joins Nov 2");
  await expect(rifkhan.locator("h3")).toHaveText(["HR", "IT Admin", "Nimal Silva"]);
  await expect(page.locator("section.card", { has: page.getByRole("heading", { name: "Rizwan Farook" }) })).toContainText("Last day Sep 30");
  await expect(page.locator("main form, main dialog, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await rifkhan.getByRole("button", { name: "Ask amax to mark Order and image a laptop done for Mohamed Rifkhan" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Order and image a laptop, Mohamed Rifkhan");
  await expect(page.getByLabel("Message amax")).toHaveValue('Mark "Order and image a laptop" done for Mohamed Rifkhan');
});
