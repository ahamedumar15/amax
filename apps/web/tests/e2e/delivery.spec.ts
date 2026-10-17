import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";

const mock = (id: string) => `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#${id}`;

async function signIn(page: Page, email = "maya@lumenlabs.test", to = "/delivery") {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const lanes = (page: Page) => page.locator(".board .lane-head > span:last-child").allInnerTexts();

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

// The e2e tenant also holds AMX, amax's own specs imported by the 039 sync (see global-auth.ts).
const amx = async () => (await import("../../../../modules/delivery/sync/specclaw")).readSpecclaw(join(import.meta.dirname, "../../../.."));

test("AC2 portfolio renders the fixture projects from the database", async ({ page }) => {
  await signIn(page);
  const rows = page.locator("table.tbl tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Contoso Portal");
  await expect(rows.nth(1)).toContainText("At risk");
  await expect(page.locator(".tickets")).toContainText("$774,000");
  expect(await axe(page)).toEqual([]);
});

test("AC2 the Contoso board matches the mock (released lane and card within 2%)", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  expect(await lanes(page)).toEqual(["2", "1", "2", "2", "1"]);
  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock("001-amax-foundation-project"));
  for (const sel of [".board .lane:last-child .lane-head", ".board .lane:last-child .tcard"]) {
    const want = await capture(m.locator(sel).first());
    const got = await capture(page.locator(sel).first());
    expect(got.box.width, sel).toBe(want.box.width);
    expect(got.box.height, sel).toBe(want.box.height);
    if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); const n = sel.replace(/\W+/g, "_"); writeFileSync(`${process.env.DIFF_DIR}/${n}-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/${n}-app.png`, got.png); }
    expect(diffRatio(want, got), sel).toBeLessThanOrEqual(0.02);
  }
  expect(await axe(page)).toEqual([]);
});

test("AC3 Move is an explicit action on the board", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".tcard", { hasText: "CON-017" });
  await card.hover();
  await card.getByLabel("Move CON-017").click();
  await page.getByLabel("Move CON-017 to").selectOption("building");
  await page.locator("form", { has: page.getByLabel("Move CON-017 to") }).getByRole("button", { name: "Move" }).click();
  await expect.poll(() => lanes(page)).toEqual(["1", "1", "3", "2", "1"]);
  await expect(page.getByLabel("Move CON-009 to")).toHaveCount(0);
});

test("AC2 proposals show the phase bar and the full list", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals");
  const amxInFlight = (await amx()).filter((r) => r.phase !== "released").length;
  await expect(page.getByText(/^\d+ in flight$/)).toHaveText(`${37 + amxInFlight} in flight`);
  await expect(page.locator(".phase-legend li")).toHaveText([/Proposed\s*\d+/, /Planned\s*\d+/, /Building\s*\d+/, /Verified\s*\d+/, /Released this month\s*\d+/]);
  await page.getByRole("link", { name: "Released" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/released$/);
  await expect(page.locator("table.tbl tbody tr").first()).toContainText("Prod");
  expect(await axe(page)).toEqual([]);
});

test("AC2 releases: the map and a promotion that reaches the next environment", async ({ page }) => {
  await signIn(page, "sahan@lumenlabs.test", "/delivery/releases");
  await expect(page.getByRole("button", { name: "Retry UAT" })).toBeVisible();
  const row = page.locator("tr", { hasText: "v2.4.0" });
  await row.getByRole("button", { name: "Promote to UAT" }).click();
  await expect(row.getByRole("button", { name: "Promote to Prod" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("roles without delivery access don't get the screens", async ({ page }) => {
  await page.goto("/delivery");
  await page.getByLabel("Demo user (fixtures only)").fill("liam@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Projects");
});

test("039 the AMX board shows amax's own specs in the same phases the queue reports", async ({ page }) => {
  const { readSpecclaw } = await import("../../../../modules/delivery/sync/specclaw");
  const records = readSpecclaw(join(import.meta.dirname, "../../../.."));
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/AMX");
  const want = ["proposed", "planned", "building", "verified", "released"].map((ph) => String(records.filter((r) => r.phase === ph).length));
  expect(await lanes(page)).toEqual(want);
  const first = page.locator(".tcard", { hasText: "AMX-001" });
  await expect(first).toBeVisible();
  const ready = records.find((r) => r.status === "ready");
  if (ready) await expect(page.locator(".tcard", { hasText: `AMX-${ready.number}` })).toContainText("ready");
  expect(await axe(page)).toEqual([]);
});
