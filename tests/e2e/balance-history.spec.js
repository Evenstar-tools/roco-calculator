import { expect, test } from "@playwright/test";
import { resetUiuxStorage, waitForAppReady } from "./helpers/uiux-helpers.js";

test.use({ serviceWorkers: "block", viewport: { width: 1100, height: 900 } });

async function openBalanceHistory(page) {
  await resetUiuxStorage(page);
  await page.goto("/");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  await page.getByRole("navigation", { name: "工具箱", exact: true })
    .getByRole("button", { name: "平衡调整回顾", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "赛季平衡性调整回顾", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

test("balance history update overview keeps member changes separate", async ({ page }) => {
  const panel = await openBalanceHistory(page);
  await panel.getByRole("tab", { name: "按更新浏览", exact: true }).click();
  await panel.getByRole("button", { name: /2026\.05\.21.*S2/ }).click();
  const search = panel.getByRole("textbox", { name: "在本次更新中查找精灵或技能", exact: true });
  const overview = panel.locator(".bh-overview");
  await expect(search).toHaveValue("");
  await expect(overview).toBeVisible();
  await expect(panel.locator(".bh-entity, .bh-scope")).toHaveCount(0);
  const effect = overview.getByRole("region", { name: "技能本身", exact: true })
    .locator(".bh-card").filter({ has: page.getByText("啮合传递", { exact: true }) });
  await expect(effect).toHaveCount(1);
  await expect(effect.locator(".bh-before-after")).toBeVisible();
  await expect(effect).toContainText("自己获得速度+30");
  const family = effect.locator(".bh-users details").filter({ hasText: "喵喵家族" });
  await expect(family).toHaveCount(1);
  await expect(family).not.toHaveAttribute("open");
  await family.locator("summary").click();
  await expect(family).toHaveAttribute("open", "");
  for (const name of ["喵喵", "喵呜", "魔力猫", "叶冕魔力猫"]) await expect(family).toContainText(name);

  await search.fill("喵呜");
  await expect(overview).toBeVisible();
  const memberSkills = overview.getByRole("region", { name: "技能本身", exact: true });
  await expect(memberSkills.locator(".bh-card")).toHaveCount(2);
  await expect(memberSkills.locator(".bh-card > .bh-who strong")).toHaveText(["啮合传递", "甜心续航"]);
  for (const users of await memberSkills.locator(".bh-users").all()) {
    await expect(users).toContainText("1 只精灵会用");
    await expect(users.locator(".bh-who strong")).toHaveText("喵呜");
  }
  await expect(panel.getByRole("region", { name: "种族值", exact: true })).toHaveCount(0);
  await expect(panel.locator(".bh-chip").filter({ hasText: /108→131/u })).toHaveCount(0);
  await search.fill("");
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("region", { name: "种族值", exact: true })).toBeVisible();

  await search.fill("叶冕魔力猫");
  const memberStats = overview.getByRole("region", { name: "种族值", exact: true });
  await expect(memberStats.locator(".bh-stat-row")).toHaveCount(1);
  await expect(memberStats.locator(".bh-stat-row .bh-who strong")).toHaveText("叶冕魔力猫");
  await expect(memberStats.locator(".bh-chip").filter({ hasText: /^生命 108→131 /u })).toBeVisible();
  await panel.getByRole("button", { name: /2026\.09\.10.*S4/ }).click();
  await expect(search).toHaveValue("");
  await expect(overview).toBeVisible();
  await search.fill("叶冕魔力猫");
  await expect(panel.getByRole("status")).toContainText("本次更新没有符合条件的调整记录");
  await expect(overview).toHaveCount(0);
  await expect(panel.locator(".bh-card, .bh-stat-row")).toHaveCount(0);
  await search.fill("");
  await expect(overview).toBeVisible();
});

test("balance history family round trips preserve filters and skill categories", async ({ page }) => {
  const panel = await openBalanceHistory(page);
  const search = panel.getByRole("textbox", { name: "名称、别名或图鉴号", exact: true });
  await search.fill("喵呜");
  await expect(panel.locator(".bh-entity")).toHaveCount(1);
  await expect(panel.locator(".bh-summary h3")).toContainText("喵喵家族");
  await expect(panel.getByText("匹配：喵呜", { exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "筛选赛季", exact: true }).selectOption("S2");
  await panel.getByRole("group", { name: "调整类型", exact: true })
    .getByRole("button", { name: "技能本身", exact: true }).click();
  const scope = panel.getByRole("region", { name: "喵喵、喵呜、魔力猫、叶冕魔力猫的调整", exact: true });
  await expect(scope.getByText("啮合传递·技能效果", { exact: true })).toHaveCount(1);
  await expect(scope.getByText("甜心续航·技能效果", { exact: true })).toHaveCount(1);
  await panel.getByRole("button", { name: "查看本次全部调整", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "在本次更新中查找精灵或技能", exact: true })).toHaveValue("");
  await expect(panel.locator(".bh-overview")).toBeVisible();
  await expect(panel.locator(".bh-entity, .bh-scope")).toHaveCount(0);
  await panel.getByRole("button", { name: "返回按精灵回查", exact: true }).click();
  await expect(search).toHaveValue("喵呜");
  await expect(panel.getByRole("combobox", { name: "筛选赛季", exact: true })).toHaveValue("S2");
  await expect(panel.getByRole("group", { name: "调整类型", exact: true })
    .getByRole("button", { name: "技能本身", exact: true })).toHaveAttribute("aria-pressed", "true");

  await search.fill("花衣蝶");
  await panel.getByRole("combobox", { name: "筛选赛季", exact: true }).selectOption("S4");
  await panel.getByRole("group", { name: "调整类型", exact: true })
    .getByRole("button", { name: "全部", exact: true }).click();
  await expect(panel.locator(".bh-summary h3")).toContainText("小草虫家族");
  const skill = panel.getByRole("region", { name: "技能本身", exact: true });
  const powerChange = skill.locator(".bh-chip").filter({ hasText: /^四维降解·威力 /u });
  await expect(powerChange).toHaveCount(1);
  await expect(powerChange).toContainText("100→110");
  const stats = panel.getByRole("region", { name: "种族值", exact: true });
  await expect(stats).toHaveCount(3);
  for (const region of await stats.all()) await expect(region).not.toContainText("四维降解");
  const flower = panel.getByRole("region", { name: "花衣蝶的调整", exact: true });
  await expect(flower.getByRole("region", { name: "种族值", exact: true })
    .locator(".bh-chip").filter({ hasText: /^生命 122→132 /u })).toBeVisible();
  await expect(panel.locator(".bh-chip").filter({ hasText: /^生命 122→132 /u })).toHaveCount(1);
});
