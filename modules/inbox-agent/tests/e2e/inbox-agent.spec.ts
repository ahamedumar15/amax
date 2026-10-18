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
  [...root.querySelectorAll(".card, .ticket, .found-item, tbody tr")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test("AC1 AC2 AC3 the inbox agent screen leads with the finds, links each to its message, adds through the owner's chat intent, and is pinned with no forms", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/inbox-agent");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox agent");
  await expect(page.locator(".lede")).toHaveText(/^3 finds from Teams and email wait for you\. The agent reads 4 channels and 6 mailboxes every hour\. Nothing is added until someone accepts it/);
  await expect(page.locator(".ticket .k")).toHaveText(["Open finds", "Allowed sources", "Last scan", "Admin consent"]);
  await expect(page.locator(".ticket .v")).toHaveText(["3", "10", /min ago$/, "Granted"]);
  await expect(page.locator(".ticket .p").nth(2)).toHaveText(/^Hourly, next in \d+ min$/);
  const finds = page.locator(".found-item");
  await expect(finds.locator("b")).toHaveText(["Leave request: annual", "New opportunity: Woodgrove Bank", "New opportunity: Adatum, Australia"]);
  await expect(finds.nth(2)).toContainText("Email to Liam, Oct 15");
  await expect(finds.nth(2).getByRole("link", { name: /Open the message/ })).toHaveAttribute("href", "https://m365.sandbox.example/messages/demo-mail-0415");
  await expect(page.locator("main")).not.toContainText("IGNORE ALL");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await expect(page.locator(".tbl").first().locator("tbody tr")).toHaveCount(10);
  await expect(page.locator(".tbl").nth(1).locator("tbody tr").nth(1)).toContainText("Failed Microsoft Graph answered 503");
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Add New opportunity: Adatum, Australia with amax" }).click();
  await expect(page.getByText("New opportunity: tell me the details and I'll fill it in.")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Inbox find: New opportunity from Liam");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/inbox-agent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
});
