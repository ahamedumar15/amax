import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mockUrl = `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#034-backup-restore-and-export`;

const REGIONS: [string, number, string][] = [
  [".crumb", 0.02, "same breadcrumb"],
  [".row.head h1", 0.02, "same title"],
  [".card.flush .card-head h2", 0.02, "same card title"],
  [".card:not(.flush) > .card-head h2", 0.02, "same card title"],
];

// Column widths follow the rows, so the header is measured with the cards, not held to 2%.
const MEASURED = [".tickets.four .ticket", ".tickets.four", ".card.flush thead", ".card.flush", ".card:not(.flush)"];

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

// The mock's later sections are unclosed (047 to 049), so its own section is shown alone.
const only034 = (page: Page) => page.evaluate(() => {
  const mine = document.getElementById("034-backup-restore-and-export")!;
  for (const s of document.querySelectorAll("section[data-change]")) if (s !== mine && !s.contains(mine)) (s as HTMLElement).style.display = "none";
  mine.classList.add("on");
  mine.style.display = "block";
});

test("034 AC-6 Backups and export matches the mock region by region", async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "maya@lumenlabs.test", "/settings/backups");
  const mock = await context.newPage();
  await mock.setViewportSize({ width: 1440, height: 900 });
  await mock.goto(mockUrl);
  await only034(mock);
  for (const p of [page, mock]) await p.addStyleTag({ content: ".rail{visibility:hidden} .chat{display:none} .pin{opacity:0 !important}" });
  const ratios: string[] = [];
  for (const [sel, max, why] of REGIONS) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    const ratio = diffRatio(a, b);
    ratios.push(`${sel} ${ratio.toFixed(4)} (≤ ${max}: ${why}) ${JSON.stringify([a.box, b.box])}`);
    if (process.env.DIFF_DIR) for (const [tag, r] of [["mock", a], ["app", b]] as const) writeFileSync(join(process.env.DIFF_DIR, `backups${sel.replace(/\W+/g, "_")}-${tag}.png`), r.png);
    expect.soft(ratio, `${sel}: ${why}`).toBeLessThanOrEqual(max);
  }
  for (const sel of MEASURED) {
    const [a, b] = [await capture(mock.locator(`section.on ${sel}`).first()), await capture(page.locator(`main ${sel}`).first())];
    ratios.push(`${sel} ${diffRatio(a, b).toFixed(4)} (measured; data differs from the mock)`);
  }
  if (process.env.DIFF_DIR) {
    writeFileSync(join(process.env.DIFF_DIR, "backups-ratios.txt"), ratios.join("\n"));
    await page.screenshot({ path: join(process.env.DIFF_DIR, "backups-app-full.png"), fullPage: true });
    await mock.screenshot({ path: join(process.env.DIFF_DIR, "backups-mock-full.png"), fullPage: true });
  }
  test.info().annotations.push({ type: "diff", description: ratios.join("; ") });
});
