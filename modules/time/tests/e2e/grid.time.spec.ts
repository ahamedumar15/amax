import { expect, test } from "@playwright/test";
import { axe, signIn } from "./helpers";

const W42 = "/time/w/2026-W42";

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("073 AC13 AC14 AC17 AC19 the grid: labelled cells, the summary, a day's projects on focus and the footer", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  const stats = page.getByRole("list", { name: "This week's figures" });
  await expect(stats.getByRole("listitem")).toHaveCount(4);
  await expect(stats).toContainText("Team hours141.5 h");
  for (const k of ["Team hours", "Average utilisation", "People with missing days", "Waiting for your approval"]) await expect(stats.getByRole("button", { name: `Add ${k}, 2026-W42 to chat` })).toBeVisible();
  const friday = page.getByRole("button", { name: /^Kasun Dias, .+: 1\.0 h, low\. Fleet Tracker 1\.0 h$/ });
  await expect(friday).toContainText("▲");
  await friday.focus();
  await expect(page.getByRole("tooltip")).toContainText("Fleet Tracker: 1.0 h");
  await expect(page.locator("table.grid tfoot th")).toHaveText("Team");
  expect(await axe(page)).toEqual([]);
});

test("073 AC21 the date beside the week arrows opens the week that contains it", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await page.getByLabel("Jump to the week of").fill("2026-11-04");
  await expect(page).toHaveURL(/\/time\/w\/2026-W45$/);
});

test("073 AC16 AC20 a project filter and a sort only change the URL, and the figures follow", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await page.getByLabel("Project").selectOption("Fleet Tracker");
  await expect(page).toHaveURL(/\?project=Fleet\+Tracker$/);
  await expect(page.locator("table.grid caption")).toHaveText("Timesheets for 2026-W42, Fleet Tracker only");
  await page.getByRole("link", { name: "Total" }).click();
  await expect(page.getByRole("columnheader", { name: /Total/ })).toHaveAttribute("aria-sort", "ascending");
  const totals = await page.locator("table.grid tbody td[data-label=Total]").allInnerTexts();
  expect(totals.map(Number)).toEqual(totals.map(Number).sort((a, b) => a - b));
});

test("073 AC18 a name opens that member's week, read-only, with an Ask amax pinned to it", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", W42);
  await page.getByRole("link", { name: "Kasun Dias" }).click();
  await expect(page).toHaveURL(/\/time\/w\/2026-W42\/p\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1")).toHaveText("Kasun Dias");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask amax about this week" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("073 AC24 Team time and a member's week pass axe in dark and at phone width", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "maya@lumenlabs.test", W42);
  expect(await axe(page)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await axe(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Kasun Dias" }).click();
  expect(await axe(page)).toEqual([]);
});
