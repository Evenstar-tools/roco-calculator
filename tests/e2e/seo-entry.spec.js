import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("SEO serves crawler files and a direct deer entry without an introduction", async ({ request, page }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("Sitemap: https://rococalc.top/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("https://rococalc.top/en/");
  expect(sitemapText).not.toContain("https://rococalc.top/guide/");
  const deer = await request.get("/dianlu/");
  expect(deer.status()).toBe(200);
  const deerDocument = await deer.text();
  expect(deerDocument).toContain("<title>电鹿斩杀线计算器 | 洛克计算器 RocoCalc</title>");
  expect(deerDocument).not.toContain('class="site-intro"');
  expect(deerDocument).not.toContain('class="site-links"');
  let startApp;
  const bootGate = new Promise((resolve) => { startApp = resolve; });
  await page.route("**/assets/main-*.js", async (route) => { await bootGate; await route.continue(); });
  try {
    await page.goto("/dianlu/", { waitUntil: "commit" });
    await expect(page.locator("#root")).toBeEmpty();
    await expect(page.locator(".site-intro")).toHaveCount(0);
    await expect(page.locator(".site-links")).toHaveCount(0);
  } finally { startApp(); }
  const stacks = page.getByRole("spinbutton", { name: "特性层数", exact: true });
  await expect(stacks).toBeVisible();
  await expect(page.locator(".site-links")).toHaveCount(0);
  const before = Number(await stacks.inputValue());
  await page.getByRole("button", { name: "特性层数加一", exact: true }).click();
  await expect(stacks).toHaveValue(String(before + 1));
  const evidence = "artifacts/seo-simplify-20261014/e2e";
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/deer-ready.png` });
  await page.getByRole("link", { name: "返回主站", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".site-links")).toHaveCount(0);
  expect(await deer.text()).toContain('href="https://rococalc.top/dianlu/"');
});

for (const theme of ["light", "dark"]) {
  test.describe(`SEO English guide without JavaScript ${theme}`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 820 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } });
    test("keeps a short readable guide and calculator entry", async ({ page }) => {
      await page.goto("/en/");
      await expect(page.getByRole("heading", { name: "Roco Calculator guide", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Calculate damage in three steps", exact: true })).toBeVisible();
      await expect(page.locator(".steps > li")).toHaveCount(3);
      await expect(page.locator(".section-note")).toContainText("International-server stats and rules have not been verified");
      await expect(page.locator("nav, .faq, #damage-example, .tools")).toHaveCount(0);
      await expect(page.locator("a")).toHaveCount(1);
      const entry = page.getByRole("link", { name: "Open Roco Calculator", exact: true });
      await expect(entry).toHaveAttribute("href", "/");
      const evidence = "artifacts/seo-simplify-20261014/e2e";
      mkdirSync(evidence, { recursive: true });
      for (const width of [320, 1920]) {
        await page.setViewportSize({ width, height: width === 320 ? 820 : 1080 });
        await expect(entry).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `${evidence}/en-${width}-${theme}.png`, fullPage: true });
      }
      await entry.click();
      await expect(page).toHaveURL(/\/$/);
    });
  });
}
