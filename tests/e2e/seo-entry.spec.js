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
  test.describe(`SEO Global direct tool entry ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } });
    test("opens the overseas workspace and restores its setup at the existing URL", async ({ page }) => {
      await page.goto("/en/");
      const attacker = page.getByRole("combobox", { name: "Attacker Jini", exact: true });
      await expect(attacker).toBeVisible();
      await expect(page.getByRole("heading", { name: "Roco Calculator guide", exact: true })).toHaveCount(0);
      await expect(page.locator(".result-column")).toHaveCount(0);
      await attacker.fill("迪莫");
      await page.getByRole("option", { name: /迪莫/ }).first().click();
      await page.reload();
      await expect(attacker).toHaveValue("迪莫");
      await expect(page.locator("html")).toHaveAttribute("data-server", "global");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      expect(new URL(page.url()).pathname).toBe("/en/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
