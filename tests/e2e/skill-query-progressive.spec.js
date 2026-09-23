import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

test.use({ serviceWorkers: "block" });

for (const width of [1440, 390]) {
  test(`技能库滚动续载可达末尾，筛选后仍能选中技能 ${width}px`, async ({ page }) => {
    await resetUiuxStorage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
    const menu = page.getByRole("navigation", { name: "工具箱" });
    await expect(async () => {
      if (!await menu.isVisible()) await page.getByRole("button", { name: "工具箱" }).click();
      await expect(menu).toBeVisible();
    }).toPass();
    await menu.getByRole("button", { name: "技能检索", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "技能查询" });
    const cards = panel.locator(".sq-suggestions > button");
    const total = Number(await panel.locator(".sq-library-heading small").textContent());
    expect(total).toBeGreaterThan(100);
    expect(await cards.count()).toBeLessThanOrEqual(48);

    for (let index = 0; index < 30 && await cards.count() < total; index += 1) {
      const before = await cards.count();
      await panel.getByRole("button", { name: /显示更多技能/ }).scrollIntoViewIfNeeded();
      await expect.poll(() => cards.count()).toBeGreaterThan(before);
    }
    await expect(cards).toHaveCount(total);
    const lastName = await cards.last().locator(".sq-card-heading strong").textContent();
    await panel.getByLabel("搜索技能或精灵").fill(lastName);
    await expect(cards).toHaveCount(1);
    await cards.first().click();
    await expect(panel.locator(".sq-selected-heading")).toContainText("1 / 4");
    await panel.getByLabel("搜索技能或精灵").fill("");
    expect(await cards.count()).toBeLessThanOrEqual(48);
  });
}
