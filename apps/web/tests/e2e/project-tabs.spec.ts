import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./ask";

const TABS = ["", "/proposals", "/releases", "/risks", "/team", "/contract"];
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("122 AC2 AC3 one header on every tab: the tab bar stays put and any (i) sits beside the project name", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const tops: number[] = [], infos: number[] = [];
    for (const tab of TABS) {
      await page.goto(`/delivery/p/CON${tab}`);
      tops.push((await box(page, 'main nav.tabs[aria-label="Sections"]'))!.y);
      await expect(page.locator("main .dv-head h1")).toHaveText("Contoso Portal");
      infos.push(await page.locator("main .dv-info-btn").count());
      expect(await page.locator("main .dv-info-btn").count()).toBe(await page.locator("main .dv-head .dv-title .dv-info-btn").count());
    }
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    expect(new Set(infos).size).toBe(1);
  }
});

test("122 AC4 AC5 Team is one card: the project manager leads it on a highlighted row, and its head stays on one line", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON/team");
  await expect(page.locator("main .card")).toHaveCount(1);
  const lead = page.locator("main .team-card .team-lead");
  await expect(lead).toContainText("Maya Fernando");
  await expect(lead).toContainText("Project manager");
  await expect(lead.getByRole("button", { name: /Contoso Portal PM/ })).toHaveCount(1);
  expect((await lead.boundingBox())!.y).toBeLessThan((await box(page, "main .team-card table"))!.y);
  const title = (await box(page, "main .team-card .card-head h2"))!, note = (await box(page, "main .team-card .card-head .note"))!;
  expect(Math.abs(title.y + title.height - (note.y + note.height))).toBeLessThan(6);
  for (const colorScheme of ["light", "dark"] as const) { await page.emulateMedia({ colorScheme }); expect(await axe(page)).toEqual([]); }
});

test("122 AC6 a project's Proposals and Releases tables have no Project column; the all-projects pages keep it", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON/proposals");
  const heads = () => page.locator("main table.tbl thead th").allInnerTexts();
  expect(await heads()).not.toContain("Project");
  await page.goto("/delivery/p/CON/releases");
  expect(await heads()).not.toContain("Project");
  await page.goto("/delivery/proposals");
  expect(await heads()).toContain("Project");
  await page.goto("/delivery/releases");
  expect(await heads()).toContain("Project");
});

test("122 AC7 Releases on a project with none: one line for the map and an empty state for the list", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/AMX/releases");
  await expect(page.locator("main .card.map .dv-empty-line")).toHaveText("No active releases on amax. Switch to All to see past ones.");
  const list = page.locator("main .card", { hasText: "All releases" });
  await expect(list.getByText("No releases yet")).toBeVisible();
  await expect(list.locator("table")).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) { await page.emulateMedia({ colorScheme }); expect(await axe(page)).toEqual([]); }
  await page.goto("/delivery/p/CON/proposals");
  for (const colorScheme of ["light", "dark"] as const) { await page.emulateMedia({ colorScheme }); expect(await axe(page)).toEqual([]); }
});

test("122 AC8 at 390 px every tab wraps its header and never scrolls the page sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  for (const tab of TABS) {
    await page.goto(`/delivery/p/CON${tab}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tabs = (await box(page, 'main nav.tabs[aria-label="Sections"]'))!;
    expect(tabs.x + tabs.width).toBeLessThanOrEqual(390);
  }
});
