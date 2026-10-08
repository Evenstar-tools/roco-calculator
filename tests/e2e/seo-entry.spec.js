import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("SEO serves crawler files and a separate deer document", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("Sitemap: https://rococalc.top/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  expect(await sitemap.text()).toContain("https://rococalc.top/guide/");
  const deer = await request.get("/dianlu/");
  expect(deer.status()).toBe(200);
  expect(await deer.text()).toContain("<h1>电鹿斩杀线计算器</h1>");
  expect(await deer.text()).toContain('href="https://rococalc.top/dianlu/"');
});

for (const theme of ["light", "dark"]) {
  test.describe(`SEO guide without JavaScript ${theme}`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 820 }, colorScheme: theme });
    test("supports reading, native FAQ and navigation at 320px", async ({ page }) => {
      await page.goto("/guide/");
      await expect(page.getByRole("heading", { name: "洛克计算器使用说明", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "开始伤害计算", exact: true })).toHaveAttribute("href", "/");
      await expect(page.getByRole("link", { name: "打开电鹿斩杀线 →", exact: true })).toHaveAttribute("href", "/dianlu/");
      const evidence = "artifacts/seo-20261008";
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: `${evidence}/guide-320-${theme}.png` });
      await page.getByText("配置会保存到哪里？", { exact: true }).click();
      await expect(page.locator("details[open]")).toContainText("它不是账号云同步");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${evidence}/guide-faq-320-${theme}.png` });
      await page.getByRole("link", { name: "返回计算器开始比较", exact: true }).click();
      await expect(page.getByRole("heading", { name: "洛克王国：世界伤害计算器", exact: true })).toBeVisible();
    });
  });
}
