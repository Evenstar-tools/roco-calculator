import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-storage-initialized")) return;
    localStorage.removeItem("rock-calculator.spirit-configs.v1");
    localStorage.removeItem("rock-calculator.teams.v1");
    sessionStorage.setItem("e2e-storage-initialized", "1");
  });
});

async function selectSpirit(page, side, name) {
  const picker = page.getByRole("combobox", { name: `${side}精灵` });
  await picker.fill(name);
  await page
    .getByRole("option", { name: new RegExp(`^${name}`) })
    .click();
}

async function selectDefaultSpirits(page) {
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");
}

async function openDetailedMode(page) {
  await page.getByRole("button", { name: "具体版" }).click();
  await page.getByRole("tab", { name: "单技能" }).click();
}

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
  expect(teamBox.height).toBe(38);
  expect(headerMenuBox.height).toBe(38);
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
  expect(teamButtonBox.height).toBe(38);
  expect(teamButtonBox.width).toBe(38);

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
  const powerSummary = page.locator(".skill-effect-card__power");
  await expect(powerSummary.locator("strong")).toContainText("80");
  await page
    .getByRole("checkbox", { name: "敌方本回合换精灵" })
    .check();
  await expect(page.getByText("80 + 100 = 180")).toBeVisible();
  await expect(powerSummary.locator("strong")).toContainText("180");

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.scrollIntoViewIfNeeded();
  await skillPicker.click();
  await expect(
    page.locator('.skill-picker__options [role="option"]'),
  ).toHaveCount(571);
  await skillPicker.fill("愿力冲击");
  await expect(
    page.locator('.skill-picker__options [role="option"]'),
  ).toHaveCount(18);

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

test("collapses cleanly in a 930px half-screen window and steps IV by six", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 930 });
  await page.goto("/");
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

test("recalculates current stacked and triggered traits without blocking results", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "徘徊爪爪");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const damage = page.getByTestId("primary-damage");
  const catBaseDamage = Number(await damage.textContent());
  await page.getByRole("spinbutton", { name: "完整选择次数" }).fill("2");
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeGreaterThan(catBaseDamage);
  await page.getByRole("spinbutton", { name: "每层物攻" }).fill("50");

  await selectSpirit(page, "攻击方", "烈火守护");
  const actualPower = page.locator(".skill-effect-card__power strong");
  const guardianBasePower = Number(
    (await actualPower.textContent()).replace(/\D/g, ""),
  );
  await page
    .getByRole("spinbutton", { name: "己方火系技能次数" })
    .fill("3");
  await expect
    .poll(async () =>
      Number((await actualPower.textContent()).replace(/\D/g, "")),
    )
    .toBe(guardianBasePower + 30);

  await selectSpirit(page, "攻击方", "古卷执政官");
  const governorTrigger = page.getByRole("checkbox", {
    name: "入场时魔力为1",
  });
  const governorBaseDamage = Number(await damage.textContent());
  await governorTrigger.check();
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeGreaterThan(governorBaseDamage);

  await selectSpirit(page, "攻击方", "霜翼领主（春天的样子）");
  const skybreakerTrigger = page.getByRole("checkbox", {
    name: "先于敌方攻击",
  });
  await expect(skybreakerTrigger).not.toBeChecked();
  await skybreakerTrigger.check();
  await page.getByRole("spinbutton", { name: "触发加成" }).fill("90");
  await expect(page.getByTestId("primary-damage")).not.toHaveText("—");
});

test("applies editable Polarization reduction to matching carried skill types", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "矿晶虫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const firstSkill = page.getByRole("combobox", { name: "攻击方技能1" });
  await firstSkill.fill("地刺");
  await page
    .getByRole("option", { name: /^地 地刺 / })
    .click();

  const reduction = page.getByRole("spinbutton", { name: "减伤比例" });
  const damage = page.getByTestId("primary-damage");
  await reduction.fill("20");
  const lightReductionDamage = Number(await damage.textContent());
  await reduction.fill("40");
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeLessThan(lightReductionDamage);
});

test("persists single-skill state across reloads and isolates spirit switches", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("当头棒喝");
  await page.getByRole("option", { name: /当头棒喝/ }).click();
  await page
    .getByRole("checkbox", { name: "敌方本回合换精灵" })
    .check();
  await page
    .getByRole("spinbutton", { name: "基础技能威力" })
    .fill("137");

  await page.reload();
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "基础技能威力" }),
  ).toHaveValue("137");

  await selectSpirit(page, "攻击方", "水灵");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).not.toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "基础技能威力" }),
  ).not.toHaveValue("137");

  await selectSpirit(page, "攻击方", "音速犬");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "基础技能威力" }),
  ).toHaveValue("137");
});
