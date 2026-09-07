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
    await page.getByRole("button", { name: "技能查询", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "技能查询" });
    await expect(panel).toBeVisible();
    await panel.getByLabel("搜索技能或精灵").fill("抓挠");
    await panel.getByRole("button", { name: "抓挠 普通 · 物攻" }).click();
    await expect(panel.getByRole("heading", { name: "抓挠", exact: true })).toBeVisible();
    await expect(panel.locator("dd").first()).toHaveText("0");
    await panel.getByLabel("筛选学习精灵").fill("喵喵");
    await expect(panel.locator(".skill-query__families details")).toHaveCount(1);
    await panel.locator(".skill-query__families summary").click();
    await expect(panel.locator(".skill-query__family-methods")).toContainText("喵喵");
    await panel.locator(".skill-query__families summary").click();
    await panel.getByLabel("筛选学习精灵").fill("");
    await expect(panel.locator(".skill-query__families details")).toHaveCount(13);
    await expect(panel.locator(".skill-query__families summary img").first()).toBeVisible();
    expect(await panel.locator(".skill-query__families summary img").first().evaluate(async image => { await image.decode(); return image.naturalWidth > 0; })).toBe(true);
    await panel.getByLabel("搜索技能或精灵").fill("");
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/skill-query-${width}.png` });
    if (width < 650) await panel.getByRole("button", { name: "返回技能列表" }).click();
    await panel.getByLabel("搜索技能或精灵").fill("");
    await panel.getByRole("tab", { name: "赛季新技能" }).click();
    await expect(panel.locator(".skill-query__list")).toContainText("重组");
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

test("failed catalog can retry and Escape restores menu focus", async ({ page }) => {
  await resetUiuxStorage(page);
  let fail = true;
  await page.route("**/data/skill-query/catalog.json", (route) => fail ? route.abort() : route.continue());
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "技能查询", exact: true }).click();
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
