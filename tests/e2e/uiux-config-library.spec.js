import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("exports and imports the favorite configuration library without touching teams", async ({ page }) => {
  await page.goto("/");
  const runtime = await page.evaluate(() =>
    fetch("/data/runtime.json").then((response) => response.json()),
  );
  const spirit = runtime.spirits[0];
  const skills = runtime.learnsets.find(
    (entry) => entry.spiritId === spirit.id,
  ).skillIds.slice(0, 2);
  const entry = {
    spiritId: spirit.id,
    natureId: "adamant",
    displayIvs: {
      hp: 0,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 60,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    skills: [skills[0], skills[1], null, null],
    traitValues: {},
  };
  await page.evaluate(({ entry }) => {
    localStorage.setItem("rock-calculator.favorites.v1", JSON.stringify([{
      id: `spirit:${entry.spiritId}`,
      kind: "spirit",
      spiritId: entry.spiritId,
    }]));
    localStorage.setItem("rock-calculator.spirit-configs.v2", JSON.stringify({
      configs: {
        [entry.spiritId]: {
          ...entry,
          skills: { four: entry.skills, single: null },
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      },
      schemaVersion: 2,
    }));
    localStorage.setItem("rock-calculator.teams.v1", "team-sentinel");
  }, { entry });
  await page.reload();

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "配置库导出" }).click();
  await expect(page.getByText("可导出 1 只精灵")).toBeVisible();
  await page.getByRole("button", { name: "查看精灵和技能" }).click();
  await expect(page.getByText(spirit.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText(runtime.skills.find(
    (skill) => skill.id === skills[0],
  ).name, { exact: true })).toBeVisible();
  const exportListLayout = await page.locator(".config-library-entry-list").evaluate(
    (element) => ({
      overflowY: getComputedStyle(element).overflowY,
      width: element.getBoundingClientRect().width,
      parentWidth: element.parentElement.getBoundingClientRect().width,
    }),
  );
  expect(exportListLayout.overflowY).toBe("auto");
  expect(exportListLayout.width).toBeLessThanOrEqual(exportListLayout.parentWidth);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^洛克计算器-收藏配置-\d{8}-\d{4}\.json$/,
  );

  const library = {
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    appVersion: "1.3.1",
    versions: {
      data: runtime.meta.id,
      rules: runtime.meta.rulesVersion,
    },
    exportedAt: "2026-08-03T00:00:00.000Z",
    entryCount: 1,
    entries: [entry],
  };
  await page.evaluate(() => {
    localStorage.removeItem("rock-calculator.favorites.v1");
    localStorage.removeItem("rock-calculator.spirit-configs.v2");
  });
  await page.reload();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "配置库导入" }).click();
  await page.getByLabel("选择配置库文件").setInputFiles({
    buffer: Buffer.from(JSON.stringify(library), "utf8"),
    mimeType: "application/json",
    name: "配置库.json",
  });
  await expect(page.getByText("新增配置").locator("..").getByText("1")).toBeVisible();
  await expect(page.getByText("检查通过，未发现兼容问题")).toBeVisible();
  await expect(page.getByText("失效技能槽")).toHaveCount(0);
  await page.getByRole("button", { name: "确认导入" }).click();

  const stored = await page.evaluate((spiritId) => ({
    configs: JSON.parse(
      localStorage.getItem("rock-calculator.spirit-configs.v2"),
    ),
    favorites: JSON.parse(
      localStorage.getItem("rock-calculator.favorites.v1"),
    ),
    teams: localStorage.getItem("rock-calculator.teams.v1"),
    spiritId,
  }), spirit.id);
  expect(stored.configs.configs[stored.spiritId].natureId).toBe("adamant");
  expect(stored.favorites[0].spiritId).toBe(stored.spiritId);
  expect(stored.teams).toBe("team-sentinel");
});

test("imports a legacy four-skill dazzling config and explains the compatibility repair", async ({ page }) => {
  await page.goto("/");
  const runtime = await page.evaluate(() =>
    fetch("/data/runtime.json").then((response) => response.json()),
  );
  const spirit = runtime.spirits.find((entry) => entry.fullName === "彩虹独角兽");
  const skills = runtime.learnsets.find(
    (entry) => entry.spiritId === spirit.id,
  ).skillIds.slice(0, 4);
  const library = {
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    appVersion: "1.3.6",
    versions: {},
    exportedAt: "2026-08-03T06:30:00.000Z",
    entryCount: 1,
    entries: [{
      spiritId: spirit.id,
      natureId: "timid",
      displayIvs: {
        hp: 60,
        speed: 60,
        physicalAttack: 0,
        magicalAttack: 60,
        physicalDefense: 0,
        magicalDefense: 0,
      },
      skills,
      traitValues: {},
    }],
  };

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "配置库导入" }).click();
  await page.getByLabel("选择配置库文件").setInputFiles({
    buffer: Buffer.from(JSON.stringify(library), "utf8"),
    mimeType: "application/json",
    name: "旧版配置库.json",
  });

  await expect(page.getByText("无效配置")).toHaveCount(0);
  await page.getByRole("button", { name: /检查详情/ }).click();
  await expect(page.getByText("兼容修复", { exact: true })).toBeVisible();
  await expect(page.getByText("彩虹独角兽", { exact: true })).toBeVisible();
  await expect(page.getByText("旧版技能槽结构已兼容当前形态")).toBeVisible();
  await expect(page.getByText("已保留原四技能，并补齐 3 个空技能槽")).toBeVisible();
  await page.getByRole("button", { name: "确认导入" }).click();

  const storedSkills = await page.evaluate((spiritId) => JSON.parse(
    localStorage.getItem("rock-calculator.spirit-configs.v2"),
  ).configs[spiritId].skills.four, spirit.id);
  expect(storedSkills).toEqual([...skills, null, null, null]);
});
