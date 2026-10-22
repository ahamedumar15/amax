import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#001-amax-foundation-time`;
const W42 = "/time/w/2026-W42";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC3 the Team week matches the mock: totals, agent share and the This week card within 2%", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await expect(page.locator(".lede")).toContainText("3 of 5 people have submitted 87.5 h. Agents logged 90.2 h, 64% of the team's 141.5 h.");
  await expect(page.locator("table.tbl tbody tr")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Approve 3 submitted (87.5 h)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remind 2 people" })).toBeVisible();
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock);
  for (const sel of [".cols > .card:nth-child(2)"]) {
    const want = await capture(m.locator(`[id="001-amax-foundation-time"] ${sel}`).first());
    const got = await capture(page.locator(`.time ${sel}`).first());
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF_DIR}/time-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/time-app.png`, got.png); await page.screenshot({ path: `${process.env.DIFF_DIR}/time-page.png`, fullPage: true }); }
    expect([got.box.width, got.box.height], sel).toEqual([want.box.width, want.box.height]);
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  expect(await axe(page)).toEqual([]);
});

test("070 AC5 a draft week's row opens chat to fix those hours, with the row pinned; a submitted week has no fix button", async ({ page, browser }) => {
  await signIn(page, "tharushi@lumenlabs.test", "/time/my/2026-W42");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Fix Fleet Tracker hours" }).click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Fleet Tracker, 2026-W42");
  await expect(page.getByLabel("Message amax")).toHaveValue("Fix my Fleet Tracker hours for 2026-W42: ");
  expect(await axe(page)).toEqual([]);
  const kasun = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await signIn(kasun, "kasun@lumenlabs.test", "/time/my/2026-W42");
  await expect(kasun.getByRole("button", { name: /^Fix .* hours$/ })).toHaveCount(0);
});

test("AC2 / 054 AC5 approving through chat locks the week; the My timesheet switch shows your own hours", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", W42);
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve Nimal Silva" }).click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("Nimal Silva, 2026-W42");
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Approve Nimal Silva's timesheet for 2026-W42 \(week id [0-9a-f-]{36}\)$/);
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText("Done:");
  await page.reload();
  await expect(page.locator("tr", { hasText: "Nimal Silva" })).toContainText("Locked");
  await expect(page.getByRole("button", { name: "Approve 2 submitted (56.0 h)" })).toBeVisible();
  await page.getByRole("link", { name: "My timesheet" }).click();
  await expect(page).toHaveURL(/\/time\/my\/2026-W42$/);
  await expect(page.locator("h1")).toHaveText("My timesheet");
  expect(await axe(page)).toEqual([]);
});
