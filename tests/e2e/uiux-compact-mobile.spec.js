import { expect, test } from "@playwright/test";
import {
  inspectDetailedSkillMenu,
  openDetailedMode,
  selectDefaultSpirits,
  selectSpirit,
  resetUiuxStorage,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("keeps the compact swap action centered between both spirit inputs at 320px", async ({ page }) => {
  await page.setViewportSize({ height: 568, width: 320 });
  await page.goto("/");

  const attacker = page.getByRole("combobox", { name: "攻击方精灵" });
  const defender = page.getByRole("combobox", { name: "防御方精灵" });
  const swap = page.getByRole("button", { name: "交换双方完整配置" });
  const [attackerBox, defenderBox, swapBox] = await Promise.all([
    attacker.boundingBox(),
    defender.boundingBox(),
    swap.boundingBox(),
  ]);

  expect(Math.abs(
    (swapBox.y + swapBox.height / 2) - (attackerBox.y + attackerBox.height / 2),
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    (swapBox.y + swapBox.height / 2) - (defenderBox.y + defenderBox.height / 2),
  )).toBeLessThanOrEqual(1);
  expect(swapBox.x).toBeGreaterThanOrEqual(attackerBox.x + attackerBox.width);
  expect(swapBox.x + swapBox.width).toBeLessThanOrEqual(defenderBox.x);

  await page.screenshot({
    fullPage: false,
    path: "artifacts/web-ux-team-ability-fix/compact-swap-320.png",
  });
});

test("starts with static power and every optional display setting off", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "显示设置" }).click();

  const dialog = page.getByRole("dialog", { name: "显示设置" });
  await expect(dialog.getByRole("button", { name: "静态威力" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(dialog.getByRole("button", { name: "显示威力" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  for (const name of ["属性克制与打击面", "显示面板耐久", "负面状态结算"]) {
    await expect(dialog.getByRole("checkbox", { name })).not.toBeChecked();
  }
});

test("keeps the compact workflow usable at 390px", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "精灵配置" }),
  ).toBeVisible();
  const teamBox = await page
    .getByRole("button", { name: "打开队伍" })
    .boundingBox();
  const themeBox = await page
    .getByRole("button", { name: "切换主题" })
    .boundingBox();
  const headerMenuBox = await page
    .getByRole("button", { name: "打开菜单" })
    .boundingBox();
  expect(teamBox.width).toBe(themeBox.width);
  expect(teamBox.height).toBe(themeBox.height);
  expect(teamBox.y).toBe(themeBox.y);
  expect(teamBox.height).toBe(44);
  expect(headerMenuBox.height).toBe(44);
  await expect(
    page.getByRole("combobox", { name: "攻击方精灵" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "防御方精灵" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("region", { name: "性格配置" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "展开伤害结果" }),
  ).toHaveCount(0);

  const menuButton = page.getByRole("button", { name: "打开菜单" });
  await menuButton.click();
  const menu = page.getByRole("navigation", { name: "应用菜单" });
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭菜单" }),
  ).toHaveAttribute("aria-expanded", "true");
  const menuBox = await menu.boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(menuButton).toBeFocused();

  await selectDefaultSpirits(page);
  await expect(page.locator(".step-heading")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "即时配置" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "四技能" }),
  ).toHaveAttribute("aria-selected", "true");
  const compactWorkspace = page.getByRole("region", { name: "即时配置" });
  const compactWorkspaceBox = await compactWorkspace.boundingBox();
  expect(compactWorkspaceBox.x + compactWorkspaceBox.width).toBeLessThanOrEqual(
    390,
  );
  await expect(
    page.getByRole("group", { name: "攻击方快捷性格" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "攻击方快捷个体" }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("group", { name: "攻击方快捷性格" })
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await page
      .getByRole("group", { name: "攻击方快捷个体" })
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await expect(
    page.getByRole("combobox", { name: "攻击方技能1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "防御方技能1" }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "展开伤害结果" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "展开伤害结果" }).click();
  const currentHp = page.getByRole("spinbutton", {
    name: "防御方当前生命",
  });
  await expect(currentHp).toHaveValue("434");
  const currentHpBox = await currentHp.boundingBox();
  expect(currentHpBox.height).toBeGreaterThanOrEqual(44);
  await currentHp.fill("200");
  await expect(
    page
      .getByRole("dialog", { name: "完整伤害结果" })
      .locator(".result-rail__percent"),
  ).toHaveText(/^\d+\.\d% HP$/);
  await page.getByRole("button", { name: "恢复满血" }).click();
  await expect(currentHp).toHaveValue("434");
  await page.getByRole("button", { name: "关闭伤害结果" }).click();

  const teamButton = page.getByRole("button", { name: "打开队伍" });
  const teamButtonBox = await teamButton.boundingBox();
  expect(teamButtonBox.height).toBe(44);
  expect(teamButtonBox.width).toBe(44);

  await teamButton.click();
  const drawer = page.getByRole("dialog", { name: "队伍" });
  await expect(drawer).toBeVisible();
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox.width).toBeGreaterThanOrEqual(389);
  expect(drawerBox.height).toBeGreaterThanOrEqual(843);
  await page.getByRole("button", { name: "新建队伍" }).click();
  await page
    .getByRole("button", { name: "用当前攻击方填入1号位" })
    .click();
  await expect(
    page.getByRole("button", { name: "编辑音速犬" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭队伍" }).click();

  await expect(
    page
      .locator('#four-skill-panel .compact-skill__result[data-status="ready"]')
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll(".compact-skill__row")].every(
        (slot) => slot.scrollWidth <= slot.clientWidth,
      ),
    ),
  ).toBe(true);

  await openDetailedMode(page);
  const resultBar = page.getByRole("button", { name: "展开伤害结果" });
  const advanced = page.getByRole("button", { name: "高级选项" });
  await advanced.scrollIntoViewIfNeeded();
  const resultBarBox = await resultBar.boundingBox();
  const advancedBox = await advanced.boundingBox();
  expect(advancedBox.y + advancedBox.height).toBeLessThanOrEqual(
    resultBarBox.y,
  );
});

test("persists type analysis and keeps it readable in the mobile result drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");

  await expect(page.getByRole("region", { name: "属性分析" })).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "显示设置" }).click();
  await page.getByRole("checkbox", { name: "属性克制与打击面" }).check();
  await page.getByRole("button", { name: "完成" }).click();

  const desktopPanel = page.getByRole("region", { name: "属性分析" });
  await expect(desktopPanel).toBeVisible();
  await expect(desktopPanel.getByRole("img", { name: "草" }).first()).toBeVisible();
  expect(await page.evaluate(() =>
    localStorage.getItem("rock-calculator.settings.type-coverage.v1"),
  )).toBe("1");

  await page.reload();
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");
  await expect(page.getByRole("region", { name: "属性分析" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开伤害结果" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "完整伤害结果" })
      .getByRole("region", { name: "属性分析" }),
  ).toBeVisible();
});

test("keeps the result rail and three steps readable at 1280px", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/");
  await selectDefaultSpirits(page);

  const compactSides = page.locator(".compact-skill-side");
  await expect(compactSides).toHaveCount(2);
  const compactAttackBox = await compactSides.nth(0).boundingBox();
  const compactDefenseBox = await compactSides.nth(1).boundingBox();
  expect(Math.abs(compactAttackBox.y - compactDefenseBox.y)).toBeLessThan(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await openDetailedMode(page);

  await expect(
    page.getByRole("complementary", { name: "伤害结果" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "精灵配置" })).toBeVisible();
  await expect(page.getByRole("region", { name: "性格配置" })).toBeVisible();
  await expect(page.getByRole("region", { name: "技能配置" })).toBeVisible();
  await expect(page.locator(".step-heading")).toHaveCount(0);
  await expect(page.locator(".stat-tile__label-text")).toHaveCount(12);
  await expect(page.locator(".stat-tile__label-text").first()).toBeVisible();
  const staticPower = page.getByRole("spinbutton", { name: "静态威力" });
  await expect(staticPower).toHaveValue("80");
  await page
    .getByRole("checkbox", { name: "敌方本回合换精灵" })
    .check();
  await expect(
    page.locator("#single-skill-panel").getByText("80 + 100 = 180"),
  ).toBeVisible();
  await expect(staticPower).toHaveValue("180");

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.scrollIntoViewIfNeeded();
  await skillPicker.click();
  const skillOptions = skillPicker
    .locator("xpath=..")
    .locator('.skill-picker__options [role="option"]');
  await expect(skillOptions).toHaveCount(19);
  const librarySize = await skillOptions.first().getAttribute("aria-setsize");
  expect(Number(librarySize)).toBeGreaterThan(await skillOptions.count());
  const skillList = skillPicker
    .locator("xpath=..")
    .locator(".skill-picker__options");
  await skillList.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(skillOptions.last()).toHaveAttribute("aria-posinset", librarySize);
  await skillPicker.fill("愿力冲击");
  await expect(skillOptions).toHaveCount(18);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "四技能" }).click();
  await expect(page.locator(".four-skill-side")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll(".skill-slot:not(.skill-slot--head)")]
        .every((slot) => slot.scrollWidth <= slot.clientWidth),
    ),
  ).toBe(true);
});

test("keeps compact bottom skill menus above their rows on both sides", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectDefaultSpirits(page);

  for (const side of ["攻击方", "防御方"]) {
    for (const slot of [3, 4]) {
      const layout = await inspectDetailedSkillMenu(page, side, slot);
      expect(layout.clippingAncestors).toEqual([]);
      expect(layout.nameWidth).toBeGreaterThanOrEqual(
        layout.requiredNameWidth,
      );
      expect(layout.menuBottom).toBeLessThanOrEqual(layout.pickerTop + 1);
    }
  }
});

test("keeps detailed four-skill menus readable outside every attack and defense row", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  for (const side of ["攻击方", "防御方"]) {
    for (const slot of [1, 2, 3, 4]) {
      const layout = await inspectDetailedSkillMenu(page, side, slot);
      expect(layout.clippingAncestors).toEqual([]);
      expect(layout.nameWidth).toBeGreaterThanOrEqual(
        layout.requiredNameWidth,
      );
      if (slot >= 3) {
        expect(layout.menuBottom).toBeLessThanOrEqual(layout.pickerTop + 1);
      } else {
        expect(layout.menuTop).toBeGreaterThanOrEqual(layout.pickerBottom - 1);
      }
    }
  }
});

test("collapses cleanly in a 930px half-screen window and steps IV by six", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 930 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const headerMode = await page
    .getByRole("group", { name: "界面模式" })
    .boundingBox();
  const headerTeam = await page
    .getByRole("button", { name: "打开队伍" })
    .boundingBox();
  const headerTheme = await page
    .getByRole("button", { name: "切换主题" })
    .boundingBox();
  const headerMenu = await page
    .getByRole("button", { name: "打开菜单" })
    .boundingBox();
  for (const action of [headerTeam, headerTheme, headerMenu]) {
    expect(action.height).toBe(headerMode.height);
    expect(action.y).toBe(headerMode.y);
  }
  expect(headerTeam.width).toBe(headerMode.height);

  await page.getByRole("button", { name: "具体版" }).click();
  const detailedMode = await page
    .getByRole("group", { name: "界面模式" })
    .boundingBox();
  for (const name of ["打开队伍", "切换主题", "打开菜单"]) {
    const action = await page.getByRole("button", { name }).boundingBox();
    expect(action.height).toBe(detailedMode.height);
    expect(action.y).toBe(detailedMode.y);
  }
  await page.getByRole("button", { name: "精简版" }).click();

  await selectDefaultSpirits(page);

  const compactSkill = page.getByRole("combobox", {
    name: "攻击方技能1",
  });
  await compactSkill.fill("火焰切割");
  const compactOptionName = page
    .getByRole("option", { name: /火焰切割/ })
    .locator(".skill-picker__option-name strong")
    .first();
  await expect(compactOptionName).toBeVisible();
  expect(
    await compactOptionName.evaluate((node) => {
      const text = node.textContent.slice(0, 4);
      const style = getComputedStyle(node);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return node.clientWidth >= context.measureText(text).width;
    }),
  ).toBe(true);
  const compactOption = page
    .getByRole("option", { name: /火焰切割/ })
    .first();
  expect(
    await compactOption.evaluate((node) => {
      const category = node
        .querySelector(".skill-picker__option-name small")
        .getBoundingClientRect();
      const meta = node
        .querySelector(".skill-picker__option-meta")
        .getBoundingClientRect();
      return meta.left - category.right;
    }),
  ).toBeLessThanOrEqual(16);
  expect(
    await compactOption.evaluate((node) =>
      getComputedStyle(node.closest(".skill-picker__options")).scrollbarGutter,
    ),
  ).toContain("stable");
  await page.keyboard.press("Escape");

  await openDetailedMode(page);

  await expect(
    page.getByRole("heading", { name: "洛克计算器" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "伤害结果" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "展开伤害结果" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "防御方精灵" }),
  ).toBeVisible();
  await expect(page.locator(".stat-tile__label-text")).toHaveCount(12);
  await expect(page.locator(".stat-tile__label-text").first()).toBeHidden();
  await expect(page.locator(".stat-tile .stat-icon").first()).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const ivInput = page.getByRole("spinbutton", { name: "物攻个体" }).first();
  await expect(ivInput).toHaveValue("60");
  await ivInput.focus();
  await ivInput.press("ArrowDown");
  await expect(ivInput).toHaveValue("54");
});

test("stacks both stat panels before their values collide at 640px", async ({
  page,
}) => {
  await page.setViewportSize({ height: 820, width: 640 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);

  const sides = page.locator(".nature-side");
  await expect(sides).toHaveCount(2);
  const attackBox = await sides.nth(0).boundingBox();
  const defenseBox = await sides.nth(1).boundingBox();

  expect(defenseBox.y).toBeGreaterThanOrEqual(
    attackBox.y + attackBox.height,
  );

  const firstTile = page.locator(".stat-tile").first();
  const panelBox = await firstTile.locator(".stat-tile__panel").boundingBox();
  const ivBox = await firstTile.locator(".stat-tile__iv-input").boundingBox();
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(ivBox.x);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
