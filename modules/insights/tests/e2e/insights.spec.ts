import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .brief, .brief li, .tcard, .trend, .split > div, .vs, .live, tbody tr")]
    .filter((el) => !el.closest("table.sr") && !el.closest("details") && !el.querySelector(":scope > .pin[data-pin], :scope > .card-head > .pin[data-pin], :scope > td > .pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 the briefing, risks, opportunities, talent, market and trends, each insight with its sources, confidence and date; pinned, no forms", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/insights");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
  await expect(page.locator(".brief .sub")).toHaveText("Written by the strategy agent on Mon Oct 12 from 1,284 signals. Each point links to its evidence.");
  await expect(page.locator(".brief ol > li")).toHaveCount(3);
  await expect(page.locator(".brief ol > li").first().locator(".src")).toHaveText("From sprint data, pipeline run 1190 and meeting logs in amax; high confidence; Oct 12");
  await expect(page.locator("tr[data-risk='Fleet Tracker']")).toContainText("71%");
  await expect(page.locator(".tcard")).toHaveCount(3);
  await expect(page.getByText("↑ 17.9% headcount this year (156 → 184)")).toBeVisible();
  await expect(page.locator(".split .big")).toHaveText(["8.4%", "23", "41", "38%", "4.2%", "4.8"]);
  await expect(page.getByRole("table", { name: /^Headcount and people with AI skills/ }).locator("tbody tr")).toHaveCount(10);
  await expect(page.locator(".trend")).toHaveCount(4);
  await expect(page.locator(".src a").first()).toHaveAttribute("href", "/delivery/p/FLT");
  await expect(page.locator("main form, main input, main textarea, main select")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("navigation", { name: "Risk view" }).getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/risk=people/);
  await expect(page.locator("tr[data-risk='HR Insights']")).toContainText("Ayesha Rahman is planned at 120% in December");
  await page.getByRole("link", { name: "Next 12 months" }).click();
  await expect(page.locator(".trend")).toHaveCount(5);
  await page.getByRole("button", { name: "Discuss with amax" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Let's discuss this week's briefing. ");
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("This week's briefing");
});

test("AC3 recurring agent work lists every installed agent job with a switch that asks amax; New job opens chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/insights");
  const jobs = page.getByRole("table", { name: "Recurring agent work" });
  for (const name of ["insights.briefing", "insights.risk-scan", "insights.skills-match", "inbox-agent.scan"]) await expect(jobs.locator(`tr[data-job='${name}'] [role=switch]`)).toHaveCount(1);
  await expect(jobs.locator("tr[data-job='inbox-agent.scan']")).toContainText("Teams and email scanSales channels and account mailboxes on the inbox agent's allow-listHourly");
  await jobs.getByRole("switch", { name: "Teams and email scan, ask amax to switch it off" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Pause the Teams and email scan schedule");
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Teams and email scan, recurring agent job");
  await page.getByRole("button", { name: "New job: ask amax to set up a recurring agent job" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Set up a new recurring agent job that ");
});
