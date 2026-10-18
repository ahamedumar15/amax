import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]") && !el.querySelector(".empty-line"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC2 what needs a decision leads; approvals and claims go to chat; medical detail masked; everything pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/expenses");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Expenses");
  await expect(page.locator(".lede")).toHaveText("3 claims wait for your decision. Ayesha's meals claim is over its LKR 5,000 limit.");
  await expect(page.locator(".ticket .v")).toHaveText(["3", "1", "1"]);
  await expect(page.locator(".ticket").first()).toContainText("LKR 14,450");
  await expect(page.locator("tr[data-claim=EXP-0102]").first()).toContainText("Over the LKR 5,000 limit");
  await expect(page.locator("tr[data-claim=EXP-0103] .masked")).toHaveCount(2);
  await expect(page.locator("tr[data-claim=EXP-0105]")).toContainText("Oct payroll");
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("button", { name: "Ask amax to approve EXP-0101 for Kasun Dias" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Expense claim EXP-0101, Kasun Dias");
  await expect(page.getByLabel("Message amax")).toHaveValue("Approve EXP-0101, Kasun Dias's travel claim for LKR 3,450, as their manager");
});

test("AC2 Claim an expense opens chat with the claim intent", async ({ page }) => {
  await signIn(page, "kasun@lumenlabs.test", "/expenses");
  await expect(page.locator(".lede")).toHaveText("1 claim of yours is on the way to approval.");
  await page.getByRole("button", { name: "Claim an expense" }).click();
  await expect(chat(page)).toBeVisible();
});
