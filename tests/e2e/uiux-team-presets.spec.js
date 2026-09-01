import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

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
    await expect(page.getByRole("button", { name: "分析" })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "分析" }).click();

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
  expect((await teamAction.boundingBox()).width).toBe(38);
});
