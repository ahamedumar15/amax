import { expect, type Locator, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string, to: string) {
  await page.goto(to);
  await page.getByLabel("Demo user (fixtures only)").fill(email);
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await expect(page).toHaveURL((u) => u.pathname === to);
}

/** Click an Ask amax chip, check the pin and the filled-in prompt, finish (or replace) the prompt, send, confirm, and wait for Done. */
export async function askAndConfirm(page: Page, chip: Locator, want: { pin: string; prompt: string; type?: string; replace?: string }) {
  await chip.click();
  await expect(page.getByRole("complementary", { name: "amax chat" }).locator(".pinchip > span").last()).toHaveText(want.pin);
  const input = page.getByLabel("Message amax");
  await expect(input).toHaveValue(want.prompt);
  if (want.replace) await input.fill(want.replace);
  if (want.type) await input.pressSequentially(want.type);
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("group", { name: /^Confirm:/ }).last();
  await card.getByRole("button", { name: "Add it" }).click();
  await expect(card).toContainText("Done:");
  await page.reload();
}
