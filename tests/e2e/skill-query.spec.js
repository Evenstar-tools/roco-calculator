import { test, expect } from "@playwright/test";
import { resetUiuxStorage, selectDefaultSpirits } from "./helpers/uiux-helpers.js";

test.use({ serviceWorkers: "block" });
async function openPanel(page) {
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "技能检索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "技能查询" });
  await expect(panel.getByLabel("搜索技能或精灵")).toBeVisible();
  return panel;
}
for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
  test(`双向查询与完整学习面 ${width}px ${theme}`, async ({ page }) => {
    await resetUiuxStorage(page);
    await page.addInitScript((theme) => localStorage.setItem("rock-calculator.settings.theme.v1", theme), theme);
    await page.setViewportSize({ width, height: width === 1440 ? 1024 : 844 });
    await page.goto("/");
    await selectDefaultSpirits(page);
    const panel = await openPanel(page);
    for (const name of ["掠影", "月蚀"]) {
      await panel.getByLabel("搜索技能或精灵").fill(name);
      await panel.getByRole("button", { name: `添加${name}`, exact: true }).click();
    }
    await expect(panel.locator(".sq-families article")).toHaveCount(1);
    await expect(panel.locator(".sq-family-main")).toContainText("银月狼王");
    await panel.locator(".sq-family-main").click();
    await expect(panel.getByRole("heading", { name: "银月狼王" })).toBeVisible();
    expect(await panel.locator(".sq-skill-row").count()).toBeGreaterThan(2);
    await panel.getByRole("button", { name: "查看重组详情" }).click();
    await expect(panel.locator(".sq-skill-expanded")).toContainText("300%");
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await panel.locator(".sq-results").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await panel.locator(".sq-spirit-heading img").first().evaluate(async (img) => { await img.decode(); });
    await page.screenshot({ path: `artifacts/skill-query-v2-final/effect-${width}-${theme}.png` });
    await panel.locator(".sq-results").evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: `artifacts/skill-query-v2-final/actual-${width}-${theme}.png` });
    await panel.getByRole("button", { name: "查重组的可学精灵", exact: true }).click();
    await panel.getByRole("button", { name: "返回银月狼王技能" }).click();
    await expect(panel.getByRole("button", { name: "查看重组详情" })).toHaveAttribute("aria-expanded", "true");
    await panel.getByRole("button", { name: "返回匹配结果" }).click();
    await expect(panel.locator(".sq-families article")).toHaveCount(1);
    await expect(panel.locator(".sq-selected-heading")).toContainText("2 / 4");
    await panel.getByRole("button", { name: "查精灵技能" }).click();
    await panel.getByLabel("搜索技能或精灵").fill("火狗");
    await expect(panel.locator(".sq-family-main")).toContainText("音速犬");
    await panel.locator(".sq-family-main").click();
    await expect(panel.getByRole("heading", { name: "音速犬" })).toBeVisible();
    await panel.getByRole("button", { name: "技能石", exact: true }).click();
    await expect(panel.getByRole("button", { name: "技能石", exact: true })).toHaveAttribute("aria-pressed", "true");
    await panel.getByRole("button", { name: "全部来源", exact: true }).click();
    await panel.getByRole("tab", { name: "赛季新技能" }).click();
    await expect(panel.locator(".skill-query__list")).toContainText("重组");
    await panel.getByLabel("查询赛季").selectOption("S3");
    await expect(panel.locator(".skill-query__list > p").first()).toHaveText("57 个技能");
    await panel.getByLabel("查询赛季").selectOption("S4");
    await panel.getByRole("tab", { name: "赛季学习更新" }).click();
    await panel.getByLabel("搜索技能或精灵").fill("果");
    const gainedSkills = panel.locator(".skill-query__gains article > div > button");
    expect(await gainedSkills.count()).toBeGreaterThan(0);
    await expect(gainedSkills.locator("img.skill-icon")).toHaveCount(await gainedSkills.count());
    await gainedSkills.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
    expect(await panel.locator(".skill-query__gains").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/skill-query-v2-final/gains-icons-${width}-${theme}.png` });
    await panel.getByRole("button", { name: "麦芒 草 · 物攻", exact: true }).click();
    await expect(panel.locator(".sq-selected")).toContainText("麦芒");
    await panel.getByRole("button", { name: "返回赛季查询" }).click();
    await panel.getByLabel("搜索技能或精灵").fill("针叶巡林");
    await expect(panel.locator(".skill-query__gains")).toContainText("回旋踢");
    await panel.locator(".skill-query__gains h3 button").first().click();
    await expect(panel.locator(".sq-spirit-heading")).toContainText("针叶巡林");
    await expect(panel.locator(".sq-skill-table")).toContainText("回旋踢");
    await panel.getByRole("button", { name: "关闭技能查询" }).click();
    await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue("音速犬");
    await expect(page.getByRole("combobox", { name: "防御方精灵" })).toHaveValue("水灵");
  });
}
test("条件筛选、跨断点、四技能上限与清空", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = await openPanel(page);
  await expect(panel.getByLabel("技能所属赛季")).toBeVisible();
  await panel.getByLabel("技能所属赛季").selectOption("S2");
  await expect(panel.getByLabel("技能列表")).toContainText("疾风涡轮");
  await expect(panel.getByLabel("技能列表")).not.toContainText("抓挠");
  await panel.getByLabel("技能所属赛季").selectOption("");
  await panel.getByLabel("搜索技能或精灵").fill("抓挠");
  await panel.getByLabel("技能属性", { exact: true }).selectOption("普通");
  await panel.getByLabel("技能种类", { exact: true }).selectOption("physical");
  await panel.getByLabel("技能所属赛季").selectOption("S1");
  await panel.getByRole("button", { name: "添加抓挠" }).click();
  await panel.getByLabel("筛选学习精灵").fill("喵喵");
  await expect(panel.locator(".sq-families article")).toHaveCount(1);
  await panel.locator(".sq-family-main").click();
  for (const width of [650, 651, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(panel.locator(".sq-spirit-heading")).toBeVisible();
    expect(await panel.locator(".sq-results").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await panel.getByRole("button", { name: "返回匹配结果" }).click();
  await expect(panel.getByLabel("筛选学习精灵")).toHaveValue("喵喵");
  await expect(panel.getByLabel("技能所属赛季")).toHaveValue("S1");
  await panel.getByLabel("技能属性", { exact: true }).selectOption("");
  await panel.getByLabel("技能种类", { exact: true }).selectOption("");
  await panel.getByLabel("技能所属赛季").selectOption("");
  for (const name of ["月蚀", "重组", "掠影"]) {
    await panel.getByLabel("搜索技能或精灵").fill(name);
    await panel.getByRole("button", { name: `添加${name}`, exact: true }).click();
  }
  await expect(panel).toContainText("已选满 4 个技能");
  await panel.getByRole("button", { name: "清空", exact: true }).click();
  await expect(panel.locator(".sq-selected-heading")).toContainText("0 / 4");
  await expect(panel.locator(".sq-families article")).toHaveCount(0);
});
test("failed catalog can retry and Escape restores menu focus", async ({ page }) => {
  await resetUiuxStorage(page);
  let fail = true;
  await page.route("**/data/skill-query/catalog.json", (route) => fail ? route.abort() : route.continue());
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "技能检索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "技能查询" });
  await expect(panel.getByRole("alert")).toContainText("暂时无法加载");
  fail = false;
  await panel.getByRole("button", { name: "重试" }).click();
  await panel.getByLabel("搜索技能或精灵").fill("不存在的技能xyz");
  await expect(panel).toContainText("没有找到符合条件的技能");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开菜单" })).toBeFocused();
});
test("menu order, prefetch and repeat opens reuse one catalog request", async ({ page }) => {
  await resetUiuxStorage(page);
  let requests = 0;
  await page.route("**/data/skill-query/catalog.json", async (route) => { requests += 1; await route.continue(); });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  const menu = page.getByRole("navigation", { name: "应用菜单" });
  const names = await menu.getByRole("button").allTextContents();
  expect(names.slice(0, 4).map(name => name.replace(/\s+/g, "").replace(/226$/, ""))).toEqual(["清除当前页配置", "常用精灵配置", "导入导出", "技能检索"]);
  await expect.poll(() => requests).toBe(1);
  await menu.getByRole("button", { name: "导入导出", exact: true }).click();
  const transfer = page.getByRole("dialog", { name: "配置库导入导出" });
  await transfer.getByRole("button", { name: "导入", exact: true }).click();
  await expect(page.getByLabel("选择配置库文件")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  for (let i = 0; i < 2; i += 1) {
    const panel = await openPanel(page);
    await panel.getByRole("button", { name: "关闭技能查询" }).click();
  }
  expect(requests).toBe(1);
});
