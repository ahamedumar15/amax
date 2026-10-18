import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .donut-legend li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const rows = (page: Page) => page.locator(".queue tbody tr");
const tabs = (page: Page) => page.getByRole("navigation", { name: "Queue" }).getByRole("link");

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC3 Admin sees the mock's helpdesk: lede, tiles, charts, queues with SLA left and the Facilities empty state; pinned, no forms, accessible; New ticket opens chat", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "maya@lumenlabs.test", "/helpdesk");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Helpdesk");
  await expect(page.locator(".lede")).toHaveText("The support agent solved 41% of tickets on its own this month, mostly access requests. 2 tickets are close to breaching their SLA.");
  await expect(tabs(page)).toHaveText(["IT", "HR", "Facilities"]);
  await expect(page.locator(".ticket .k")).toHaveText(["Open tickets", "Solved by agent", "First response", "Satisfaction"]);
  await expect(page.locator(".ticket .v")).toHaveText(["27", "41%", "7 min", "4.7 / 5"]);
  await expect(page.locator(".ticket .p")).toHaveText(["9 waiting on the requester", "Up 12 points on September", "Target 30 min", "212 ratings"]);
  await expect(page.locator("#weeks-data tbody tr").last()).toHaveText(/W42\s*18\s*22/);
  await expect(page.locator(".donut-legend li")).toHaveText([/Access\s*38%/, /Hardware\s*21%/, /Network\s*16%/, /HR letters\s*14%/, /Other\s*11%/]);
  await expect(page.locator(".donut-wrap svg text").first()).toHaveText("163");
  await expect(page.getByRole("heading", { name: "IT queue" })).toBeVisible();
  await expect(rows(page).nth(0)).toHaveText(/INC-20431 VPN drops on home Wi-FiOpened 3 h ago, via Teams\s*AR\s*Ayesha Rahman\s*Network\s*High\s*45 min left\s*SK\s*Sahan K\./);
  await expect(rows(page).nth(1)).toHaveText(/INC-20429 Access to Fleet Tracker repoGranted by support agent after Nimal Silva approved.*Access\s*Normal\s*Done\s*Support agent/);
  await expect(rows(page).nth(2)).toHaveText(/INC-20427 Laptop for new joiner, Nov 2Created by onboarding checklist\s*NS\s*Nimal Silva\s*Hardware\s*Normal\s*2 d left/);
  await expect(page.locator("main form, main input, main textarea, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });

  await tabs(page).filter({ hasText: "HR" }).click();
  await expect(page.getByRole("heading", { name: "HR queue" })).toBeVisible();
  await expect(rows(page).first()).toHaveText(/HR-1186 Salary confirmation letter for visaLetter drafted, waiting for HR signature\s*KD\s*Kasun Dias\s*HR letters\s*Normal\s*1 d left\s*Support agent/);
  await tabs(page).filter({ hasText: "Facilities" }).click();
  await expect(page.getByText("No open Facilities tickets")).toBeVisible();
  expect(await unpinned(page)).toEqual([]);
  await page.locator(".actions").getByRole("button", { name: "New ticket" }).click();
  await expect(page.getByText("New ticket: tell me the details and I'll fill it in.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/helpdesk");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("AC2 IT Admin works the IT and Facilities queues and never sees an HR ticket", async ({ page }) => {
  await signIn(page, "ravi@lumenlabs.test", "/helpdesk?queue=hr");
  await expect(tabs(page)).toHaveText(["IT", "Facilities"]);
  await expect(page.getByRole("heading", { name: "IT queue" })).toBeVisible();
  await expect(page.locator(".ticket .v").first()).toHaveText("20");
  await expect(page.locator("main")).not.toContainText("HR-1");
  expect(await axe(page)).toEqual([]);
});

test("AC4 someone outside the desk gets a 404", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/helpdesk");
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
