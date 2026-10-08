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

const guidePages = [
  { path: "/guide/", heading: "洛克计算器使用说明", entry: "开始伤害计算", toc: "本页目录", tools: "工具选择", faq: "常见问题", question: "配置会保存到哪里？", answer: "它不是账号云同步", language: "English guide", alternate: "/en/" },
  { path: "/en/", heading: "Roco Kingdom damage calculator guide", entry: "Open calculator (Chinese)", toc: "On this page", tools: "Choose a tool", faq: "FAQ", question: "Where are my configurations saved?", answer: "They are not synced through an account", language: "Chinese guide", alternate: "/guide/" },
];

for (const theme of ["light", "dark"]) {
  test.describe(`SEO guide without JavaScript ${theme}`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 820 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } });
    for (const guide of guidePages) {
      test(`supports ${guide.path} reading, native FAQ and navigation at 320px`, async ({ page }) => {
        await page.goto(guide.path);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
        await expect(page.getByRole("heading", { name: guide.heading, exact: true })).toBeVisible();
        await expect(page.locator(".intro").getByRole("link", { name: guide.entry, exact: true })).toHaveAttribute("href", "/");
        const evidence = "artifacts/guide-ui-20261008";
        mkdirSync(evidence, { recursive: true });
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(page.locator(".intro .primary-link")).toBeInViewport();
        await page.screenshot({ path: `${evidence}/${guide.path.split("/")[1]}-desktop-${theme}.png` });
        await page.setViewportSize({ width: 320, height: 820 });
        await expect(page.locator(".intro .primary-link")).toBeInViewport();
        await page.screenshot({ path: `${evidence}/${guide.path.split("/")[1]}-320-${theme}.png` });
        const toc = page.getByRole("navigation", { name: guide.toc, exact: true });
        await toc.getByRole("link", { name: guide.tools, exact: true }).click();
        await expect(page).toHaveURL(/#tools-heading$/);
        await expect(page.locator("#tools-heading")).toBeInViewport();
        await page.keyboard.press("Control+Home");
        await expect(toc).toBeInViewport();
        await toc.getByRole("link", { name: guide.faq, exact: true }).click();
        await page.getByText(guide.question, { exact: true }).click();
        await expect(page.locator("details[open]")).toContainText(guide.answer);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `${evidence}/${guide.path.split("/")[1]}-faq-320-${theme}.png` });
        await page.getByRole("link", { name: guide.language, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${guide.alternate}$`));
        await expect(page.locator(".intro .primary-link")).toHaveAttribute("href", "/");
      });
    }
  });
}
