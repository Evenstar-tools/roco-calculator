import { test, expect } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

test.use({ serviceWorkers: "block" });
async function capture(page, name) {
  await page.locator(".skill-query img").evaluateAll(async images => {
    await Promise.all(images.filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight;
    }).map(image => image.decode().catch(() => {})));
  });
  await page.screenshot({ path: `artifacts/skill-query-cards-final/${name}.png` });
}
async function open(page, width, theme) {
  await resetUiuxStorage(page);
  await page.addInitScript(value => localStorage.setItem("rock-calculator.settings.theme.v1", value), theme);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "技能检索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "技能查询" });
  await expect(panel.getByLabel("搜索技能或精灵")).toBeVisible();
  return panel;
}

for (const width of [1440, 390, 320]) for (const theme of ["light", "dark"]) {
  test(`卡片选择、效果开关、右栏与移动导航 ${width} ${theme}`, async ({ page }) => {
    const panel = await open(page, width, theme);
    const search = panel.getByLabel("搜索技能或精灵");
    await search.fill("血契");
    await panel.getByRole("button", { name: "添加血契", exact: true }).click();
    await expect(search).toHaveValue("血契");
    await expect(panel.getByRole("button", { name: "取消血契", exact: true })).toHaveAttribute("aria-pressed", "true");
    await search.fill("");
    const columns = await panel.locator(".sq-suggestions").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width > 900 ? 3 : 1);
    await capture(page, `library-${width}-${theme}`);
    if (width > 900) expect(Math.round((await panel.locator(".sq-selection").boundingBox()).width)).toBe(320);
    await panel.getByRole("button", { name: "隐藏效果说明" }).click();
    await expect(panel.locator(".sq-card-description")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "取消血契", exact: true })).toContainText("能耗");
    await capture(page, `compact-${width}-${theme}`);
    if (width <= 900) await panel.getByRole("navigation", { name: "查询快捷导航" }).getByRole("button", { name: /匹配家族/ }).click();
    await expect(panel.locator(".sq-family-main").first()).toBeVisible();
    await panel.locator(".sq-family-main").first().click();
    await expect(panel.getByRole("button", { name: "显示效果说明" })).toBeVisible();
    await panel.getByRole("button", { name: "显示效果说明" }).click();
    expect(await panel.locator(".sq-skill-row").count()).toBeGreaterThan(4);
    await capture(page, `spirit-${width}-${theme}`);
    expect(await panel.locator(".sq-results").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await panel.getByRole("tab", { name: "赛季新技能" }).click();
    await expect(panel.locator(".skill-query__cards .skill-icon").first()).toBeVisible();
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await capture(page, `season-${width}-${theme}`);
  });
}

test("桌面低高度选满仍可访问结果，效果切换和双向返回恢复技能库位置", async ({ page }) => {
  const panel = await open(page, 1440, "light");
  for (const name of ["防御", "力量增效", "撞击", "抓挠"]) {
    await panel.getByLabel("搜索技能或精灵").fill(name);
    const card = panel.getByRole("button", { name: `添加${name}`, exact: true });
    if (await card.count()) await card.click();
  }
  // 使用真实资料中存在的技能补满，不依赖某个技能名是否属于本赛季。
  await panel.getByLabel("搜索技能或精灵").fill("");
  while (await panel.locator(".sq-selected>div").count() < 4) await panel.locator('.sq-suggestions>button[aria-pressed="false"]').first().click();
  await page.setViewportSize({ width: 1440, height: 650 });
  await expect(panel).toContainText("已选满 4 个技能");
  expect((await panel.locator(".sq-results").boundingBox()).height).toBeGreaterThan(90);
  await panel.locator(".sq-family-main").first().scrollIntoViewIfNeeded();
  await capture(page, "four-selected-650");
  await panel.getByRole("button", { name: "清空", exact: true }).click();
  const library = panel.locator(".sq-library");
  await library.evaluate(node => { node.scrollTop = 500; });
  const anchor = await library.locator("[data-skill-id]").evaluateAll(nodes => nodes.find(node => node.getBoundingClientRect().bottom > node.parentElement.parentElement.getBoundingClientRect().top).dataset.skillId);
  const target = library.locator(`[data-skill-id="${anchor}"]`);
  const before = (await target.boundingBox()).y;
  await panel.getByRole("button", { name: "隐藏效果说明" }).click();
  expect(Math.abs((await target.boundingBox()).y - before)).toBeLessThan(2);
  await target.click();
  const scroll = await library.evaluate(node => node.scrollTop);
  await panel.locator(".sq-family-main").first().click();
  await panel.getByRole("button", { name: "返回匹配结果" }).click();
  expect(await library.evaluate(node => node.scrollTop)).toBeCloseTo(scroll, 0);
});

for (const width of [320, 390]) for (const theme of ["light", "dark"]) {
  test(`手机操作区密度门禁 0/1/4 个已选 ${width} ${theme}`, async ({ page }) => {
    const panel = await open(page, width, theme);
    const search = panel.getByLabel("搜索技能或精灵");
    for (const count of [0, 1, 4]) {
      if (count === 1) {
        await search.fill("血契");
        await panel.getByRole("button", { name: "添加血契", exact: true }).click();
      }
      if (count === 4) for (const name of ["防御", "重组", "月蚀"]) {
        await search.fill(name);
        await panel.getByRole("button", { name: `添加${name}`, exact: true }).click();
      }
      await search.fill("");
      for (const height of [700, 650]) {
        await page.setViewportSize({ width, height });
        await panel.locator(".sq-workspace").evaluate(node => { node.scrollTop = 0; });
        await panel.getByRole("heading", { name: "技能检索", exact: true }).click();
        const card = await panel.locator(".sq-suggestions>button").first().boundingBox();
        const bottom = count ? (await panel.locator(".sq-mobile-nav").boundingBox()).y : height;
        expect(card.y).toBeLessThanOrEqual(count === 4 ? 430 : 350);
        expect(card.y + card.height).toBeLessThanOrEqual(bottom);
        expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(panel.locator(".sq-search .sq-effect-toggle")).toBeVisible();
        await expect(panel.locator(".sq-library-heading")).toBeHidden();
        await expect(panel.getByRole("button", { name: /查看匹配家族/ })).toHaveCount(0);
        await panel.locator("img").evaluateAll(async images => Promise.all(images.filter(img => { const rect = img.getBoundingClientRect(); return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight; }).map(img => img.decode().catch(() => {}))));
        await page.screenshot({ path: `artifacts/web-ux6-mobile-density/actual-${width}-${height}-${count}-${theme}.png` });
      }
    }
    await panel.getByRole("button", { name: "移除月蚀" }).click();
    await search.fill("观测者效应");
    await panel.getByRole("button", { name: "添加观测者效应", exact: true }).click();
    const remove = panel.getByRole("button", { name: "移除观测者效应", exact: true });
    const bounds = await remove.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await remove.click();
    await expect(search).toHaveValue("观测者效应");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panel.locator(".sq-library-heading .sq-effect-toggle")).toBeVisible();
    await expect(panel.locator(".sq-search .sq-effect-toggle")).toHaveCount(0);
  });
}
