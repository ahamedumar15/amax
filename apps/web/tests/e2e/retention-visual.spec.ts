import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mockUrl = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#032-data-retention-and-erasure`;

const REGIONS: [string, number, string][] = [
  [".crumb", 0.02, "same breadcrumb"],
  [".row.head h1", 0.02, "same title"],
  [".cols > .card.flush .card-head h2", 0.02, "same card title"],
  [".stack > .card:first-child .card-head h2", 0.02, "same card title"],
  [".stack > .card:last-child .card-head", 0.04, "the inline pin keeps its space beside the title, shifting the note right; the mock has no pin"],
];

const MEASURED = [".tickets.four .ticket", ".tickets.four", ".cols > .card.flush", ".stack > .card:first-child", ".stack > .card:last-child"];

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

test("032 AC-6 Data retention matches the mock region by region", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/settings/retention");
  const mock = await context.newPage();
  await mock.setViewportSize({ width: 1440, height: 900 });
  await mock.goto(mockUrl);
  for (const p of [page, mock]) await p.addStyleTag({ content: ".rail{visibility:hidden} .chat{display:none} .pin{opacity:0 !important}" });
  const ratios: string[] = [];
  for (const [sel, max, why] of REGIONS) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    const ratio = diffRatio(a, b);
    ratios.push(`${sel} ${ratio.toFixed(4)} (≤ ${max}: ${why})`);
    if (process.env.DIFF_DIR) for (const [tag, r] of [["mock", a], ["app", b]] as const) writeFileSync(join(process.env.DIFF_DIR, `retention${sel.replace(/\W+/g, "_")}-${tag}.png`), r.png);
    expect.soft(ratio, `${sel}: ${why}`).toBeLessThanOrEqual(max);
  }
  for (const sel of MEASURED) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    ratios.push(`${sel} ${diffRatio(a, b).toFixed(4)} (measured; data differs from the mock)`);
  }
  if (process.env.DIFF_DIR) {
    writeFileSync(join(process.env.DIFF_DIR, "retention-ratios.txt"), ratios.join("\n"));
    await page.screenshot({ path: join(process.env.DIFF_DIR, "app-full.png"), fullPage: true });
    await mock.screenshot({ path: join(process.env.DIFF_DIR, "mock-full.png"), fullPage: true });
  }
  test.info().annotations.push({ type: "diff", description: ratios.join("; ") });
});
