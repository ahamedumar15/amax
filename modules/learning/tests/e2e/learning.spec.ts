import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

// The fixtures are dated around Oct 2026 (fixtures.md); the screen counts from the real today, so this
// reads as the mock until the first certification expires on Dec 2.
const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#001-amax-foundation-learning`;

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(":scope > td[colspan]") && !el.querySelector(".pin[data-pin]") && !el.querySelector(".empty-line"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 the Learning screen shows fixtures.md's figures, everything pinned, and its chart matches the mock within 2%", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test", "/learning");
  await expect(page.locator(".lede")).toHaveText("18 programmes this year. All 184 people did the mandatory ISO 27001 awareness course, and 126 people (68%) took part in optional programmes. 6 certifications expire before January.");
  await expect(page.locator(".ticket .v")).toHaveText(["18", "126", "74%", "41"]);
  await expect(page.locator(".ticket .p")).toHaveText(["11 internal, 7 external", "68% of 184 people", "74%, against an 80% target", "6 expire before January"]);
  const rows = page.locator(".learning .tbl tbody tr");
  await expect(rows).toHaveCount(18);
  await expect(rows.first()).toContainText("Azure AI Engineer cohortEnds Nov 20Certification2258%640");
  await expect(rows.nth(2)).toContainText("ISO 27001 awarenessMandatory, yearlyCompliance184100%184");
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Running" }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.locator(".list li").first()).toContainText("AZ-305 Solutions ArchitectNimal Silva, Dec 2");
  await expect(page.locator(".list li").nth(1)).toContainText("ISTQB AdvancedAyesha Rahman, Dec 18");
  await expect(page.locator("main form, main dialog, main input")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock);
  const want = await capture(m.locator("#learnChart"));
  const got = await capture(page.locator(".learning svg.chart"));
  if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF_DIR}/chart-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/chart-app.png`, got.png); await page.screenshot({ path: `${process.env.DIFF_DIR}/learning.png`, fullPage: true }); }
  expect([got.box.width, got.box.height]).toEqual([want.box.width, want.box.height]);
  expect(diffRatio(want, got)).toBeLessThanOrEqual(0.02);
});

test("AC2 New programme opens chat in its intent; Remind asks amax with the certification pinned", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/learning");
  await page.getByRole("button", { name: "Ask amax to remind Nimal Silva about AZ-305 Solutions Architect" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("AZ-305 Solutions Architect, Nimal Silva");
  await expect(page.getByLabel("Message amax")).toHaveValue("Remind Nimal Silva that their AZ-305 Solutions Architect certification expires on Dec 2");
  await page.reload();
  await page.getByRole("button", { name: "New programme" }).click();
  await expect(page.getByText("New programme: tell me the details and I'll fill it in.")).toBeVisible();
});

test("AC3 engineers don't see Learning", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/time/my/2026-W42");
  expect((await page.goto("/learning"))?.status()).toBe(404);
});
