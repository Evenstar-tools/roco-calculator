import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

for (const width of [320, 1440]) test(`五项功能直达与速度基准 ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await resetUiuxStorage(page); await page.goto("/");
  const menu = page.getByRole("navigation", { name: "应用菜单" });
  await expect(async () => {
    if (!await menu.isVisible()) await page.getByRole("button", { name: "打开菜单", exact: true }).click();
    await expect(menu).toBeVisible();
  }).toPass();
  await menu.getByRole("button", { name: /^新功能 / }).click();
  const intro = page.getByRole("dialog", { name: "新功能介绍" });
  await expect(intro.getByRole("listitem")).toHaveCount(5);
  await intro.getByRole("button", { name: "打开速度线排行" }).click();
  const ranking = page.getByRole("dialog", { name: "速度线排行", exact: true });
  await ranking.getByRole("button", { name: "试查 267" }).click();
  await ranking.getByRole("button", { name: "隐藏精灵文字" }).click();
  const table = ranking.getByRole("table", { name: "速度档位表" });
  const current = table.locator("tbody tr.is-selected");
  await expect(current.locator("button").first()).toBeInViewport();
  await expect(table.locator("thead")).toBeInViewport();
  await ranking.getByLabel("搜索速度榜精灵").fill("268");
  await expect(ranking.getByText("基准位置 · 没有同速配置")).toBeVisible();
  await ranking.getByRole("button", { name: "种族速度", exact: true }).click();
  await ranking.getByLabel("搜索速度榜精灵").fill("125");
  await expect(ranking.getByRole("status")).toContainText("种族速度 125");
  await table.locator("tbody button").first().click();
  await expect(ranking.getByRole("region", { name: "榜单配置详情" })).toBeVisible();
});
