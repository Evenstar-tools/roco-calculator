import { test, expect } from "@playwright/test";
import { resetUiuxStorage, selectDefaultSpirits } from "./helpers/uiux-helpers.js";

test.use({ serviceWorkers: "block" });

for (const width of [320, 390, 1440]) {
  test(`skill lookup and seasonal learning at ${width}px`, async ({ page }) => {
    await resetUiuxStorage(page);
    if (width === 320) await page.addInitScript(() => localStorage.setItem("rock-calculator.settings.theme.v1", "dark"));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await selectDefaultSpirits(page);
    await page.getByRole("button", { name: "打开菜单" }).click();
    await page.getByRole("button", { name: "技能检索", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "技能查询" });
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("查技能，也查谁能学");
    await expect(panel).not.toContainText("每个家族仅展示一只");
    await expect(panel).not.toContainText("学习面基线");
    await panel.getByLabel("技能所属赛季").selectOption("S2");
    await expect(panel.locator(".skill-query__list")).toContainText("疾风涡轮");
    await expect(panel.locator(".skill-query__list")).not.toContainText("抓挠");
    await panel.getByLabel("技能所属赛季").selectOption("");
    await panel.getByLabel("搜索技能或精灵").fill("抓挠");
    await panel.getByRole("button", { name: "抓挠 普通 · 物攻" }).click();
    await expect(panel.getByRole("heading", { name: "抓挠", exact: true })).toBeVisible();
    await expect(panel.locator("dd").first()).toHaveText("0");
    await panel.getByLabel("筛选学习精灵").fill("喵喵");
    await expect(panel.locator(".skill-query__families details")).toHaveCount(1);
    await expect(panel.locator(".skill-query__families summary")).toContainText("喵喵");
    await panel.locator(".skill-query__families summary").click();
    await expect(panel.locator(".skill-query__family-methods")).toContainText("喵喵");
    await panel.locator(".skill-query__families summary").click();
    await panel.getByLabel("筛选学习精灵").fill("");
    await expect(panel.locator(".skill-query__families details")).toHaveCount(12);
    await expect(panel.locator(".skill-query__families summary img").first()).toBeVisible();
    expect(await panel.locator(".skill-query__families summary img").first().evaluate(async image => { await image.decode(); return image.naturalWidth > 0; })).toBe(true);
    const portrait = await panel.locator(".skill-query__families summary img").first().boundingBox();
    expect(portrait.width).toBe(width < 650 ? 56 : 64);
    expect(portrait.height).toBe(width < 650 ? 56 : 64);
    if (width < 650) await expect(panel.getByLabel("搜索技能或精灵")).toBeHidden();
    else await expect(panel.locator(".skill-query__browser").getByLabel("搜索技能或精灵")).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/skill-query-${width}.png` });
    if (width < 650) await panel.getByRole("button", { name: "返回技能列表" }).click();
    await expect(panel.getByLabel("搜索技能或精灵")).toHaveValue("抓挠");
    await panel.getByLabel("搜索技能或精灵").fill("");
    await panel.getByRole("tab", { name: "赛季新技能" }).click();
    await expect(panel.locator(".skill-query__list")).toContainText("重组");
    await panel.getByLabel("查询赛季").selectOption("S3");
    await expect(panel.locator(".skill-query__list > p").first()).toHaveText("57 个技能");
    await panel.getByLabel("查询赛季").selectOption("S4");
    await panel.getByRole("tab", { name: "老精灵新学" }).click();
    await panel.getByLabel("搜索技能或精灵").fill("针叶巡林");
    await expect(panel.locator(".skill-query__gains")).toContainText("回旋踢");
    await panel.getByLabel("查询赛季").selectOption("S3");
    await expect(panel).toContainText("没有可比较的前一赛季资料");
    await panel.getByRole("button", { name: "关闭技能查询" }).click();
    await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue("音速犬");
    await expect(page.getByRole("combobox", { name: "防御方精灵" })).toHaveValue("水灵");
  });
}

test("技能筛选跨越手机断点仍保持条件与家族展开状态", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "技能检索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "技能查询" });
  const search = panel.getByLabel("搜索技能或精灵");
  await search.fill("抓挠");
  await panel.getByLabel("技能属性").selectOption("普通");
  await panel.getByLabel("技能种类").selectOption("physical");
  await panel.getByLabel("技能所属赛季").selectOption("S1");
  await panel.getByRole("button", { name: "抓挠 普通 · 物攻" }).click();
  await panel.getByLabel("筛选学习精灵").fill("喵喵");
  await panel.locator(".skill-query__families summary").click();
  for (const width of [650, 651, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 650) await expect(search).toBeHidden();
    else await expect(search).toBeVisible();
    await expect(panel.locator(".skill-query__families details[open]")).toHaveCount(1);
    await expect(panel.getByLabel("筛选学习精灵")).toHaveValue("喵喵");
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await panel.locator(".skill-query__detail").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await panel.getByRole("button", { name: "返回技能列表" }).click();
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("抓挠");
  await expect(panel.getByLabel("技能属性")).toHaveValue("普通");
  await expect(panel.getByLabel("技能种类")).toHaveValue("physical");
  await expect(panel.getByLabel("技能所属赛季")).toHaveValue("S1");
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
  await expect(panel.getByLabel("搜索技能或精灵")).toBeVisible();
  await panel.getByLabel("搜索技能或精灵").fill("不存在的技能xyz");
  await expect(panel).toContainText("没有找到符合条件的技能");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开菜单" })).toBeFocused();
});

test("menu order, prefetch and repeat opens reuse one catalog request", async ({ page }) => {
  await resetUiuxStorage(page);
  let requests = 0;
  await page.route("**/data/skill-query/catalog.json", async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  const menu = page.getByRole("navigation", { name: "应用菜单" });
  await expect(async () => {
    if (!await menu.isVisible()) await page.getByRole("button", { name: "打开菜单" }).click();
    await expect(menu).toBeVisible();
  }).toPass();
  const names = await menu.getByRole("button").allTextContents();
  expect(names.slice(0, 4).map(name => name.replace(/\s+/g, "").replace(/226$/, ""))).toEqual(["清除当前页配置", "常用精灵配置", "导入导出", "技能检索"]);
  await expect.poll(() => requests).toBe(1);
  await page.screenshot({ path: "output/playwright/skill-query-menu.png" });
  await menu.getByRole("button", { name: "导入导出", exact: true }).click();
  const transfer = page.getByRole("dialog", { name: "配置库导入导出" });
  await expect(transfer.getByRole("button", { name: "导入", exact: true })).toBeEnabled();
  await page.screenshot({ path: "output/playwright/config-transfer.png" });
  await transfer.getByRole("button", { name: "导入", exact: true }).click();
  await expect(page.getByLabel("选择配置库文件")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole("button", { name: "打开菜单" }).click();
    const start = Date.now();
    await page.getByRole("button", { name: "技能检索", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "技能查询" });
    await expect(panel.getByLabel("搜索技能或精灵")).toBeVisible();
    console.log(`cached skill panel open ${i + 1}: ${Date.now() - start}ms`);
    await panel.getByRole("button", { name: "关闭技能查询" }).click();
  }
  expect(requests).toBe(1);
});
