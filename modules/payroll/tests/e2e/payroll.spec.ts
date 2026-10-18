import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li, .steps li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]") && !el.querySelector(".empty-line"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC2 steps, totals, changes and payslips as in the mock; Approve run waits on open changes; everything pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/payroll");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("October payroll, Lumen Labs Lanka (Pvt) Ltd");
  await expect(page.locator(".steps li.done")).toHaveCount(2);
  await expect(page.locator(".steps li.now")).toContainText("HR approval");
  await expect(page.locator(".ticket .k")).toHaveText(["Gross pay", "Net to banks", "Statutory"]);
  await expect(page.getByRole("heading", { name: "Where the money goes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payroll cost" })).toBeVisible();
  await expect(page.locator("tr[data-change-row]")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Approve run" })).toBeDisabled();
  await expect(page.getByText("Resolve the 4 open changes to approve the run")).toBeVisible();
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("button", { name: "Ask amax to accept the change for Ayesha Rahman" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Ayesha Rahman, change in October 2026 pay");
  await expect(page.getByLabel("Message amax")).toHaveValue("Accept the payroll agent's change to Ayesha Rahman's October 2026 pay");

  await page.goto("/payroll");
  await page.getByRole("link", { name: "View payslip, Nimal Silva" }).click();
  const drawer = page.getByRole("dialog", { name: "Nimal Silva" });
  await expect(drawer).toContainText("Payslip, October 2026");
  await expect(drawer).toContainText("Net pay");
  expect(await axe(page)).toEqual([]);
});

test("AC3 someone without payroll gets a 404", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/payroll");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
