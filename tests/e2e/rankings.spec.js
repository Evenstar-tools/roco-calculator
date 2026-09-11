import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

for (const width of [320, 390, 927, 1440]) {
  test(`独立榜单倍率、固定表头和返回 ${width}`, async ({ page }) => {
    await page.setViewportSize({width, height: 900});
    await resetUiuxStorage(page);
    await page.goto("/");
    await page.getByRole("button",{name:"打开菜单",exact:true}).click();
    await page.getByRole("button",{name:"耐久排行",exact:true}).click();
    const dialog = page.getByRole("dialog",{name:"耐久排行",exact:true});
    await dialog.getByLabel("承受属性",{exact:true}).selectOption("火");
    await dialog.getByLabel("全选",{exact:true}).uncheck();
    await expect(dialog.getByText("尚未勾选倍率")).toBeVisible();
    await dialog.getByLabel("×0.25",{exact:true}).check();
    await dialog.getByLabel("×0.5",{exact:true}).check();
    await expect(dialog.getByRole("status")).toContainText("88只");
    const table = dialog.getByRole("table");
    const scroll = dialog.locator(".rank-table-scroll:visible");
    await scroll.evaluate((node) => {node.scrollTop = 1500;});
    await expect(table.locator("thead th").first()).toBeInViewport();
    const dimensions = await scroll.evaluate((node) => ({height:node.clientHeight,overflow:node.scrollWidth-node.clientWidth}));
    expect(dimensions.height).toBeGreaterThan(420);
    expect(dimensions.overflow).toBeLessThanOrEqual(1);
    const button = table.locator("tbody button").nth(23);
    await button.click();
    await expect(dialog.getByRole("region",{name:"榜单配置详情"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
    await dialog.getByRole("button",{name:"关闭排行榜"}).click();
    await expect(page.getByRole("combobox",{name:"攻击方精灵"})).toHaveValue("");
    await page.getByRole("button",{name:"打开菜单",exact:true}).click();
    await page.getByRole("button",{name:"速度线排行",exact:true}).click();
    const speed = page.getByRole("dialog",{name:"速度线排行",exact:true});
    await expect(speed.getByRole("table",{name:"速度档位表"})).toBeVisible();
    await expect(speed.getByText(/当前速度/)).toHaveCount(0);
    await speed.getByRole("button",{name:"关闭排行榜"}).click();
    await page.getByRole("button",{name:"打开菜单",exact:true}).click();
    await page.getByRole("button",{name:"耐久排行",exact:true}).click();
    await expect(dialog.getByRole("status")).toContainText("88只");
  });
}
