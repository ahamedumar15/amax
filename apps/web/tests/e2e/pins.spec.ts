import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .tcard, tbody tr")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(":scope > td[colspan]") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC5 every card and row on time, allocations, HR and delivery screens has a pin", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/time/w/2026-W42");
  const pages = ["/time/w/2026-W42", "/time/my/2026-W42", "/allocations", "/hr/p/LL-0417", "/delivery/p/HRI"];
  await page.goto("/delivery/releases");
  const release = await page.locator('a[href^="/delivery/releases/"]').first().getAttribute("href");
  for (const path of [...pages, release!]) {
    await page.goto(path);
    await expect(page.locator("main .card").first()).toBeVisible();
    expect([path, await unpinned(page)]).toEqual([path, []]);
  }
});
