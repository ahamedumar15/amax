import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diffRatio, type Region } from "./diff";

const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#035-api-webhooks-and-rate-limits`;
async function capture(locator: Locator): Promise<Region> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("region is not visible");
  const box = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  return { box, png: await locator.page().screenshot({ clip: box, animations: "disabled", caret: "hide" }) };
}

const TICKETS = [1, 2, 3, 4].map((n) => `.tickets .ticket:nth-child(${n})`);
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);

test("035 AC6 API and webhooks matches the mock within 2%, in light and dark, with no axe violations", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings/api");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("API and webhooks");
  await expect(page.locator(".lede")).toContainText("Four service credentials and three webhooks. 12 unsigned webhook calls were rejected this week, all claiming to be from GitHub.");
  await expect(page.locator(".card", { hasText: "Service credentials" }).locator("tbody tr")).toHaveCount(4);
  await expect(page.locator(".tickets .ticket .v")).toHaveText(["4", "12", "99.6%", "86"]);
  await expect(page.locator(".tickets .ticket:nth-child(4) .p")).toHaveText("One MCP client, Tuesday");
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock);
  for (const sel of TICKETS) {
    const want = await capture(m.locator(`[id="035-api-webhooks-and-rate-limits"] ${sel}`).first());
    const got = await capture(page.locator(sel).first());
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); const n = sel.replace(/\W+/g, "_"); writeFileSync(`${process.env.DIFF_DIR}/${n}-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/${n}-app.png`, got.png); }
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  if (process.env.DIFF_DIR) await page.screenshot({ path: `${process.env.DIFF_DIR}/app.png`, fullPage: true });
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
});
