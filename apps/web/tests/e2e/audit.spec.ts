import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
}

const owner = () => postgres(Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString(), { max: 1, onnotice: () => {} });

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("050 AC-4 Audit and trace: chain status, events with pins, a trace timeline, and no write controls", async ({ page }) => {
  await signIn(page, "maya@lumenlabs.test", "/settings/audit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit and trace");
  for (const label of ["Audit chain", "Trace chain"]) await expect(page.locator(".ticket", { hasText: label })).toContainText("Verified");
  await expect(page.getByRole("button", { name: "Add Audit and trace status to chat" })).toHaveCount(4);
  const rows = page.locator("tbody tr.pinnable");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().getByRole("button", { name: /^Add (Audit|Trace) event \d+ to chat$/ })).toHaveCount(1);
  await page.getByLabel("Kind").selectOption("audit");
  await page.getByLabel("Person, agent, tool or record").fill("delivery.proposal.create");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.locator("tbody tr", { hasText: "via amax chat" }).first().getByRole("link", { name: /^Open trace/ }).click();
  const timeline = page.getByRole("region", { name: /^Trace t-/ });
  await expect(timeline).toContainText("Prompt received from Maya");
  await expect(timeline).toContainText("Pending write");
  await expect(timeline).toContainText("Confirmed by Maya");
  await expect(timeline).toContainText(/Service write .*audited as delivery\.proposal\.create/);
  await expect(page.locator("main form[method=post], main input:not([type=search]), main textarea")).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("050 AC-4 Audit and trace is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test", "/settings/audit");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit and trace" })).toHaveCount(0);
});

test("050 AC-5 a row edited as superuser shows Chain broken at event N after Verify now", async ({ page }) => {
  const db = owner();
  await db.begin(async (tx) => {
    await tx`alter table core.trace_event disable trigger trace_append_only`;
    await tx`update core.trace_event set tool = 'forged' where seq = 1`;
    await tx`alter table core.trace_event enable trigger trace_append_only`;
  });
  await db.end();
  await signIn(page, "maya@lumenlabs.test", "/settings/audit");
  await page.getByRole("link", { name: "Verify now" }).click();
  await expect(page.locator(".ticket", { hasText: "Trace chain" })).toContainText("Chain broken at event 1");
  await expect(page.getByRole("alert")).toContainText("no longer verifies");
});
