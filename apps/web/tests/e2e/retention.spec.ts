import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

const owner = () => postgres(Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString(), { max: 1, onnotice: () => {} });
const unpinned = (page: Page) => page.locator("main").evaluate((root) =>
  [...root.querySelectorAll(".card, .ticket, tbody tr, .list li, .row.line")]
    .filter((el) => !el.querySelector(".pin[data-pin]") && !el.closest(".ticket")?.parentElement?.querySelector(".pin[data-pin]"))
    .map((el) => (el.textContent ?? "").trim().slice(0, 60)));
const chat = (page: Page) => page.getByRole("complementary", { name: "amax chat" });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("032 AC-6 Data retention: what needs attention first, every rule, request and count pinned, chat-first, accessible", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test", "/settings/retention");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data retention");
  await expect(page.locator(".lede")).toContainText("One erasure request is waiting for a second approver.");
  await expect(page.locator(".ticket .k")).toHaveText(["Rules checked tonight", "Due tonight", "Open requests", "Legal holds"]);
  await expect(page.locator(".list li").first()).toContainText("Erasure, Rizwan Farook");
  await expect(page.locator(".list li").first()).toContainText("Salary and EPF number kept by law");
  await expect(page.getByRole("button", { name: "Ask to approve the erasure request for Rizwan Farook" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Salary and EPF number" })).toContainText("7 yearsstatutory minimum");
  await expect(page.locator(".row.line", { hasText: "Agent run logs" })).toContainText("9,410");
  expect(await unpinned(page)).toEqual([]);
  await expect(page.locator("main form[method=post], main textarea, main input, main dialog")).toHaveCount(0);
  await page.getByLabel("Legal entity", { exact: true }).selectOption({ label: "Lumen Labs Pty Ltd, Australia" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/entity=11111111-1111-4111-8111-1111111111a2/);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Data retention" })).toHaveAttribute("href", "/settings/retention");
});

test("032 AC-6 Data retention is for Admin and HR only", async ({ page }) => {
  const db = owner();
  const [u] = await db`insert into auth.user (tenant_id, email, name) values ('11111111-1111-4111-8111-111111111111', 'hira@lumenlabs.test', 'Hira Perera (fictional HR)') on conflict (tenant_id, email) do update set name = excluded.name returning id`;
  await db`insert into auth.role_assignment (tenant_id, user_id, role, source) values ('11111111-1111-4111-8111-111111111111', ${u.id}, 'HR', 'manual') on conflict do nothing`;
  await db.end();
  await signIn(page, "nimal@lumenlabs.test", "/settings/retention");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, "hira@lumenlabs.test", "/settings/retention");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data retention");
});

test("032 AC-4 the opener can't approve their own erasure request; a second Admin approves it in chat", async ({ page }) => {
  test.setTimeout(60_000);
  const approve = async () => {
    await page.getByRole("button", { name: "Ask to approve the erasure request for Rizwan Farook" }).click();
    await expect(chat(page).locator(".pinchip > span")).toHaveText(["Erasure, Rizwan Farook"]);
    await page.getByRole("button", { name: "Send" }).click();
    const card = page.getByRole("group", { name: /^Confirm:/ }).last();
    await card.getByRole("button", { name: /Add it|Confirm/ }).click();
    return card;
  };
  await signIn(page, "maya@lumenlabs.test", "/settings/retention");
  await expect(await approve()).toContainText(/a different person must complete this request/);
  await page.context().clearCookies();
  await signIn(page, "sahan@lumenlabs.test", "/settings/retention");
  await expect(await approve()).toContainText("Done");
  await page.reload();
  await expect(page.locator(".list li").first()).toContainText("Erasure, Erased person");
  await expect(page.locator(".lede")).toContainText("No erasure request is waiting.");
});
