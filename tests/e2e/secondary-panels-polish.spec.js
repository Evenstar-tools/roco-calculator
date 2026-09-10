import { test, expect } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/qiandao-lineup.json", import.meta.url), "utf8"));

test.use({ serviceWorkers: "block" });
async function menu(page, name) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor();
  return dialog;
}
async function capture(page, dialog, name) {
  await dialog.locator("img").evaluateAll(async images => Promise.all(images.filter(image => {
    const rect = image.getBoundingClientRect();
    return rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
  }).map(image => image.decode().catch(() => {}))));
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/web-ux7-secondary/actual-${name}.png`, animations: "disabled" });
}

for (const width of [1440, 390, 320]) for (const theme of ["light", "dark"]) {
  test(`二级面板六项微调 ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(60_000);
    await resetUiuxStorage(page);
    await page.addInitScript(value => localStorage.setItem("rock-calculator.settings.theme.v1", value), theme);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "打开队伍", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "队伍", exact: true });
    await expect(dialog.getByRole("button", { name: "复制队伍", exact: true })).toBeHidden();
    await capture(page, dialog, `w1-${width}-${theme}`);
    await dialog.getByRole("button", { name: "导入已有阵容", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "阵容码或分享链接" })).toBeVisible();
    await dialog.getByRole("button", { name: "返回队伍", exact: true }).click();
    await dialog.getByRole("button", { name: "新建六人队伍", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "复制队伍", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "打开队伍", exact: true })).toBeFocused();

    dialog = await menu(page, "技能检索");
    await dialog.getByRole("button", { name: "添加抓挠", exact: true }).waitFor();
    await capture(page, dialog, `w2-${width}-${theme}`);
    for (const tab of ["赛季新技能", "赛季学习更新"]) {
      await dialog.getByRole("tab", { name: tab, exact: true }).click();
      await capture(page, dialog, `${tab}-${width}-${theme}`);
    }

    dialog = await menu(page, "显示设置");
    for (const label of ["属性克制与打击面", "显示面板耐久", "负面状态结算"]) {
      const checkbox = dialog.getByRole("checkbox", { name: label, exact: true });
      const control = await checkbox.boundingBox();
      const text = await checkbox.locator("..").locator("span").first().boundingBox();
      expect(control.x).toBeGreaterThanOrEqual(text.x + text.width);
      expect(control.y + control.height / 2).toBeGreaterThanOrEqual(text.y);
      expect(control.y + control.height / 2).toBeLessThanOrEqual(text.y + text.height);
    }
    await capture(page, dialog, `w3-${width}-${theme}`);
    await dialog.getByRole("checkbox", { name: "显示面板耐久", exact: true }).check();
    await dialog.getByRole("button", { name: "完成", exact: true }).click();
    dialog = await menu(page, "显示设置");
    await expect(dialog.getByRole("checkbox", { name: "显示面板耐久", exact: true })).toBeChecked();

    dialog = await menu(page, "常用精灵配置");
    await dialog.getByRole("button", { name: "查看精灵和技能", exact: true }).waitFor();
    await expect(dialog.getByRole("button", { name: "导入全部配置", exact: true })).toHaveClass(/secondary-panel-primary/);
    await capture(page, dialog, `w4-${width}-${theme}`);
    dialog = await menu(page, "导入导出");
    await expect(dialog.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
    await capture(page, dialog, `config-transfer-${width}-${theme}`);

    dialog = await menu(page, "关于与来源");
    await capture(page, dialog, `w5-${width}-${theme}`);
    for (const name of ["查看完整版本记录", "查看鸣谢", "查看免责声明", "查看问题反馈"]) {
      await dialog.getByRole("button", { name, exact: true }).click();
      await capture(page, page.getByRole("dialog").last(), `${name}-${width}-${theme}`);
      await page.getByRole("button", { name: "返回关于与来源", exact: true }).click();
    }
    dialog = await menu(page, "新功能 v2.0.0");
    await capture(page, dialog, `updates-${width}-${theme}`);

    dialog = await menu(page, "获取应用");
    const first = dialog.getByRole("link").first();
    await expect(first).toHaveAccessibleName("获取 Windows 电脑版");
    await expect(first).toHaveAttribute("href", "https://github.com/Evenstar-tools/roco-calculator/releases/latest");
    await capture(page, dialog, `w6-${width}-${theme}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}

test("空态导入真实阵容后编辑、分析、对位与导出仍然可用", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开队伍", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "队伍", exact: true });
  await dialog.getByRole("button", { name: "导入已有阵容", exact: true }).click();
  await dialog.getByRole("textbox", { name: "阵容码或分享链接" }).fill(fixture.code);
  await dialog.getByRole("button", { name: "解析阵容", exact: true }).click();
  await expect(dialog.getByText("已解析 6 位精灵 · 24 个技能")).toBeVisible();
  await capture(page, dialog, "team-import-preview-390-light");
  await dialog.locator(".team-exchange__check input").check();
  await dialog.getByRole("button", { name: "保存并调整个体", exact: true }).click();
  await expect(dialog).toHaveAttribute("data-empty", "false");
  await capture(page, dialog, "team-members-390-light");
  for (const name of ["队伍分析", "对位"]) {
    await dialog.getByRole("button", { name, exact: true }).click();
    await capture(page, dialog, `${name}-390-light`);
  }
  await dialog.getByRole("button", { name: "导出阵容", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "复制阵容码", exact: true })).toBeVisible();
  await capture(page, dialog, "team-export-390-light");
});
