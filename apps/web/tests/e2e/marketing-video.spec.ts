import { expect, test } from "@playwright/test";

test("064 AC3 the tour plays when asked, with captions, and never on its own", async ({ page, request }) => {
  for (const f of ["mp4", "webm", "en.vtt"]) expect((await request.get(`/marketing/amax-product.${f}`)).status()).toBe(200);
  expect((await request.get("/marketing/amax-product-poster.jpg")).status()).toBe(200);
  await page.goto("/welcome");
  const video = page.locator("#tour video");
  await expect(video).not.toHaveAttribute("autoplay");
  await expect(video.locator("source").first()).toHaveAttribute("type", "video/mp4");
  await expect(video.locator("track[kind=captions]")).toHaveAttribute("srclang", "en");
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const play = page.getByRole("button", { name: "Play the 35-second product tour" });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const box = (await play.boundingBox())!;
    expect([width, box.height >= 64 && box.width >= 64]).toEqual([width, true]);
  }
  await play.click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect(await video.evaluate((v: HTMLVideoElement) => v.error)).toBeNull();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toBeFocused();
  for (const [from, key] of [[page.getByRole("tabpanel").getByRole("button").last(), "Tab"], [page.getByRole("switch").first(), "Shift+Tab"]] as const) {
    await from.focus();
    await page.keyboard.press(key);
    await expect(video).toBeFocused();
  }
  await page.getByRole("tabpanel").getByRole("button").last().focus();
  await page.keyboard.press("Tab");
  await expect(video).toBeFocused();
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused);
  await expect.poll(paused).toBe(false);
  for (const want of [true, false]) {
    await page.keyboard.press("Space");
    await expect.poll(paused).toBe(want);
  }
});
