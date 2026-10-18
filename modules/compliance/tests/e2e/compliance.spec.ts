import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mockUrl = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#036-compliance-registers`;
// Same text and box in the mock and the app: each must be within 2% (AC-6). The rest differs by data and is measured.
const REGIONS = [...[1, 2, 3, 4].map((n) => `.tickets.four .ticket:nth-child(${n}) .k`), ".cols > .card.flush .card-head h2", ".stack > .card:first-child .card-head h2", ".stack > .card:last-child .card-head h2"];
// The title's box is as wide as the head's text column, which the longer lede widens.
const MEASURED = [".row.head h1", ".tickets.four", ".cols > .card.flush", ".stack > .card:first-child", ".stack > .card:last-child"];

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .row.line")].filter((el) => !el.querySelector(".pin[data-pin]")).map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test("AC6 the Compliance screen leads with what needs attention, is pinnable and accessible, and asks chat for every write", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "sahan@lumenlabs.test", "/compliance");
  await expect(page.locator(".compliance .lede")).toHaveText("17 people still need to acknowledge the updated Acceptable Use policy, and one possible data breach needs a decision by Nov 15.");
  await expect(page.locator(".ticket .v")).toHaveText(["91%", "1", "9", /^\d\d:\d\d$/]);
  await expect(page.locator(".ticket .p").nth(2)).toHaveText("2 high, 7 medium");
  await expect(page.locator(".cols > .card.flush tbody tr").first()).toContainText("Payslip emailed to the wrong person");
  await expect(page.locator(".row.line", { hasText: "Acceptable Use v4" })).toContainText("17 pending");
  await expect(page.locator("tr", { hasText: "Anthropic" })).toContainText("from AI and data settings");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/app.png`, fullPage: true });
  await page.getByRole("button", { name: "Ask amax to decide on Payslip emailed to the wrong person" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Decide on INC-002, "Payslip emailed to the wrong person" \(incident id [0-9a-f-]{36}\)/);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/compliance");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
});

test("AC6 the Compliance screen matches the mock region by region", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "sahan@lumenlabs.test", "/compliance");
  const mock = await context.newPage();
  await mock.setViewportSize({ width: 1440, height: 900 });
  await mock.goto(mockUrl);
  for (const p of [page, mock]) await p.addStyleTag({ content: ".rail{visibility:hidden} .chat{display:none} .pin{opacity:0 !important}" });
  const ratios: string[] = [];
  for (const [sel, gate] of [...REGIONS.map((s) => [s, true] as const), ...MEASURED.map((s) => [s, false] as const)]) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    const ratio = diffRatio(a, b);
    ratios.push(`${sel} ${ratio.toFixed(4)}${gate ? " (≤ 0.02)" : " (measured; data differs from the mock)"}`);
    if (process.env.DIFF_DIR) for (const [tag, r] of [["mock", a], ["app", b]] as const) writeFileSync(join(process.env.DIFF_DIR, `compliance${sel.replace(/\W+/g, "_")}-${tag}.png`), r.png);
    if (gate) expect.soft(ratio, sel).toBeLessThanOrEqual(0.02);
  }
  if (process.env.DIFF_DIR) writeFileSync(join(process.env.DIFF_DIR, "compliance-ratios.txt"), ratios.join("\n"));
  test.info().annotations.push({ type: "diff", description: ratios.join("; ") });
});
