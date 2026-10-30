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

for (const theme of ["light"]) {
  test.describe(`SEO Global direct tool entry ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } });
    test("opens the overseas workspace and restores its setup at the existing URL", async ({ page }) => {
      await page.goto("/en/");
      const attacker = page.getByRole("combobox", { name: "Attacker Jini", exact: true });
      await expect(attacker).toBeVisible();
      await expect(page.getByRole("heading", { name: "Roco Calculator guide", exact: true })).toHaveCount(0);
      await expect(page.locator(".result-column")).toHaveCount(0);
      await attacker.fill("迪莫");
      await page.getByRole("option", { name: /^Dimo / }).first().click();
      await page.reload();
      await expect(attacker).toHaveValue("Dimo");
      await expect(page.locator("html")).toHaveAttribute("data-server", "global");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      expect(new URL(page.url()).pathname).toBe("/en/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}


test("SEO Global S3 release keeps calculation across English, Japanese, refresh and offline", async ({ page, context }) => {
  await page.goto("/en/");
  await page.getByRole("combobox", { name: "Attacker Jini", exact: true }).fill("Dimo");
  await page.getByRole("option", { name: "Dimo 001 · Stage 1", exact: true }).click();
  await page.getByRole("combobox", { name: "Defender Jini", exact: true }).fill("Meodow");
  await page.getByRole("option", { name: "Meodow 004 · Stage 3", exact: true }).click();
  await page.getByRole("button", { name: "Detailed", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Damage result" }).getByRole("status")).toHaveText("23");
  await expect(page.locator("html")).toHaveAttribute("data-season", "s3");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption("s5");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-season", "s5");
  await expect(page.locator("header img")).toHaveAttribute("src", /s5-abu-mascot/);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("ja");
  await expect(page).toHaveURL(/\/jp\/$/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "攻撃側のジニ", exact: true })).toHaveValue("ディーモ");
  await expect(page.locator(".result-column").getByRole("status")).toHaveText("23");
  await expect(page.locator("html")).toHaveAttribute("data-season", "s5");
  await expect(page.locator("body")).not.toContainText(/CBT|Translation unavailable|翻訳未対応|CN reference|Unverified/);
  const data = await page.request.get("/global-assets/data/global-runtime.json");
  expect((await data.json()).meta.id).toBe("global-s3-midseason-2026-08-13");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "攻撃側のジニ", exact: true })).toHaveValue("ディーモ");
  await expect(page.locator(".result-column").getByRole("status")).toHaveText("23");
  await expect(page.locator("html")).toHaveAttribute("data-season", "s5");
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLabels = () => page.locator(".four-skill-side--attacker").evaluate(side =>
    ["cost", "power-input", "hits"].map(name => getComputedStyle(side.querySelector(`.skill-slot:not(.skill-slot--head) .skill-slot__${name}`), "::before").content));
  await expect.poll(mobileLabels).toEqual(['"コスト"', '"威力"', '"連撃数"']);
  await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
  await page.getByRole("combobox", { name: "言語", exact: true }).selectOption("en");
  await expect.poll(mobileLabels).toEqual(['"Cost"', '"Power"', '"Combo"']);
  await expect(page.getByRole("combobox", { name: "Attacker Jini", exact: true })).toHaveValue("Dimo");
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const commonClass = page.locator(".four-skill-side--attacker .skill-slot__kind > span").filter({ hasText: /^Common$/ });
    expect(await commonClass.evaluate(element => element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true);
  }
});

test("SEO CN recognizes a released Global share and opens the matching /en/ workspace", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rock-calculator.first-run-guide.v1", "1"));
  await page.goto("/en/");
  await page.getByRole("combobox", { name: "Attacker Jini", exact: true }).fill("Dimo");
  await page.getByRole("option", { name: "Dimo 001 · Stage 1", exact: true }).click();
  await page.getByRole("combobox", { name: "Defender Jini", exact: true }).fill("Meodow");
  await page.getByRole("option", { name: "Meodow 004 · Stage 3", exact: true }).click();
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: "Share current setup", exact: true }).click();
  const linkField = page.getByRole("textbox", { name: "Current setup link", exact: true });
  await expect(linkField).toHaveValue(/#v2\.global\.en\./);
  const shareHash = new URL(await linkField.inputValue()).hash;
  const envelope = JSON.parse(Buffer.from(shareHash.split(".")[3], "base64url").toString("utf8"));
  expect(envelope.kind).toBe("configuration");
  expect(envelope.dataVersion).toBe("global-s3-midseason-2026-08-13");
  expect(envelope.rulesVersion).toBe("global-s3-midseason-2026-08-13");

  await page.goto("/cn/");
  await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).fill("音速犬");
  await page.getByRole("option", { name: /^音速犬/ }).click();
  await page.getByRole("combobox", { name: "防御方精灵", exact: true }).fill("水灵");
  await page.getByRole("option", { name: /^水灵/ }).click();
  const readCnStorage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("rock-calculator.servers.cn."))));
  await expect.poll(async () => Object.keys(await readCnStorage()).length).toBeGreaterThan(0);
  const savedCn = await readCnStorage();

  await page.goto(`/cn/${shareHash}`);
  const notice = page.getByRole("alert");
  await expect(notice).toContainText("这份分享配置属于国际服");
  await expect(notice).not.toContainText("尚未核验");
  expect(new URL(page.url()).pathname).toBe("/cn/");
  expect(await readCnStorage()).toEqual(savedCn);
  await notice.getByRole("button", { name: "在国际服打开", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(?:#.*)?$/);
  await expect(page.getByRole("combobox", { name: "Attacker Jini", exact: true })).toHaveValue("Dimo");
  await expect(page.getByRole("combobox", { name: "Defender Jini", exact: true })).toHaveValue("Meodow");
  await expect(page.locator("html")).toHaveAttribute("data-server", "global");
  expect(await readCnStorage()).toEqual(savedCn);
  await page.goto("/cn/");
  await expect(page.getByRole("combobox", { name: "攻击方精灵", exact: true })).toHaveValue("音速犬");
  await expect(page.getByRole("combobox", { name: "防御方精灵", exact: true })).toHaveValue("水灵");
});
