import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

async function openPopularConfigList(page, theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("rock-calculator.settings.theme.v1", selectedTheme);
  }, theme);
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "常用精灵配置" }).click();
  const dialog = page.getByRole("dialog", { name: "常用精灵配置" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "导入全部配置" })).toBeEnabled();
  await dialog.getByRole("button", { name: "查看精灵和技能" }).click();
  const search = dialog.getByRole("searchbox", { name: "搜索精灵名" });
  await expect(search).toBeFocused();
  await expect(dialog.getByText("226 / 226")).toBeVisible();
  return { dialog, search };
}

async function readListLayout(dialog, search) {
  return dialog.locator(".config-library-entry-list").evaluate((list, input) => {
    const dialogBox = list.closest("[role=dialog]").getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const firstEntry = list.querySelector(".config-library-entry")?.getBoundingClientRect();
    return {
      columnCount: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      dialogHeight: dialogBox.height,
      dialogWidth: dialogBox.width,
      firstEntryHeight: firstEntry?.height ?? 0,
      inputY: inputBox.y,
      listHeight: listBox.height,
      listScrollWidth: list.scrollWidth,
      listWidth: list.clientWidth,
    };
  }, await search.elementHandle());
}

for (const viewport of [
  { height: 900, theme: "light", width: 1440 },
  { height: 1080, theme: "dark", width: 1920 },
]) {
  test(`keeps popular search stable at ${viewport.width}px in ${viewport.theme} theme`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { dialog, search } = await openPopularConfigList(page, viewport.theme);
    const initial = await readListLayout(dialog, search);

    expect(initial.dialogWidth).toBeGreaterThanOrEqual(850);
    expect(initial.dialogWidth).toBeLessThanOrEqual(870);
    expect(initial.columnCount).toBe(2);
    expect(initial.listHeight).toBeGreaterThanOrEqual(350);
    expect(initial.listScrollWidth).toBeLessThanOrEqual(initial.listWidth);
    if (viewport.theme === "dark") {
      const successContrast = await dialog.locator(".config-library-check-ok").evaluate(
        (element) => {
          const parseRgb = (value) => {
            const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number);
            return value.startsWith("color(srgb")
              ? channels.map((channel) => channel * 255)
              : channels;
          };
          const luminance = (rgb) => rgb
            .map((channel) => channel / 255)
            .map((channel) => channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((total, channel, index) =>
              total + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const style = getComputedStyle(element);
          const foreground = luminance(parseRgb(style.color));
          const background = luminance(parseRgb(style.backgroundColor));
          return {
            backgroundColor: style.backgroundColor,
            color: style.color,
            ratio: (Math.max(foreground, background) + 0.05)
              / (Math.min(foreground, background) + 0.05),
          };
        },
      );
      expect(successContrast.color).toBe("rgb(130, 206, 173)");
      expect(successContrast.ratio).toBeGreaterThanOrEqual(4.5);
    }

    await search.fill("银月");
    await expect(dialog.getByText("银月狼王", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 / 226")).toBeVisible();
    const matched = await readListLayout(dialog, search);
    expect(Math.abs(matched.inputY - initial.inputY)).toBeLessThanOrEqual(1);
    expect(Math.abs(matched.listHeight - initial.listHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(matched.dialogHeight - initial.dialogHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(matched.firstEntryHeight - initial.firstEntryHeight)).toBeLessThanOrEqual(1);

    await search.fill("烈焰狂战士");
    await expect(dialog.getByText("烈焰狂战士", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 / 226")).toBeVisible();
    await search.fill("满月砣");
    await expect(dialog.getByText("满月砣", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 / 226")).toBeVisible();

    await dialog.getByRole("button", { name: "清除" }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(dialog.getByText("226 / 226")).toBeVisible();

    await search.fill("不存在的精灵名称");
    await expect(dialog.getByText("没有匹配的精灵", { exact: true })).toBeVisible();
    await expect(dialog.getByText("0 / 226")).toBeVisible();
    const empty = await readListLayout(dialog, search);
    expect(Math.abs(empty.inputY - initial.inputY)).toBeLessThanOrEqual(1);
    expect(Math.abs(empty.listHeight - initial.listHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(empty.dialogHeight - initial.dialogHeight)).toBeLessThanOrEqual(1);
    await expect(dialog.getByRole("button", { name: "导入全部配置" })).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

for (const viewport of [
  { height: 844, theme: "light", width: 390 },
  { height: 800, theme: "dark", width: 320 },
]) {
  test(`keeps the popular preview single-column at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { dialog, search } = await openPopularConfigList(page, viewport.theme);
    const initial = await readListLayout(dialog, search);
    expect(initial.columnCount).toBe(1);
    expect(initial.dialogWidth).toBeLessThanOrEqual(viewport.width - 40 + 1);
    expect(initial.dialogHeight).toBeLessThanOrEqual(viewport.height - 40 + 1);
    expect(initial.listScrollWidth).toBeLessThanOrEqual(initial.listWidth);

    await search.fill("银月");
    await expect(dialog.getByText("银月狼王", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 / 226")).toBeVisible();
    const matched = await readListLayout(dialog, search);
    expect(Math.abs(matched.inputY - initial.inputY)).toBeLessThanOrEqual(1);
    expect(Math.abs(matched.listHeight - initial.listHeight)).toBeLessThanOrEqual(1);

    await dialog.getByRole("button", { name: "清除" }).click();
    await expect(search).toBeFocused();
    await expect(dialog.getByText("226 / 226")).toBeVisible();
    await search.fill("无匹配");
    await expect(dialog.getByText("没有匹配的精灵", { exact: true })).toBeVisible();
    const empty = await readListLayout(dialog, search);
    expect(Math.abs(empty.inputY - initial.inputY)).toBeLessThanOrEqual(1);
    expect(Math.abs(empty.listHeight - initial.listHeight)).toBeLessThanOrEqual(1);
  });
}
