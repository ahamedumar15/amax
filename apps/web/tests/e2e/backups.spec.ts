import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")]
    .filter((el) => !el.querySelector(".pin[data-pin]") && !el.querySelector(":scope > td[colspan]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("034 AC-3 AC-6 Backups and export: recovery first, the drill history, exports with their approval, all pinned, chat-first, accessible", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/settings/backups");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Backups and export");
  await expect(page.locator(".lede")).toContainText("You can restore to any minute in the last 14 days. Sunday's restore drill passed in 38 minutes, and the audit chain checked out.");
  await expect(page.locator(".ticket .k")).toHaveText(["Recovery point", "Last drill restore time", "Restore window", "Export awaiting approval"]);
  await expect(page.locator(".ticket .v")).toHaveText(["5 min", "38 min", "14 days", "1"]);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody tr").first()).toContainText("Oct 11Oct 11, 02:0038 min4.2 MVerifiedPassed");
  await expect(page.locator("tbody tr").last()).toContainText("1 h 12 min");
  await expect(page.locator("tbody tr").last()).toContainText("Slow, over an hour");
  await expect(page.locator(".list li").first()).toContainText("Whole tenant, asked by Sahan Kumara");
  await expect(page.locator(".list li").last()).toContainText("Approved by Sahan Kumara; 18 modules, 212 files; link expired Sep 3");
  expect(await unpinned(page)).toEqual([]);
  await expect(page.locator("main form, main textarea, main input, main select, main dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask amax to export all data" })).toHaveAttribute("data-tool", "request_tenant_export");
  await expect(page.getByRole("button", { name: "Ask amax to run a restore drill now" })).toHaveAttribute("data-tool", "request_restore_drill");
  // 038: reached from the Settings hub, so Settings is the current rail item.
  await expect(nav(page).getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("034 AC-6 Backups and export is for Admin only: not IT Admin, not anyone else", async ({ page }) => {
  for (const email of ["ravi@lumenlabs.test", "nimal@lumenlabs.test"]) {
    await page.goto("about:blank");
    await page.context().clearCookies();
    await signIn(page, email, "/");
    await expect(nav(page).getByRole("link", { name: "Backups and export", exact: true })).toHaveCount(0);
    expect((await page.goto("/settings/backups"))?.status()).toBe(404);
    expect((await page.goto("/operations/backups"))?.status()).toBe(404);
  }
});

test("034 AC-4 whoever asked for the export can't approve it; a second Admin approves it in chat", async ({ page }) => {
  test.setTimeout(60_000);
  const approve = async () => {
    await page.getByRole("button", { name: "Ask to approve the tenant export Sahan Kumara asked for" }).click();
    await expect(chat(page).locator(".pinchip > span")).toHaveText(["Tenant export Oct 17"]);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const card = page.getByRole("group", { name: /^Confirm:/ }).last();
    await card.getByRole("button", { name: /Add it|Confirm/ }).click();
    return card;
  };
  await signIn(page, "sahan@lumenlabs.test", "/settings/backups");
  await expect(await approve()).toContainText(/a second Admin must approve/);
  // Leave the page first: a request still in flight from chat could set the session cookie again.
  await page.goto("about:blank");
  await page.context().clearCookies();
  await signIn(page, "maya@lumenlabs.test", "/settings/backups");
  await expect(await approve()).toContainText("Done");
  await page.reload();
  await expect(page.locator(".list li").first()).toContainText(/Approved by Maya Fernando; (being built|\d+ modules)/);
  await expect(page.locator(".ticket .v").last()).toHaveText("0");
});
