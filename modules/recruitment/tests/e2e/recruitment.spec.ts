import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, .tcard, .lane, .funnel li")]
    .filter((el) => !el.querySelector(":scope > .pin[data-pin], :scope > * > .pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });
const lane = (page: Page, name: RegExp) => page.getByRole("region", { name });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC2 Admin sees the mock's tiles, board, funnel and hires with candidate names masked; everything pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/recruitment");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recruitment");
  await expect(page.locator(".lede")).toHaveText("4 open roles. Two were raised by the resourcing agent from January demand on Fleet Tracker phase 2.");
  await expect(page.locator(".ticket .k")).toHaveText(["Open roles", "Candidates", "Time to hire", "Offers accepted"]);
  await expect(page.locator(".ticket .v")).toHaveText(["4", "63", "31 days", "80%"]);
  await expect(page.locator(".lane-head")).toHaveText([/Applied\s+22/, /Screening\s+9/, /Interviews\s+5/, /Offer\s+1/, /Hired this quarter\s+4/]);
  await expect(page.locator(".lane .more")).toHaveText(["+20 more", "+8 more", "+4 more", "+3 more"]);
  await expect(page.locator(".tcard .masked")).toHaveCount(6);
  await expect(page.locator(".funnel b")).toHaveText(["63", "41", "19", "5", "4"]);
  await expect(page.getByRole("img", { name: "Hires per month" })).toBeVisible();
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
});

test("AC1 AC2 HR sees names, the agent's match scores and each stage's detail; New role opens chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/recruitment");
  await page.getByRole("button", { name: /profile menu/ }).click();
  await page.getByRole("menuitemradio", { name: "HR" }).click();
  await expect(page.getByRole("note")).toContainText("Viewing as HR");
  await page.goto("/recruitment");
  await expect(lane(page, /^Applied/).locator(".tcard")).toHaveText([/Dinithi Fernando\s*Match 86%\s*LinkedIn/, /Arjun Mehta\s*Match 72%\s*Careers page/]);
  await expect(lane(page, /^Screening/).locator(".tcard")).toHaveText([/Sachini Perera\s*Match 91%\s*Referral/]);
  await expect(lane(page, /^Interviews/).locator(".tcard")).toHaveText([/Ravindu Jayasuriya\s*2 of 3 rounds\s*Thu 10:00/]);
  await expect(lane(page, /^Offer/).locator(".tcard")).toHaveText([/Hasini Gunawardena\s*Out for signature\s*Sent Oct 14/]);
  await expect(lane(page, /^Hired/).locator(".tcard")).toHaveText([/Mohamed Rifkhan\s*Starts Nov 2\s*Onboarding/]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("link", { name: "+20 more" }).click();
  await expect(lane(page, /^Applied/).locator(".tcard")).toHaveCount(22);
  await page.getByRole("button", { name: "New role, ask amax" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Open a new role: title, department, entity, openings and the skills to screen for");
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Open roles");
});

test("AC1 someone without recruitment gets a 404", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/recruitment");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
