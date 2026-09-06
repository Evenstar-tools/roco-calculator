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

test("keeps narrow header labels and long spirit identity controls readable at 320px", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "洛克计算器 · S4「月涌狂想」" }),
  ).toBeVisible();
  expect(await page.locator(".app-header").evaluate(
    (header) => header.scrollWidth <= header.clientWidth,
  )).toBe(true);
  await selectSpirit(page, "攻击方", "卡瓦重（火山附近的样子）");
  await selectSpirit(page, "防御方", "水灵");

  await expect(page.locator(".view-mode-switch button span").first()).toBeVisible();
  await expect(page.locator(".team-action span")).toBeVisible();
  const pickerTopDelta = await page.locator(".versus-grid").evaluate((grid) => {
    const attack = grid.querySelector(".spirit-picker--attack .spirit-picker__eyebrow").getBoundingClientRect();
    const defense = grid.querySelector(".spirit-picker--defense .spirit-picker__eyebrow").getBoundingClientRect();
    return Math.abs(attack.top - defense.top);
  });
  expect(pickerTopDelta).toBeLessThanOrEqual(1);

  const attacker = page.locator(".spirit-picker--attack");
  const layout = await attacker.locator(".spirit-card").evaluate((card) => {
    const box = (selector) => {
      const rect = card.querySelector(selector).getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    };
    const overlaps = (left, right) =>
      left.left < right.right && left.right > right.left &&
      left.top < right.bottom && left.bottom > right.top;
    const name = card.querySelector(".spirit-card__title strong");
    const nameStyle = getComputedStyle(name);
    const favorite = box(".favorite-action");
    const identity = box(".spirit-card__identity");
    const image = box(".spirit-card__image");
    const stage = card.querySelector(".spirit-card__tags > span:last-child");
    const stageStyle = getComputedStyle(stage);
    const trait = box(".spirit-card__identity p");
    const cardBox = card.getBoundingClientRect();
    return {
      identityFitsCard: identity.top >= cardBox.top && identity.bottom <= cardBox.bottom,
      favoriteBelowImage: favorite.top >= image.bottom - 1,
      favoriteOverlapsIdentity: overlaps(favorite, identity),
      favoriteOverlapsImage: overlaps(favorite, image),
      favoriteOverlapsTrait: overlaps(favorite, trait),
      name: name.textContent.trim(),
      nameHeight: name.getBoundingClientRect().height,
      nameLineHeight: Number.parseFloat(nameStyle.lineHeight),
      stageHeight: stage.getBoundingClientRect().height,
      stageWhiteSpace: stageStyle.whiteSpace,
    };
  });
  expect(layout).toMatchObject({
    favoriteBelowImage: true,
    favoriteOverlapsIdentity: false,
    favoriteOverlapsImage: false,
    favoriteOverlapsTrait: false,
    identityFitsCard: true,
    name: "卡瓦重（火山附近的样子）",
    stageWhiteSpace: "nowrap",
  });
  expect(layout.nameHeight).toBeGreaterThan(layout.nameLineHeight + 1);
  expect(layout.nameHeight).toBeLessThanOrEqual(layout.nameLineHeight * 2 + 2);
  expect(layout.stageHeight).toBeLessThanOrEqual(16);

  const favorite = attacker.getByRole("button", { name: /收藏卡瓦重（火山附近的样子）$/ });
  await favorite.click();
  await expect(attacker.getByRole("button", { name: "取消收藏卡瓦重（火山附近的样子）" })).toBeVisible();

  await selectSpirit(page, "攻击方", "迷嶂布莱克");
  await attacker.getByRole("button", { name: "查看迷嶂布莱克本期改动" }).click();
  await expect(page.getByRole("tooltip", { name: "迷嶂布莱克本期改动" })).toBeVisible();
  await page.getByRole("button", { name: "关闭改动详情" }).last().click();
  await expect(page.getByRole("tooltip", { name: "迷嶂布莱克本期改动" })).toHaveCount(0);

  await selectSpirit(page, "攻击方", "银月狼王");
  const longTraitLayout = await attacker.locator(".spirit-card").evaluate((card) => {
    const cardBox = card.getBoundingClientRect();
    const trait = card.querySelector(".spirit-card__identity p");
    const traitBox = trait.getBoundingClientRect();
    return {
      fitsCard: traitBox.right <= cardBox.right && traitBox.bottom <= cardBox.bottom,
      fullyRendered: trait.scrollWidth <= trait.clientWidth && trait.scrollHeight <= trait.clientHeight,
      whiteSpace: getComputedStyle(trait).whiteSpace,
    };
  });
  expect(longTraitLayout).toEqual({ fitsCard: true, fullyRendered: true, whiteSpace: "normal" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 390]) {
  test(`keeps detailed four-skill controls editable and within ${width}px`, async ({ page }) => {
    await page.setViewportSize({ height: 844, width });
    await page.goto("/");
    await selectDefaultSpirits(page);
    await page.getByRole("button", { name: "具体版" }).click();
    await page.getByRole("tab", { name: "四技能" }).click();

    await expect(page.locator(".skill-slot--head").first()).toBeHidden();
    const row = page.getByRole("group", { name: "攻击方技能1，当前选中" });
    const energy = row.locator(".skill-slot__cost");
    const power = row.getByRole("spinbutton", { name: "攻击方技能1静态威力" });
    const hits = row.getByRole("spinbutton", { name: "攻击方技能1连击次数" });
    const damage = row.locator(".skill-slot__damage");
    await expect(energy).toHaveText(/^\d+$/);
    await expect(energy.locator("input, select, textarea, button")).toHaveCount(0);
    await expect(power).toBeEditable();
    await expect(hits).toBeEditable();

    const labels = await row.evaluate((node) => ({
      cost: getComputedStyle(node.querySelector(".skill-slot__cost"), "::before").content,
      hits: getComputedStyle(node.querySelector(".skill-slot__hits"), "::before").content,
      power: getComputedStyle(node.querySelector(".skill-slot__power-input"), "::before").content,
    }));
    expect(labels).toEqual({ cost: '"耗"', hits: '"连击"', power: '"威力"' });

    const initialDamage = await damage.getAttribute("aria-label");
    const initialPower = Number(await power.inputValue());
    await power.fill(String(initialPower + 20));
    await power.press("Enter");
    await expect.poll(() => damage.getAttribute("aria-label")).not.toBe(initialDamage);
    const powerDamage = await damage.getAttribute("aria-label");
    const initialHits = Number(await hits.inputValue());
    await hits.fill(String(initialHits + 1));
    await hits.press("Enter");
    await expect.poll(() => damage.getAttribute("aria-label")).not.toBe(powerDamage);

    const geometry = await row.evaluate((node) => {
      const box = (selector) => {
        const rect = node.querySelector(selector).getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      };
      const overlaps = (left, right) =>
        left.left < right.right && left.right > right.left &&
        left.top < right.bottom && left.bottom > right.top;
      const picker = box(".skill-picker");
      const result = box(".skill-slot__damage");
      const powerField = box(".skill-slot__power-input");
      const hitsField = box(".skill-slot__hits");
      return {
        pickerOverlapsResult: overlaps(picker, result),
        powerOverlapsHits: overlaps(powerField, hitsField),
      };
    });
    expect(geometry).toEqual({ pickerOverlapsResult: false, powerOverlapsHits: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole("button", { name: "切换主题" }).click();
    const hovered = page.getByRole("group", { name: "攻击方技能3" });
    await hovered.hover();
    const darkStates = await page.evaluate(() => ({
      hovered: getComputedStyle(document.querySelectorAll(".four-skill-side--attacker .skill-slot-group")[2]).backgroundColor,
      selected: getComputedStyle(document.querySelector(".four-skill-side--attacker .skill-slot-group.is-selected")).backgroundColor,
      selectedShadow: getComputedStyle(document.querySelector(".four-skill-side--attacker .skill-slot-group.is-selected")).boxShadow,
    }));
    expect(darkStates.hovered).not.toBe(darkStates.selected);
    expect(darkStates.selectedShadow).not.toBe("none");
  });
}

test("keeps narrow manual-power restore and trait-damage controls separated", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 320 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await page.getByRole("button", { name: "具体版" }).click();
  await page.getByRole("tab", { name: "四技能" }).click();

  const firstRow = page.getByRole("group", { name: "攻击方技能1，当前选中" });
  const power = firstRow.getByRole("spinbutton", { name: "攻击方技能1静态威力" });
  const originalPower = await power.inputValue();
  for (const value of ["100", "125", "9999"]) {
    await power.fill(value);
    await power.press("Enter");
    await expect(power).toHaveValue(value);
    const textFits = await power.evaluate((input) => {
      const style = getComputedStyle(input);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = style.font;
      const textWidth = context.measureText(input.value).width;
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      return textWidth + horizontalPadding + 4 <= input.clientWidth;
    });
    expect(textFits).toBe(true);
  }
  const restore = firstRow.getByRole("button", { name: "恢复自动威力" });
  await expect(restore).toBeVisible();
  const manualLayout = await firstRow.evaluate((row) => {
    const powerField = row.querySelector(".skill-slot__power-input").getBoundingClientRect();
    const hitsField = row.querySelector(".skill-slot__hits").getBoundingClientRect();
    const control = row.querySelector(".power-draft__control");
    const input = row.querySelector(".skill-slot__power-input input").getBoundingClientRect();
    const reset = row.querySelector(".power-draft__reset").getBoundingClientRect();
    return {
      controlFits: control.scrollWidth <= control.clientWidth,
      inputSeparatedFromReset: input.right <= reset.left + 1,
      powerRight: powerField.right,
      resetRight: reset.right,
      separatedFromHits: powerField.right <= hitsField.left,
    };
  });
  expect(manualLayout.controlFits).toBe(true);
  expect(manualLayout.inputSeparatedFromReset).toBe(true);
  expect(manualLayout.separatedFromHits).toBe(true);
  expect(manualLayout.resetRight).toBeLessThanOrEqual(manualLayout.powerRight + 1);
  await restore.click();
  await expect(power).toHaveValue(originalPower);

  await page.reload();
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  await attackerPicker.fill("石冠王蜥");
  await page.getByRole("option", { name: /^石冠王蜥\s/ }).click();
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "具体版" }).click();
  await page.getByRole("tab", { name: "四技能" }).click();
  const trait = page.getByRole("group", { name: "攻击方特性伤害刺肤" });
  await expect(trait).toBeVisible();
  const traitLayout = await trait.evaluate((row) => {
    const damage = row.querySelector(".skill-slot__damage");
    const slot = row.querySelector(".skill-slot");
    const slotBox = slot.getBoundingClientRect();
    const children = Array.from(slot.children).map((child) => child.getBoundingClientRect());
    return {
      costLabel: getComputedStyle(row.querySelector(".skill-slot > :nth-child(4)"), "::before").content,
      damageClipped: damage.scrollWidth > damage.clientWidth,
      maxChildRight: Math.max(...children.map(({ right }) => right)) - slotBox.right,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
      powerLabel: getComputedStyle(row.querySelector(".skill-slot__trait-power"), "::before").content,
      rowFits: slot.scrollWidth <= slot.clientWidth,
      slotClientWidth: slot.clientWidth,
      slotScrollWidth: slot.scrollWidth,
    };
  });
  expect(traitLayout).toEqual({
    costLabel: '"耗"',
    damageClipped: false,
    maxChildRight: expect.any(Number),
    pageFits: true,
    powerLabel: '"威力"',
    rowFits: expect.any(Boolean),
    slotClientWidth: expect.any(Number),
    slotScrollWidth: expect.any(Number),
  });
  expect(traitLayout.rowFits, JSON.stringify(traitLayout)).toBe(true);
  expect(traitLayout.maxChildRight).toBeLessThanOrEqual(1);
  const traitHits = trait.getByRole("spinbutton", { name: "攻击方刺肤连击次数" });
  await expect(traitHits).toBeEditable();
  await traitHits.fill("3");
  await expect(traitHits).toHaveValue("3");
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
  await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();

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
  expect(teamBox.height).toBe(themeBox.height);
  expect(teamBox.y).toBe(themeBox.y);
  expect(teamBox.width).toBe(42);
  expect(themeBox.width).toBe(38);
  expect(teamBox.height).toBe(46);
  expect(headerMenuBox.height).toBe(46);
  expect(headerMenuBox.y).toBe(teamBox.y);
  await expect(page.locator(".team-action span")).toBeVisible();
  expect(await page.locator(".app-header--compact").evaluate(
    (node) => node.scrollWidth <= node.clientWidth,
  )).toBe(true);
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
  const quickNature = page.getByRole("group", { name: "攻击方快捷性格" });
  const quickIv = page.getByRole("group", { name: "攻击方快捷个体" });
  await expect(quickNature).toBeVisible();
  await expect(quickIv).toBeVisible();
  await expect(quickNature.getByText("性格", { exact: true })).toBeVisible();
  await expect(quickIv.getByText("个体", { exact: true })).toBeVisible();
  const [natureLabelBox, ivLabelBox] = await Promise.all([
    quickNature.locator(".quick-nature__option--neutral").boundingBox(),
    quickIv.locator(".quick-iv__caption").boundingBox(),
  ]);
  expect(Math.abs(natureLabelBox.x - ivLabelBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(natureLabelBox.width - ivLabelBox.width)).toBeLessThanOrEqual(1);
  expect(
    await quickNature.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await quickIv.evaluate((node) => node.scrollWidth <= node.clientWidth),
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
  expect(teamButtonBox.height).toBe(46);
  expect(teamButtonBox.width).toBe(42);

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
      expect(layout.menuTop).toBeGreaterThanOrEqual(0);
      expect(layout.menuBottom).toBeLessThanOrEqual(layout.viewportHeight);
      if (layout.placement === "up") {
        expect(layout.menuBottom).toBeLessThanOrEqual(layout.pickerTop + 1);
      } else {
        expect(layout.placement).toBe("down");
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
  expect(headerTeam.width).toBeGreaterThan(headerMode.height);
  await expect(page.locator(".team-action span")).toBeVisible();

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
