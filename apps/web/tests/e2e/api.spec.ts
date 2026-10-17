import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/settings/api");
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL(/\/settings\/api$/);
}

test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

test("035 AC6 API and webhooks is Admin only", async ({ page }) => {
  await signIn(page, "nimal@lumenlabs.test");
  expect((await page.goto("/settings/api"))?.status()).toBe(404);
  await expect(page.locator("main table")).toHaveCount(0);
});

test("035 AC1 the OpenAPI 3.1 document is served; a call without a key is refused", async ({ request }) => {
  const doc = await (await request.get("/api/v1/openapi.json")).json();
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.paths["/tools/list_projects"].post.operationId).toBe("list_projects");
  expect((await request.post("/api/v1/tools/list_projects", { data: {} })).status()).toBe(401);
});

test("035 AC2 a credential made in chat shows its key once on the card, and never again", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "maya@lumenlabs.test");
  await page.getByRole("button", { name: "Ask amax to create a service credential" }).click();
  const box = page.getByLabel("Message amax");
  await expect(box).toHaveValue("Create a service credential named ");
  await box.fill("Create a service credential named Release bot with delivery:write for 90 days");
  await page.keyboard.press("Enter");
  const card = page.getByRole("group", { name: /^Confirm:/ });
  await card.getByRole("button", { name: "Add it" }).click();
  const key = (await card.getByTestId("reveal-once").textContent())!;
  expect(key).toMatch(/^amx_sp_/);
  await card.getByRole("button", { name: "I've saved it" }).click();
  await expect(card.getByTestId("reveal-once")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("tr", { hasText: "Release bot" })).toContainText("delivery: write");
  expect(await page.content()).not.toContain(key);
  const res = await page.request.post("/api/v1/tools/list_projects", { headers: { authorization: `Bearer ${key}` }, data: {} });
  expect(res.status()).toBe(403);
});
