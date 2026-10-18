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

test("AC1 AC2 AC3 tiles, charts and contracts as in the mock with fixtures.md's numbers; drafts go to chat; everything pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/finance");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Financials");
  await expect(page.locator(".lede")).toHaveText("Contoso's next invoice unlocks when v2.4.0 reaches Prod. Fleet Tracker has one invoice 9 days overdue.");
  await expect(page.locator(".ticket .v")).toHaveText(["$774,000", "$418,200", "$18,315"]);
  await expect(page.locator(".ticket").nth(1)).toContainText("54% of $774k contract value");
  await expect(page.getByRole("heading", { name: "Invoiced per month" })).toBeVisible();
  await expect(page.getByText("$96,400 open")).toBeVisible();
  await expect(page.locator("tr[data-contract]")).toHaveCount(3);
  await expect(page.locator("tr[data-contract=FLT]")).toContainText("INV-0912 $18,315 (Sep hours), 9 days overdue");
  await expect(page.locator("tr[data-contract=CON]")).toContainText("$60,000 when v2.4.0 is in Prod");
  await expect(page.locator("tr[data-contract=HRI]")).toContainText("Jul–Sep paid");
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("button", { name: "Ask amax to accept the draft invoice for Fleet Tracker" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Next invoice, Fleet Tracker contract");
  await expect(page.getByLabel("Message amax")).toHaveValue("Accept the billing agent's draft invoice for Fleet Tracker, $14,200");
});

test("AC1 someone without finance gets a 404", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/finance");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
