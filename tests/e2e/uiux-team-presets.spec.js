import { expect, test } from "@playwright/test";
import {
  openDetailedMode,
  resetUiuxStorage,
  selectDefaultSpirits,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("shows all six members in the compact team analysis matrix", async ({ page }) => {
  await page.addInitScript(() => {
    const spiritIds = [
      "spirit_b2f1251352d5f670",
      "spirit_b9382967288bd429",
      "spirit_30c62645090ee8af",
      "spirit_563a4e078a1d8cba",
      "spirit_07cdb4d4a94ac1bd",
      "spirit_f7e8528a743eaaf0",
    ];
    const members = spiritIds.map((spiritId) => ({
      displayIvs: {
        hp: 0,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 0,
        physicalDefense: 0,
        speed: 0,
      },
      natureId: "neutral",
      skills: { four: [null, null, null, null], single: null },
      spiritId,
    }));
    localStorage.setItem(
      "rock-calculator.teams.v1",
      JSON.stringify({
        activeTeamId: "team-analysis-e2e",
        schemaVersion: 1,
        teams: [{
          createdAt: "2026-08-22T00:00:00.000Z",
          id: "team-analysis-e2e",
          members,
          name: "防守面测试队",
          updatedAt: "2026-08-22T00:00:00.000Z",
        }],
      }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // 并行负载下首屏数据就绪会触发头部重渲染,单次点击可能落在被替换的旧节点上,
  // 抽屉因此不开;重试直到"分析"按钮可见,断言本身不变。
  await expect(async () => {
    await page.getByRole("button", { name: "打开队伍" }).click();
      await expect(
        page.getByRole("button", { name: "队伍分析", exact: true }),
      ).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 15000 });
  await page
    .getByRole("button", { name: "队伍分析", exact: true })
    .click();

  const analysis = page.getByRole("region", { name: "队伍分析" });
  await expect(analysis).toBeVisible();
  const matrix = analysis.getByRole("table", { name: "队伍防守与打击面矩阵" });
  await expect(matrix.locator("tbody tr")).toHaveCount(6);

  const firstCell = matrix.locator("tbody button").first();
  await firstCell.click();
  await expect(analysis.getByLabel("单元格详情")).toBeVisible();

  await analysis.getByRole("button", { name: "技能打击面" }).click();
  await expect(matrix.locator("tbody tr")).toHaveCount(6);

  const drawer = page.getByRole("dialog", { name: "队伍" });
  expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test("shows the team label on desktop and keeps the mobile header compact", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1424 });
  await page.goto("/");

  const teamAction = page.locator(".team-action");
  const teamLabel = teamAction.locator("span");
  await expect(teamLabel).toBeVisible();
  expect((await teamAction.boundingBox()).width).toBeGreaterThan(38);

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(teamLabel).toBeHidden();
  expect((await teamAction.boundingBox()).width).toBe(44);
});

test("uses the durability values as the direct ability-analysis entry", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.settings.durability-overview.v1", "1");
  });
  await page.setViewportSize({ width: 1424, height: 900 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);

  const overview = page.getByRole("button", { name: "攻击方耐久概览" });
  await expect(overview).toBeVisible();
  await expect(overview).not.toContainText("按当前面板");
  await expect(page.getByRole("button", { name: "分析此精灵" })).toHaveCount(0);
  await overview.hover();
  await expect.poll(
    () => overview.evaluate((node) => getComputedStyle(node, "::after").opacity),
  ).toBe("1");
  await page.screenshot({
    fullPage: false,
    path: "artifacts/web-ux-team-ability-fix/durability-overview-hover-1424.png",
  });
  await overview.click();
  await expect(page.getByRole("dialog", { name: "队伍" })).toBeVisible();
  await expect(page.getByText("临时分析 · 不占队伍位置")).toBeVisible();
});

test("completes the ability workbench flow at 390px without horizontal overflow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const member = {
      displayIvs: {
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 0,
        physicalAttack: 60,
        physicalDefense: 0,
        speed: 60,
      },
      natureId: "neutral",
      skills: { four: [null, null, null, null], single: null },
      spiritId: "spirit_8735efa1d0793f6a",
    };
    localStorage.setItem(
      "rock-calculator.teams.v1",
      JSON.stringify({
        activeTeamId: "ability-mobile-e2e",
        schemaVersion: 1,
        teams: [
          {
            createdAt: "2026-09-03T00:00:00.000Z",
            id: "ability-mobile-e2e",
            members: [member, null, null, null, null, null],
            name: "能力分析测试队",
            updatedAt: "2026-09-03T00:00:00.000Z",
          },
        ],
      }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开队伍" }).click();

  const drawer = page.getByRole("dialog", { name: "队伍" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("region", { name: "成员 1 配置" }),
  ).toBeVisible();

  await drawer
    .getByRole("button", { name: "能力分析", exact: true })
    .click();
  const ability = drawer.getByRole("region", {
    name: "能力分析",
    exact: true,
  });
  await expect(ability).toBeVisible();
  await expect(ability.getByRole("slider", { name: "速度目标轴" })).toHaveCount(0);
  await expect(ability.getByRole("region", { name: "速度排行榜横轴" })).toBeVisible();
  const speedProfile = ability.getByRole("combobox", { name: "速度目标口径" });
  await expect(speedProfile).toHaveValue("positive-max");
  await speedProfile.selectOption("negative-zero");
  await expect(ability.getByText(/减速度：速度个体0、减速性格/)).toBeVisible();
  await speedProfile.selectOption("neutral-max");
  const target = ability.getByRole("combobox", { name: "速度目标精灵" });
  await target.selectOption("spirit_b2f1251352d5f670");
  await ability
    .getByRole("combobox", { name: "推荐速度约束" })
    .selectOption("unlocked");

  const builds = ability.getByRole("region", { name: "耐久方案对比" });
  await expect(
    builds.getByRole("heading", { level: 5 }).allTextContents(),
  ).resolves.toEqual(["综合承伤", "物理承伤", "魔法承伤"]);
  await builds.getByRole("button", { name: "应用到成员" }).first().click();
  await expect(ability.getByRole("status")).toContainText("方案已应用到成员");
  await expect(ability.getByText("未知形态默认排除：0")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: "artifacts/web-ux-team-ability-fix/ability-after-390.png",
  });
  const storedMember = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("rock-calculator.teams.v1"),
    );
    return stored.teams[0].members[0];
  });
  expect(
    Object.values(storedMember.displayIvs).every(
      (value) => value === 0 || value === 60,
    ),
  ).toBe(true);
  expect(
    Object.values(storedMember.displayIvs).filter((value) => value === 60),
  ).toHaveLength(3);

  await ability.getByRole("button", { name: "查看完整耐久榜" }).click();
  const ranking = drawer.getByRole("region", { name: "完整耐久榜" });
  await expect(ranking).toBeVisible();
  const firstRow = ranking.locator("tbody tr").first();
  await expect(firstRow.locator("td:nth-child(1)")).toBeVisible();
  await expect(firstRow.locator("td:nth-child(5)")).toBeVisible();
  await expect(firstRow.locator("td:nth-child(3)")).toBeHidden();

  const metrics = ranking.getByRole("group", { name: "排行指标" });
  await metrics.getByRole("button", { name: "物理耐久" }).click();
  await expect(firstRow.locator("td:nth-child(3)")).toBeVisible();
  await expect(firstRow.locator("td:nth-child(5)")).toBeHidden();

  const layout = await page.evaluate(() => ({
    abilityOverflowY: getComputedStyle(
      document.querySelector(".ability-workbench"),
    ).overflowY,
    documentFits:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
    drawerFits: (() => {
      const node = document.querySelector(".team-workbench");
      return node.scrollWidth <= node.clientWidth;
    })(),
  }));
  expect(layout).toEqual({
    abilityOverflowY: "visible",
    documentFits: true,
    drawerFits: true,
  });

  await ranking.getByRole("button", { name: "返回能力分析" }).click();
  await expect(target).toHaveValue("spirit_b2f1251352d5f670");
});

test("keeps the full ranking spirit cell aligned at desktop width", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const member = {
      displayIvs: {
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 60,
        physicalAttack: 0,
        physicalDefense: 60,
        speed: 0,
      },
      natureId: "neutral",
      skills: { four: [null, null, null, null], single: null },
      spiritId: "spirit_8735efa1d0793f6a",
    };
    localStorage.setItem(
      "rock-calculator.teams.v1",
      JSON.stringify({
        activeTeamId: "ability-ranking-e2e",
        schemaVersion: 1,
        teams: [{
          createdAt: "2026-09-03T00:00:00.000Z",
          id: "ability-ranking-e2e",
          members: [member, null, null, null, null, null],
          name: "排行榜布局测试队",
          updatedAt: "2026-09-03T00:00:00.000Z",
        }],
      }),
    );
  });
  await page.setViewportSize({ width: 1424, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开队伍" }).click();
  const drawer = page.getByRole("dialog", { name: "队伍" });
  await drawer.getByRole("button", { name: "能力分析", exact: true }).click();
  const builds = drawer.getByRole("region", { name: "耐久方案对比" });
  const buildCards = builds.getByRole("article");
  await expect(buildCards).toHaveCount(3);
  await expect(buildCards.nth(0)).toContainText("性格：沉默（+生命 -物攻）");
  await expect(buildCards.nth(1)).toContainText("性格：稳重（+物防 -物攻）");
  await expect(buildCards.nth(2)).toContainText("性格：警惕（+魔防 -物攻）");
  await expect(builds.getByText(/为什么只有一个方案|共同最优方案|三种目标一致/))
    .toHaveCount(0);
  const speedAxis = drawer.getByRole("region", { name: "速度排行榜横轴" });
  await speedAxis.scrollIntoViewIfNeeded();
  const axisBefore = await speedAxis.evaluate((node) => ({
    left: node.scrollLeft,
    max: node.scrollWidth - node.clientWidth,
  }));
  expect(axisBefore.max).toBeGreaterThan(0);
  const axisBox = await speedAxis.boundingBox();
  expect(axisBox).not.toBeNull();
  const startX = axisBefore.left > 80
    ? axisBox.x + axisBox.width * 0.35
    : axisBox.x + axisBox.width * 0.65;
  const endX = axisBefore.left > 80 ? startX + 180 : startX - 180;
  const dragY = axisBox.y + axisBox.height * 0.5;
  await page.mouse.move(startX, dragY);
  await page.mouse.down();
  await page.mouse.move(endX, dragY, { steps: 8 });
  await page.mouse.up();
  await expect.poll(
    () => speedAxis.evaluate((node) => node.scrollLeft),
  ).not.toBe(axisBefore.left);
  await page.screenshot({
    fullPage: false,
    path: "artifacts/web-ux-team-ability-fix/ability-after-1424.png",
  });
  await drawer.getByRole("button", { name: "查看完整耐久榜" }).click();

  const ranking = drawer.getByRole("region", { name: "完整耐久榜" });
  await expect(ranking.locator("thead th").allTextContents()).resolves.toEqual([
    "排名",
    "精灵",
    "物理耐久",
    "魔法耐久",
    "综合耐久",
  ]);
  await expect(ranking.getByText("全体", { exact: true })).toHaveCount(0);
  await expect(ranking.getByText("筛选内", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 927, height: 900 });
  const firstSpiritCell = ranking.locator("tbody tr").first().locator("th");
  const cellBox = await firstSpiritCell.boundingBox();
  const contentBox = await firstSpiritCell.locator(".ability-ranking-spirit").boundingBox();
  expect(cellBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(Math.abs(
    (cellBox.x + cellBox.width - 10) - (contentBox.x + contentBox.width),
  )).toBeLessThanOrEqual(2);
  await page.screenshot({
    fullPage: true,
    path: "artifacts/web-ux-team-ability-fix/ranking-after-927.png",
  });
});
