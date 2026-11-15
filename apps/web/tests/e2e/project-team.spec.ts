import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { expect, test, type Page } from "@playwright/test";

const owner = () => postgres(Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString(), { max: 1, onnotice: () => {} });

async function chat(page: Page, text: string) {
  await page.getByLabel("Message amax").fill(text);
  await page.keyboard.press("Enter");
}

test("107 AC6 AC7 AC9 AC11 a new project's team: Add your team?, someone added until further notice, the Team page, then the PM handed over", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/signin");
  await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/delivery");
  await page.getByRole("button", { name: "Ask amax" }).click();
  await chat(page, "set up a project called Team Test (TMT)");
  const setUp = page.getByRole("group", { name: /^Confirm: Set up TMT/ });
  await setUp.getByRole("group", { name: "Client" }).getByRole("radio", { name: "Internal" }).check();
  await setUp.getByRole("group", { name: "Billing" }).getByRole("radio", { name: "Internal" }).check();
  await setUp.getByRole("button", { name: "Create TMT" }).click();
  await setUp.getByRole("button", { name: "Add your team?" }).click();
  await expect(page.getByLabel("Message amax")).toHaveValue("Add someone to TMT");
  await page.keyboard.press("Enter");

  const add = page.getByRole("group", { name: "Confirm: Add someone to TMT" });
  await add.getByRole("group", { name: "Who" }).getByRole("radio").first().check();
  await expect(add.getByLabel("Percent")).toHaveValue("100");
  await expect(add.getByRole("radio", { name: "Until further notice" })).toBeChecked();
  await add.getByRole("button", { name: /^Add .+ to TMT$/ }).click();
  await expect(add).toContainText("Added");

  await page.goto("/delivery/p/TMT/team");
  await expect(page.getByRole("heading", { name: "PM: Maya Fernando" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask amax · Add someone to TMT" })).toBeVisible();
  await expect(page.getByText("until further notice")).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  const db = owner();
  const [sahan] = await db`select id from auth.user where email = 'sahan@lumenlabs.test'`;
  await db.end();
  await page.getByRole("button", { name: "Ask amax", exact: true }).click();
  await chat(page, `make Sahan Kumara (user id ${sahan.id}) the PM of TMT`);
  const pm = page.getByRole("group", { name: "Confirm: Make Sahan Kumara the PM of TMT (was Maya Fernando)" });
  await pm.getByRole("button", { name: "Make PM" }).click();
  await expect(pm).toContainText("Sahan Kumara is the PM of TMT");
  await page.reload();
  await expect(page.getByRole("heading", { name: "PM: Sahan Kumara" })).toBeVisible();
});
