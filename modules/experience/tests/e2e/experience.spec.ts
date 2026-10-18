import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mockUrl = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#037-digital-experience`;
// Same text and box in the mock and the app: each must be within 2% (AC-7). The rest differs by data and is measured.
const REGIONS = [...[1, 2, 3, 4].map((n) => `.tickets.four .ticket:nth-child(${n}) .k`), ".cols > .card.flush .card-head h2", ...[1, 2, 3].map((n) => `.stack > .card:nth-child(${n}) .card-head h2`)];
const MEASURED = [".row.head h1", ".tickets.four", ".cols > .card.flush", ".stack > .card:nth-child(1)", ".stack > .card:nth-child(2)", ".stack > .card:nth-child(3)"];

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .row.line, .list li")].filter((el) => !el.querySelector(".pin[data-pin]")).map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const rows = (page: Page) => page.locator(".cols > .card.flush tbody tr");

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC3 AC7 Admin sees the mock's Digital experience: the dip and the fix first, groups of 5 or more with the formula, pinned, no forms, accessible", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/experience");
  await expect(page.locator(".experience .lede")).toHaveText("Experience dipped to 7.1 in Quality over the last 4 weeks. Teams has crashed on 14 laptops since Tuesday's update, and the experience agent suggests rolling it back.");
  await expect(page.locator(".ticket .v")).toHaveText(["7.9", "18", "64%", "2"]);
  await expect(page.locator(".ticket .p")).toHaveText(["Out of 10, all 184 people", "7.8% of 231 devices", "118 of 184, anonymous", "Suggested by the experience agent"]);
  await expect(rows(page)).toHaveText([/^Engineering\s*112\s*8\.1\s*Slow boots on 2021 laptops\s*Steady/, /^Quality\s*24\s*7\.1\s*Teams crashes after update\s*Down 1\.2/, /^Delivery\s*14\s*7\.9\s*VPN client keeps hanging\s*Steady/,
    /^Sales\s*9\s*7\.4\s*Battery health, 3 laptops\s*Up 0\.3/, /^People and Culture\s*8\s*8\.3\s*None\s*Steady/, /^Other Finance, IT, Leadership\s*17\s*8\.0\s*None\s*Steady/, /^All\s*184\s*7\.9\s*Groups under 5 people are never shown/]);
  await expect(page.locator(".formula")).toContainText("Score = 40% device health + 40% app reliability + 20% pulse");
  await expect(page.locator(".list li")).toHaveText([/Roll back Teams on 14 laptopsCrashes started after Tuesday's update\. 88% confidence\s*Review/, /Replace 6 laptops from 2021 in EngineeringBoot over 4 min, 2\.3× the fleet's median\. Opens an IT ticket\s*Review/]);
  await expect(page.locator(".stack > .card").nth(1).locator(".row.line")).toHaveText([/Works well\s*71%/, /Gets in the way sometimes\s*23%/, /Gets in the way a lot\s*6%/]);
  await expect(page.locator(".stack > .card").nth(2)).toContainText("Notice sent Sep 1");
  await expect(page.locator("main form, main input, main textarea, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/app.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Review Roll back Teams on 14 laptops" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue(/^Review the experience agent's fix "Roll back Teams on 14 laptops"/);
  await page.goto("/experience");
  await page.getByLabel("Group by").selectOption("site");
  await expect(page).toHaveURL(/\?by=site$/);
  await expect(page.locator(".cols > .card.flush .card-head h2")).toHaveText("By site");
  await expect(rows(page).first()).toHaveText(/^Sri Lanka\s*171/);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/experience");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("AC7 the Digital experience screen matches the mock region by region", async ({ page, context }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/experience");
  const mock = await context.newPage();
  await mock.setViewportSize({ width: 1440, height: 900 });
  await mock.goto(mockUrl);
  for (const p of [page, mock]) await p.addStyleTag({ content: ".rail{visibility:hidden} .chat{display:none} .pin{opacity:0 !important}" });
  const ratios: string[] = [];
  for (const [sel, gate] of [...REGIONS.map((s) => [s, true] as const), ...MEASURED.map((s) => [s, false] as const)]) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    const ratio = diffRatio(a, b);
    ratios.push(`${sel} ${ratio.toFixed(4)}${gate ? " (≤ 0.02)" : " (measured; data differs from the mock)"}`);
    if (process.env.DIFF_DIR) for (const [tag, r] of [["mock", a], ["app", b]] as const) writeFileSync(join(process.env.DIFF_DIR, `experience${sel.replace(/\W+/g, "_")}-${tag}.png`), r.png);
    if (gate) expect.soft(ratio, sel).toBeLessThanOrEqual(0.02);
  }
  if (process.env.DIFF_DIR) writeFileSync(join(process.env.DIFF_DIR, "experience-ratios.txt"), ratios.join("\n"));
  test.info().annotations.push({ type: "diff", description: ratios.join("; ") });
});

test("AC7 Leadership sees it; an Engineer gets a 404", async ({ page }) => {
  await signIn(page, "sarah@lumenlabs.test", "/experience");
  await expect(page.locator("main h1")).toHaveText("Digital experience");
  await page.context().clearCookies();
  await signIn(page, "nimal@lumenlabs.test", "/experience");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
