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
  [...root.querySelectorAll(".card, .ticket, .app-card, tbody tr, .list li, .feed li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const fits = async (page: Page, path: string) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(path);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
};

test("AC2 the Keyflow screen leads with the sync errors, shows what synced, is pinnable and accessible, and asks chat for every write", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "ravi@lumenlabs.test", "/keyflow");
  await expect(page.locator(".keyflow .lede")).toHaveText(/^3 sync errors need you: Keyflow refused Lahiru Liyanage and Mohamed Rifkhan, and a goal came in for a Keyflow person amax doesn't know\. The sync runs every 15 minutes as a job\./);
  await expect(page.locator(".ticket .v")).toHaveText(["3", /min ago$/, "184 people", "11 goals"]);
  await expect(page.locator(".ticket .p")).toHaveText(["2 refused by Keyflow, 1 unmatched person", /^Every 15 minutes, next in \d+ min$/, "8 teams", "5 review scores, 6 recognitions"]);
  await expect(page.locator(".tbl").first().locator("tbody tr")).toHaveCount(3);
  await expect(page.locator(".tbl").nth(1).locator("tbody tr").nth(1)).toContainText("Failed Keyflow answered 503");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/app.png`, fullPage: true });
  await page.getByRole("button", { name: "Ask amax about the sync error for Mohamed Rifkhan" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Dismiss the Keyflow sync error for Mohamed Rifkhan \(error id [0-9a-f-]{36}\)$/);
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Keyflow sync error, Mohamed Rifkhan");
  await fits(page, "/keyflow");
});

test("AC1 a person's Performance page shows Keyflow goals, review scores and recognition, pinnable and accessible", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/hr/p/LL-0417/performance");
  await expect(page.locator("h1")).toHaveText("Kasun Dias, performance");
  await expect(page.locator(".keyflow .lede")).toHaveText(/^1 goal is at risk\. Goals, review scores and recognition come from Keyflow, synced \d+ min ago\. Review scores show only to HR, leadership, Kasun and their manager\.$/);
  await expect(page.locator(".ticket .v")).toHaveText(["3", "4.2 of 5", "2"]);
  await expect(page.locator(".list li").first()).toContainText("Pass the AWS Solutions Architect exam");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/app-person.png`, fullPage: true });
  await fits(page, "/hr/p/LL-0417/performance");
});
