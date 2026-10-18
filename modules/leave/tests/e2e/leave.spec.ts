import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test("AC1 AC2 AC3 the Leave screen leads with what waits, matches fixtures.md, is pinnable and accessible, and asks chat for every write", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/leave");
  await expect(page.locator(".leave .lede")).toHaveText("Nimal asked for Oct 27 – Oct 30 off, while Fleet Tracker v1.8.0 UAT retry is in flight. Next public holiday: Vap Full Moon Poya Day, Oct 26.");
  await expect(page.locator(".ticket .v")).toHaveText(["6", "2", "41 days", "812 days"]);
  await expect(page.locator(".ticket .p").first()).toHaveText("3 annual, 2 casual, 1 medical");
  await expect(page.locator(".cal tbody tr")).toHaveCount(5);
  await expect(page.locator(".cal th.hd.today")).toHaveText("16");
  await expect(page.locator(".tbl tbody tr", { hasText: "Nimal Silva" })).toContainText("Overlaps Fleet Tracker v1.8.0 UAT retry");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/app.png`, fullPage: true });
  await page.getByRole("button", { name: "Approve Tharushi Wijesinghe's request" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Approve Tharushi Wijesinghe's casual leave, Nov 2 \(request id [0-9a-f-]{36}\)$/);
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Tharushi Wijesinghe, casual leave Nov 2");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/leave");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
});
