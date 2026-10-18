import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The demo's "today" is pinned to Oct 16, 2026 in career.settings, so nothing here reads the wall clock.
const URL = "/hr/p/LL-0417/career";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li")].filter((el) => !el.querySelector(".pin[data-pin]")).map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const tree = (page: Page) => page.getByRole("group", { name: /^Career tree for Kasun Dias/ });
const selected = (page: Page) => page.locator("section[aria-labelledby='career-selected'] .what");

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC4 the tree and the list show the same events: selecting one highlights both and shows its trace, everything is pinned, nothing is a form", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", URL);
  await expect(page.locator(".lede")).toHaveText("2 technologies proposed by the agent wait for confirmation, and the Azure Developer AZ-204 certification expired in May 2024. Everything below is read from HR, allocations, learning and delivery; nothing is typed in here.");
  await expect(page.locator(".ticket .v")).toHaveText(["5 yrs 4 mo", "2", "5", "2"]);
  await expect(page.locator(".ticket .p")).toHaveText(["Joined Jun 7, 2021", "Senior Engineer since Apr 2024", "9 technologies · 3 at once in Apr 2025", "1 expired"]);
  await expect(tree(page).locator(".node")).toHaveCount(14);
  await expect(tree(page).locator(".branch")).toHaveCount(5);
  await expect(tree(page).locator(".lf")).toHaveCount(13);
  await expect(tree(page).locator(".lf.prop")).toHaveCount(2);
  await expect(tree(page).locator(".fruit.old")).toHaveCount(1);
  await expect(page.locator(".changes .list li")).toHaveCount(13);
  await expect(selected(page)).toHaveText("Promoted to Senior Engineer");
  await expect(page.locator(".trace dd")).toHaveText(["Engineer → Senior Engineer", "Apr 1, 2024", "HR agent for Dilini Perera, Mar 22, 2024", "Maya Fernando, Mar 25, 2024", "HR employment period · trace #a41f…"]);

  await tree(page).getByRole("button", { name: /^Project Fleet Tracker/ }).locator(".pj").click();
  await expect(selected(page)).toHaveText("Fleet Tracker, 70%");
  await expect(page.locator(".changes li[aria-current='true']")).toContainText("Fleet Tracker, 70%");
  await page.locator(".changes .list li").filter({ hasText: /^Engineer/ }).getByRole("button").first().click();
  await expect(tree(page).getByRole("button", { name: "Promoted to Engineer, Jul 2022" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Certifications" }).click();
  await expect(page.locator(".changes .list li")).toHaveCount(2);

  await expect(page.locator("main form, main dialog, main input, main textarea, main [contenteditable]")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  await expect(tree(page).locator("foreignObject .pin[data-pin]")).toHaveCount(14);
  await page.getByRole("button", { name: "✦ Ask amax to correct history" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Kasun Dias");
  await expect(page.getByLabel("Message amax")).toHaveValue("Correct Kasun Dias's career history");
});

test("AC7 keyboard, reduced motion, dark theme and a narrow screen", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", URL);
  expect(await axe(page)).toEqual([]);
  const first = tree(page).locator("[data-i='0']");
  await first.focus();
  await page.keyboard.press("ArrowUp");
  await expect(tree(page).locator("[data-i='1']")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(selected(page)).toHaveText("Adatum claims spike, 10%");
  expect(await tree(page).locator(".branch").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await tree(page).locator(".branch").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("ct-grow");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  expect(await axe(page)).toEqual([]);
  await page.setViewportSize({ width: 700, height: 900 });
  const top = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
  expect(await top(".changes")).toBeLessThan(await top(".tree-card"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator(".ct").evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
});

test("AC6 a viewer outside Kasun's manager chain, HR and leadership gets not found", async ({ page }) => {
  await signIn(page, "sahan@lumenlabs.test", "/hr");
  expect((await page.goto(URL))?.status()).toBe(404);
});
