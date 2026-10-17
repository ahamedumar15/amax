import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, diffRatio } from "./diff";
import { shown } from "./shift";

const mock = (id: string) => `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#${id}`;

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`);
const lane = (page: Page, name: RegExp) => page.getByRole("region", { name });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("AC1 AC3 the board shows the fixtures pipeline and its chart matches the mock within 2%", async ({ page, context }) => {
  await signIn(page, "liam@lumenlabs.test", "/presales");
  await expect(page.locator(".lede")).toHaveText(`$596,000 open across 3 opportunities, plus 2 more the inbox agent found in Teams and email. Northwind has its demo on ${shown("2026-10-21")}.`);
  const tickets = page.locator(".ticket .v");
  await expect(tickets).toHaveText(["$596,000", "$280,800", "38%", "64 days"]);
  await expect(page.locator(".ticket .p").nth(1)).toContainText("47% of $596k open value");
  await expect(page.locator(".ticket .p").nth(2)).toHaveText("Up 6 points");
  for (const [name, n] of [[/^New idea, /, 0], [/^Lead, /, 0], [/^Qualified, /, 1], [/^Proposal, /, 1], [/^Negotiation, /, 1], [/^Closed, /, 2]] as const) await expect(lane(page, name).locator(".tcard")).toHaveCount(n);
  await expect(lane(page, /^Proposal/).locator(".tcard")).toHaveText(new RegExp(`Claims copilot.*\\$180,000.*60%.*Demo ${shown("2026-10-21")}`));
  await expect(lane(page, /^Closed/)).toContainText(`Won ${shown("2026-06-02")}`);
  await expect(lane(page, /^Closed/)).toContainText("Lost on price");
  await expect(page.locator(".found-item")).toHaveCount(2);
  await expect(page.locator(".found-item").first()).toContainText("About AUD 85,000 (≈ $56,000).");
  await expect(page.locator(".feed li").first()).toContainText("Liam moved Contoso support retainer to Negotiation");

  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock("001-amax-foundation-presales"));
  const want = await capture(m.locator('[id="001-amax-foundation-presales"] .cols.even > .card').first());
  const got = await capture(page.locator(".presales > .cols.even > .card").first());
  if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF_DIR}/chart-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/chart-app.png`, got.png); await page.screenshot({ path: `${process.env.DIFF_DIR}/board.png`, fullPage: true }); }
  expect([got.box.width, got.box.height]).toEqual([want.box.width, want.box.height]);
  expect(diffRatio(want, got)).toBeLessThanOrEqual(0.02);
  expect(await axe(page)).toEqual([]);
});

const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .tcard, tbody tr, .ticket, .steps li, .found-item, .feed li")]
    .filter((el) => !el.closest("table.sr") && !el.querySelector(":scope > td[colspan]") && !el.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));

const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test("AC1 AC2 AC4 the board has no forms: moves, removes and inbox finds open chat with the record pinned", async ({ page }) => {
  await signIn(page, "liam@lumenlabs.test", "/presales");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  await lane(page, /^Negotiation/).locator(".tcard", { hasText: "Support retainer" }).getByRole("button", { name: "Ask amax to move Contoso, Support retainer" }).click();
  await expect(chat(page).locator(".pinchip > span")).toHaveText(["PS-0137 Support retainer"]);
  await expect(page.getByLabel("Message amax")).toHaveValue("Move PS-0137 to ");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ask amax to add Adatum" }).click();
  await expect(chat(page).locator(".pinchip > span").last()).toHaveText("Inbox find: Adatum");
  await expect(page.getByLabel("Message amax")).toHaveValue("Accept the inbox find for Adatum");
  await expect(lane(page, /^New idea/).locator(".tcard")).toHaveCount(0);
});

test("AC3 Fill with amax opens the chat in new-opportunity mode", async ({ page }) => {
  await signIn(page, "liam@lumenlabs.test", "/presales");
  await page.getByRole("button", { name: "Fill with amax" }).click();
  await expect(page.getByText("New opportunity: tell me the details and I'll fill it in.")).toBeVisible();
});

test("AC1 AC4 the opportunity page logs every stage, calculates health, and has no forms, only Ask amax chips", async ({ page, context }) => {
  await signIn(page, "maya@lumenlabs.test", "/presales/o/PS-0142");
  await expect(page.locator("h1")).toHaveText("Claims copilot");
  await expect(page.locator(".lede")).toHaveText(`PS-0142 for Northwind Insurance. In Proposal for 14 days; the demo on ${shown("2026-10-21")} decides the next stage.`);
  await expect(page.locator("#details .chip").first()).toHaveText("Health: amber");
  await expect(page.locator(".timeline li")).toHaveCount(5);
  await expect(page.locator(".timeline li").nth(1)).toContainText(`Qualified, win chance updatedMaya, ${shown("2026-09-12")}. Discovery workshop held. Win chance 30% → 40%`);
  await expect(page.locator(".steps li.now")).toContainText(`Proposalsince ${shown("2026-10-02")}`);
  await expect(page.getByRole("button", { name: "Promote to delivery" })).toBeDisabled();
  expect(await axe(page)).toEqual([]);

  const m = await context.newPage();
  await m.setViewportSize({ width: 1440, height: 900 });
  await m.goto(mock("001-amax-foundation-opportunity"));
  const want = await capture(m.locator('[id="001-amax-foundation-opportunity"] aside .card').first());
  const got = await capture(page.locator(".presales aside .card").first());
  if (process.env.DIFF_DIR) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DIFF_DIR}/win-mock.png`, want.png); writeFileSync(`${process.env.DIFF_DIR}/win-app.png`, got.png); await page.screenshot({ path: `${process.env.DIFF_DIR}/opp.png`, fullPage: true }); }
  expect([got.box.width, got.box.height]).toEqual([want.box.width, want.box.height]);
  expect(diffRatio(want, got)).toBeLessThanOrEqual(0.02);

  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  await expect(page.getByText("Changes happen in chat. Pin anything, then ask.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Ask amax to" }).getByRole("button")).toHaveText(["Move to Negotiation", "Mark as lost", "Log activity", "Add task", "Add risk"]);
});

test("AC7 pin the opportunity, ask to add a task, confirm: the task appears", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/presales/o/PS-0142");
  await page.getByRole("group", { name: "Ask amax to" }).getByRole("button", { name: "Add task" }).click();
  await expect(chat(page).locator(".pinchip > span")).toHaveText(["PS-0142 Claims copilot"]);
  const input = page.getByLabel("Message amax");
  await expect(input).toHaveValue("Add a task to PS-0142: ");
  await input.pressSequentially("Draft the pricing sheet");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await expect(card).toContainText("Draft the pricing sheet");
  await expect(page.locator("#tasks")).not.toContainText("Draft the pricing sheet");
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText(/^.*Done: /);
  await page.reload();
  await expect(page.locator("#tasks tbody tr", { hasText: "Draft the pricing sheet" }).locator(".pin[data-pin]")).toHaveCount(1);
});
