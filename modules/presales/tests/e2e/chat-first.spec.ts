import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
}

const lane = (page: Page, name: RegExp) => page.getByRole("region", { name });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

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

test("AC1 AC4 the opportunity page has no forms, only Ask amax chips, and everything is pinned", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/presales/o/PS-0142");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  expect(await unpinned(page)).toEqual([]);
  await expect(page.getByText("Changes happen in chat. Pin anything, then ask.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Ask amax to" }).getByRole("button")).toHaveText(["Move to Negotiation", "Mark as lost", "Log activity", "Add task", "Add risk", "Change details"]);
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
