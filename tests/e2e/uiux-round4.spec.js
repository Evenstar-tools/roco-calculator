import { expect, test } from "@playwright/test";
import { resetUiuxStorage, selectSpirit } from "./helpers/uiux-helpers.js";

async function openAbility(page) {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "绒仙子");
  await selectSpirit(page, "防御方", "银月狼王");
  await page.getByRole("button", { name: "具体版", exact: true }).click();
  await page.getByRole("button", { name: "打开队伍" }).click();
  await page.getByRole("button", { name: "新建六人队伍" }).click();
  await page.getByRole("button", { name: "用当前攻击方填入1号位" }).click();
  await page.getByRole("button", { name: "能力分析", exact: true }).click();
}

for (const width of [320, 390, 1440]) {
  test(`速度档位随当前分组保持可见 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAbility(page);
    for (const stat of ["魔攻", "物防", "魔防"]) {
      await page.getByRole("button", { name: `取消${stat}个体值，当前60`, exact: true }).click();
    }
    await page.getByRole("button", { name: /速度一览/ }).click();
    const overview = page.getByRole("region", { name: "速度一览", exact: true });
    const rows = overview.locator("tbody tr");
    const sizes = await rows.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    const row = rows.nth(sizes.indexOf(Math.max(...sizes)));
    await row.locator("button").last().scrollIntoViewIfNeeded();
    const label = row.locator(".ability-speed-overview__tier-value");
    await expect(label).toBeInViewport();
    const metrics = await label.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      groupBottom: node.closest("tr").getBoundingClientRect().bottom,
      headerBottom: node.closest("table").querySelector("thead").getBoundingClientRect().bottom,
      position: getComputedStyle(node).position,
    }));
    expect(metrics.position).toBe("sticky");
    expect(metrics.top).toBeGreaterThanOrEqual(metrics.headerBottom);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.groupBottom);
    await row.locator("button").last().click();
    await expect(row.locator("button").last()).toHaveAttribute("aria-pressed", "true");
  });

  test(`队伍矩阵按容器提供可读点击区域 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAbility(page);
    await page.getByRole("button", { name: "队伍分析", exact: true }).click();
    const scroll = page.getByRole("region", { name: "队伍属性矩阵横向滚动" });
    const matrix = scroll.getByRole("table");
    const firstMember = matrix.locator("tbody th").first();
    const before = await firstMember.boundingBox();
    const cell = matrix.locator("tbody button").first();
    const size = await cell.boundingBox();
    if (width < 560) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByText("左右滑动查看全部属性")).toBeVisible();
      await scroll.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      expect(Math.abs((await firstMember.boundingBox()).x - before.x)).toBeLessThan(2);
      await matrix.locator("tbody tr").first().locator("button").last().click();
    } else {
      expect(size.width).toBeLessThanOrEqual(32);
      await expect(page.getByText("左右滑动查看全部属性")).toBeHidden();
      expect(await scroll.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await cell.click();
    }
    await expect(page.getByLabel("单元格详情")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
