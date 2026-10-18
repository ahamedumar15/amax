import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li, .donut-legend li, .row.line")]
    .filter((el) => !el.querySelector(":scope > .pin[data-pin], :scope > * > .pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const licences = (page: Page) => page.locator(".card", { has: page.getByRole("heading", { name: "Licences" }) });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC2 AC4 Admin sees the mock's tiles, licences, spend, savings, devices and people; everything pinned, no forms, accessible", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/it-access");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Access and licences");
  await expect(page.locator(".lede")).toHaveText("What everyone can sign in to, from Microsoft Entra ID, Azure DevOps, Intune and your SaaS tools. 23 seats have gone unused for 60 days.");
  await expect(page.locator(".ticket .v")).toHaveText(["$14,860", "23", "96.5%", "0"]);
  await expect(page.locator(".ticket .p").nth(1)).toHaveText("$624 a month to save");
  await expect(licences(page).locator("tbody tr")).toHaveText([/Microsoft 365 E3\s*190\s*184\s*181\s*\$6,840\s*3\s*\$108/, /Azure DevOps.*60\s*56\s*50\s*\$2,912\s*6\s*\$276/, /GitHub Copilot Business\s*120\s*112\s*108\s*\$2,280\s*4\s*\$76/,
    /JetBrains All Products\s*30\s*27\s*25\s*\$870\s*1\s*\$29/, /Figma Professional\s*40\s*38\s*29\s*\$600\s*9\s*\$135/, /Unused, all products\s*23\s*\$624/]);
  await expect(page.locator(".donut-legend li")).toHaveText([/Microsoft 365 E3\s*\$6,840/, /Azure DevOps.*\$2,912/, /GitHub Copilot Business\s*\$2,280/, /Other\s*\$2,828/]);
  await expect(page.locator("[data-saving] small")).toHaveText(["Save $1,620 a year. 92% confidence", "Save $3,312 a year. 85% confidence"]);
  await expect(page.locator(".row.line")).toHaveText([/Compliant\s*223/, /Need an OS update\s*7/, /Not assigned to anyone\s*1/]);
  await expect(page.locator(".people tbody tr").first()).toContainText("Ravi Perera");
  await expect(page.locator(".people tbody tr", { hasText: "Sahan Kumara" })).toHaveText(/Sahan Kumara\s*7\s*6\s*2\s*Global admin\s*Jul 2026\s*Review/);
  await expect(page.locator(".people tbody tr", { hasText: "DataCo" })).toHaveText(/Vendor contractor, DataCo\s*1\s*1\s*0\s*None\s*Expires Nov 15\s*Extend/);
  await expect(page.locator(".people tbody tr", { hasText: "Rizwan Farook" })).toHaveText(/Rizwan Farook\s*0\s*0\s*0\s*Left Sep 30\s*All revoked/);
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);

  await page.getByRole("link", { name: /Show all/ }).click();
  await expect(page.locator(".people tbody tr", { hasText: "Kasun Dias" })).toHaveText(/Kasun Dias\s*3\s*4\s*1\s*None\s*Jul 2026\s*Open/);
  await page.getByRole("button", { name: "Add licence, ask amax" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Give someone a licence: ask me for the person and the product, then send it to IT to approve");
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Licences");
});

test("AC2 IT Admin sees seats and use but no prices, and the filter narrows to leavers", async ({ page }) => {
  await signIn(page, "ravi@lumenlabs.test", "/it-access");
  await expect(page.locator(".ticket .v")).toHaveText(["For Admin", "23", "96.5%", "0"]);
  await expect(licences(page).locator("thead th")).toHaveText(["Product", "Seats", "Assigned", "Active 30 d", "Unused seats", "Pin"]);
  await expect(page.getByRole("heading", { name: "Seats by product" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("$");
  await page.getByLabel("Show").selectOption("leavers");
  await expect(page).toHaveURL(/\?people=leavers/);
  await expect(page.locator(".people tbody tr").first()).toHaveText(/Rizwan Farook.*All revoked/);
  expect(await axe(page)).toEqual([]);
});

test("AC4 someone without it-access gets a 404", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/it-access");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
