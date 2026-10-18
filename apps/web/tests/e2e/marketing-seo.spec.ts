import { expect, test } from "@playwright/test";

test("062 AC7 search and sharing tags, robots and sitemap", async ({ page, request }) => {
  await page.goto("/welcome");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /amax-og\.jpg$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  expect(robots).toContain("Allow: /$");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("<loc>");
});
