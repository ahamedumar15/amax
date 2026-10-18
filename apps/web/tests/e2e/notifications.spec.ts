import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { lumen } from "@amax/testing";

const owner = () => postgres(Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString(), { max: 1, onnotice: () => {} });

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

async function addNotification(title: string) {
  const sql = owner();
  try {
    await sql`insert into notifications.notification (tenant_id, user_id, event_id, rule_id, module, module_title, category, title, href)
      select ${lumen.tenant.id}, id, ${randomUUID()}, 'time.week-reminded', 'time', 'Time', 'reminders', ${title}, '/time/my/2026-W42' from auth.user where email = 'maya@lumenlabs.test'`;
  } finally {
    await sql.end();
  }
}

test("030 AC-6 the bell: unread count, unread first by module, keyboard, live announcements and links that focus the record's screen", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/delivery");
  const bell = page.getByRole("button", { name: "Notifications, 2 unread" });
  await bell.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: /Notifications/ });
  await expect(panel.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText(["Time", "Projects"]);
  await expect(panel.getByRole("link", { name: "Kasun Dias submitted 2026-W42" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add Kasun Dias submitted 2026-W42 to chat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();

  await addNotification("Reminder: submit your timesheet for 2026-W42");
  await bell.click();
  await panel.getByRole("link", { name: "Notification settings" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/notifications");
  await expect(page.locator("div.sr[role=status][aria-atomic=true]")).toHaveText("New notification: Reminder: submit your timesheet for 2026-W42", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Notifications, 3 unread" })).toBeVisible();

  await page.getByRole("button", { name: "Notifications, 3 unread" }).click();
  await panel.getByRole("link", { name: "Kasun Dias submitted 2026-W42" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/time/w/2026-W42");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("030 AC-3 the Notifications page: channels per category, digest and quiet hours in the entity's zone, changed only through chat", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notifications");
  const row = (name: string) => page.locator("tbody tr", { hasText: name });
  await expect(row("Approvals").locator("td")).toHaveText(["Approvals", "On", "On", "On", "Off", ""]);
  await expect(row("Releases").locator("td")).toHaveText(["Releases", "On", "Off", "On", "Daily at 08:00", ""]);
  await expect(row("Reminders").getByRole("button", { name: "Add Reminders notifications to chat" })).toBeAttached();
  await expect(page.getByText("21:00 to 07:00, Asia/Colombo (Lumen Labs Lanka (Pvt) Ltd)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask amax to change quiet hours" })).toHaveAttribute("data-ask", "Set my quiet hours to ");
  await expect(page.locator("main form, main input, main textarea, main select, main dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /profile menu/ }).click();
  await expect(page.getByRole("menuitem", { name: "Notifications" })).toHaveAttribute("href", "/notifications");
  await page.keyboard.press("Escape");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await expect(page.locator("nav.rail").getByRole("link", { name: "Notifications" })).toHaveCount(0);
});
