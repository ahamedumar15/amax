import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diffRatio, type Region } from "./diff";

const mock = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#031-secrets-and-keys`;
const REGIONS = [".row.head", ".tickets .ticket:nth-child(1)", ".tickets .ticket:nth-child(3)", ".tickets .ticket:nth-child(4)"];

async function capture(locator: Locator): Promise<Region> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("region is not visible");
  const box = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  return { box, png: await locator.page().screenshot({ clip: box, animations: "disabled", caret: "hide" }) };
}

async function signIn(page: Page, email: string) {
  await page.goto("/settings/keys");
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("031 AC4 Connections and keys matches the mock within 2%", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connections and keys");
  await expect(page.locator("table.tbl tbody tr")).toHaveCount(6);
  await expect(page.locator("tr", { hasText: "Azure DevOps" })).toContainText("Expires in 12 days");
  await expect(page.locator("tr", { hasText: "Zoho Sign" })).toContainText("Revoked");
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock);
  for (const sel of REGIONS) {
    const want = await capture(m.locator(`[id="031-secrets-and-keys"] ${sel}`).first());
    const got = await capture(page.locator(sel).first());
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); const n = sel.replace(/\W+/g, "_"); writeFileSync(`${process.env.DIFF_DIR}/${n}-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/${n}-app.png`, got.png); }
    expect(got.box.width, sel).toBe(want.box.width);
    expect(got.box.height, sel).toBe(want.box.height);
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  expect(await axe(page)).toEqual([]);
});

test("031 AC4 values are write-only: add, rotate and revoke never show them", async ({ page }) => {
  const [first, second] = [`test-gh-${Date.now()}-a`, `test-gh-${Date.now()}-b`];
  await signIn(page, "maya@lumenlabs.test");
  await page.getByRole("button", { name: "Add credential" }).click();
  await page.getByLabel("Connector").selectOption({ label: "GitHub" });
  await page.getByLabel("Value", { exact: true }).fill(first);
  await expect(page.getByLabel("Value", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Save credential" }).click();
  const row = page.locator("tr", { hasText: "GitHub" });
  await expect(row).toContainText("Active");
  await page.getByRole("button", { name: "Rotate GitHub" }).click();
  await page.getByLabel("New value").fill(second);
  await page.getByLabel("Keep the old value working for").selectOption("0");
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(row).toContainText("Active");
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Rotate GitHub" }).click();
  await page.getByRole("button", { name: "Revoke now" }).click();
  await expect(row).toContainText("Revoked");
  const html = await page.content();
  expect(html).not.toContain(first);
  expect(html).not.toContain(second);
});

test("031 AC4 Connections and keys is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Connections and keys");
});
