import { join } from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { askAndConfirm } from "./ask";
import { capture, diffRatio } from "./diff";
import { lastTaskClosedByCi } from "./proposal-agent";

const mock = (id: string) => `${pathToFileURL(join(import.meta.dirname, "../../../../.specclaw/mock/index.html")).href}#${id}`;

async function signIn(page: Page, email = "maya@lumenlabs.test", to = "/delivery") {
  // 062: a signed-out / is the marketing page, so sign in from /signin, which lands on /.
  await page.goto(to === "/" ? "/signin" : to);
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

test("AC3 / 054 AC5 Move on the board asks amax with the proposal pinned; confirming moves it", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await expect(page.locator("main form, main dialog")).toHaveCount(0);
  const card = page.locator(".tcard", { hasText: "CON-017" });
  await card.hover();
  // 081 AC-22: a card's actions open from its Actions fold.
  await card.locator("summary", { hasText: "Actions" }).click();
  await askAndConfirm(page, card.getByRole("button", { name: "Move CON-017", exact: true }), { pin: "CON-017 CSV import for clients", prompt: "Move CON-017 to ", type: "building", confirm: "Move to Building", done: "Moved CON-017 to Building" });
  await expect.poll(() => lanes(page)).toEqual(["1", "1", "3", "2", "1"]);
  await expect(page.getByRole("button", { name: "Move CON-009", exact: true })).toHaveCount(0);
});

test("AC2 proposals show the phase bar and the full list", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals");
  const amxInFlight = (await amx()).filter((r) => r.phase !== "released").length;
  await expect(page.getByText(/^\d+ in flight$/)).toHaveText(`${37 + amxInFlight} in flight`);
  await expect(page.locator(".phase-legend li")).toHaveText([/Proposed\s*\d+/, /Planned\s*\d+/, /Building\s*\d+/, /Verified\s*\d+/, /Released in October\s*\d+/]);
  await page.getByRole("link", { name: "Released" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/released$/);
  await expect(page.locator("table.tbl tbody tr").first()).toContainText("Prod");
  expect(await axe(page)).toEqual([]);
});

test("AC2 releases: the map, and a promotion asked of amax reaches the next environment", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "sahan@lumenlabs.test", "/delivery/releases");
  await expect(page.getByRole("button", { name: "Retry UAT" })).toBeVisible();
  const row = page.locator("tr", { hasText: "v2.4.0" });
  await askAndConfirm(page, row.getByRole("button", { name: "Promote to UAT" }), { pin: "Contoso Portal v2.4.0", prompt: "Record a deployment of CON v2.4.0 to UAT" });
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

test("062 AC-10 the Repo sync card leads with refused pushes, pins every row, and links the repo through chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Repo sync" }) });
  await expect(card).toContainText("From github.com/example/contoso-portal");
  await expect(card).toContainText("2 recent pushes were refused.");
  await expect(card).toContainText("by Kasun Dias: 0 created · 3 updated · 14 unchanged");
  const rows = card.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Refused");
  await expect(rows.nth(2)).toContainText("Applied");
  await expect(card.locator("tbody tr button[data-pin]")).toHaveCount(3);
  await expect(card.locator("input, textarea, select")).toHaveCount(0);
  if (process.env.SHOTS_DIR) await card.screenshot({ path: `${process.env.SHOTS_DIR}/app.png` });
  expect(await axe(page)).toEqual([]);
});

// 081 AC-7, AC-15, AC-21: a proposal opens on its own page from the list and the board, survives a reload, and passes axe.
test("081 a proposal opens from the list and the board, with its time, release, tasks and history", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/proposals");
  await page.getByRole("navigation", { name: "Phase" }).getByRole("link", { name: "Planned" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/planned$/);
  await page.getByRole("navigation", { name: "Phase" }).getByRole("link", { name: "All", exact: true }).click();
  // The e2e tenant also holds AMX's imported specs, which fill the first page: search finds the row (AC-16).
  await page.getByLabel(/Search proposals by key or title/).fill("Invoice export");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/delivery\/proposals\?q=Invoice(\+|%20)export/);
  await page.getByRole("link", { name: /CON-014 Invoice export to PDF/ }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/CON-014$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CON-014 Invoice export to PDF");
  for (const h of ["Time", "Release", "Description", "Tasks", "History"]) await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CON-014");
  expect(await axe(page)).toEqual([]);

  await page.goto("/delivery/p/CON");
  await page.locator(".tcard", { hasText: "CON-014" }).getByRole("link", { name: "Invoice export to PDF" }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\/CON-014$/);
  await page.goto("/delivery/proposals/CON-404");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Proposal not found");

  // Emptying the search box (its ✕) goes back to the list without a search, keeping the project filter.
  await page.goto("/delivery/proposals?project=CON&q=CON-014", { waitUntil: "networkidle" });
  await page.getByLabel(/Search proposals by key or title/).fill("");
  await expect(page).toHaveURL(/\/delivery\/proposals\?project=CON$/);

  // Typing completes in the box from the filtered proposals, the guess selected: Backspace drops it, Tab keeps it.
  const search = page.getByLabel(/Search proposals by key or title/);
  await expect(search).toHaveAttribute("aria-autocomplete", "inline");
  await search.pressSequentially("inv");
  await expect(search).toHaveValue("invoice export to PDF");
  await page.keyboard.press("Backspace");
  await expect(search).toHaveValue("inv");
  await search.pressSequentially("o");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/delivery\/proposals\?project=CON&q=invoice(\+|%20)export(\+|%20)to(\+|%20)PDF$/);
  await expect(page.locator('td[data-label="Proposal"]')).toHaveText(["CON-014 Invoice export to PDF"]);

  // The project filter shows beside Filter; its ✕ goes back to all projects and keeps the search.
  await page.getByRole("link", { name: /Filtered to Contoso Portal/ }).click();
  await expect(page).toHaveURL(/\/delivery\/proposals\?q=invoice(\+|%20)export(\+|%20)to(\+|%20)PDF$/);
  await expect(page.getByRole("link", { name: /Filtered to/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

// 081 amendment 1 AC-22: a hand-made card's Actions fold offers Edit, Add a task, Move and Withdraw (Time's tones: Edit
// primary, Withdraw a quiet link). Add a task pins the card and fills chat's box; nothing is written until a card is confirmed.
test("081 AC-22 a board card's actions open from its fold and ask amax with the proposal pinned", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".tcard", { hasText: "CON-016" });
  await card.hover();
  await card.locator("summary", { hasText: "Actions" }).click();
  const group = card.getByRole("group", { name: "Ask amax about CON-016" });
  await expect(group.getByRole("button")).toHaveText(["Edit", "Add a task", "Move", "Withdraw"]);
  await expect(group.getByRole("button", { name: "Edit CON-016" })).toHaveClass(/primary/);
  await expect(group.getByRole("button", { name: "Withdraw CON-016" })).toHaveClass(/link/);
  await group.getByRole("button", { name: "Add a task to CON-016" }).click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText("CON-016 Audit trail on approvals");
  await expect(page.getByLabel("Message amax")).toHaveValue("Add a task to CON-016: ");
  await page.goto("/delivery/proposals/CON-016");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.getByText("No tasks yet.")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

// 081 amendment 2 AC-37: agent-first, end to end in the browser. A pinned proposal makes chat offer its next step;
// sending it shows the confirm card, and confirming moves it on the board.
test("081 AC-37 pin a proposal: chat offers its next step, and confirming it moves the proposal", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  const card = page.locator(".tcard", { hasText: "CON-016" });
  await card.hover();
  await card.getByRole("button", { name: "Add CON-016 Audit trail on approvals to chat" }).press("Enter");
  const offers = page.getByRole("list", { name: "Suggestions for this page" });
  await expect(offers.getByRole("button", { name: "Add a task to CON-016" })).toBeVisible();
  await offers.getByRole("button", { name: "Move CON-016 to Planned" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Move CON-016 to planned");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const confirm = page.getByRole("group", { name: /^Confirm:/ }).last();
  await expect(confirm).toContainText(/From\s*Proposed\s*To\s*Planned/);
  await confirm.getByRole("button", { name: "Move to Planned" }).click();
  await expect(confirm).toContainText("Moved CON-016 to Planned");
  await page.reload();
  await expect(page.locator('section.lane[aria-label^="Planned"] .tcard', { hasText: "CON-016" })).toBeVisible();
});

// 081 amendment 2 AC-37: CI closes a proposal's last task; the Delivery agent suggests Ready to verify; the PM sees it on
// the board and the proposal, accepts it in chat, sees it Verified and undoable, and undoes it.
test("081 AC-37 the agent suggests Ready to verify; accepting it in chat verifies the proposal, and undo puts it back", async ({ page }) => {
  test.setTimeout(90_000);
  const key = await lastTaskClosedByCi("Agent flow check");
  await signIn(page, "maya@lumenlabs.test", "/delivery/p/CON");
  await expect(page.locator(".tcard", { hasText: key }).getByRole("link", { name: `amax suggests something for ${key}: open it` })).toBeVisible();
  await page.goto(`/delivery/proposals/${key}`);
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Suggested by amax" }) });
  await expect(card).toContainText(`Move ${key} to Verified`);
  expect(await axe(page)).toEqual([]);
  const pin = `Move ${key} to Verified`;
  await askAndConfirm(page, card.getByRole("button", { name: `Ask amax to accept ${pin}` }),
    { pin, prompt: new RegExp(`^Accept the suggestion "${pin}" \\(suggestion id [0-9a-f-]{36}\\)$`), confirm: "Accept", done: `Accepted: ${pin}` });
  await expect(page.locator(".lede .chip").first()).toHaveText("Verified");
  await expect(card).toContainText("Accepted");
  await page.goto("/suggestions");
  await expect(page.locator("main")).toContainText(pin);
  await page.goto(`/delivery/proposals/${key}`);
  await askAndConfirm(page, card.getByRole("button", { name: `Ask amax to undo ${pin}` }),
    { pin, prompt: new RegExp(`^Undo the suggestion "${pin}" \\(suggestion id [0-9a-f-]{36}\\)$`), confirm: "Undo", done: `Undone: ${pin}` });
  await expect(page.locator(".lede .chip").first()).toHaveText("Building");
});
