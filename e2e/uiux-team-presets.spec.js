import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-storage-initialized")) return;
    localStorage.removeItem("rock-calculator.spirit-configs.v1");
    localStorage.removeItem("rock-calculator.spirit-configs.v2");
    localStorage.removeItem("rock-calculator.favorites.v1");
    localStorage.removeItem("rock-calculator.teams.v1");
    sessionStorage.setItem("e2e-storage-initialized", "1");
  });
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

async function inspectDetailedSkillMenu(page, side, slot) {
  const picker = page.getByRole("combobox", {
    name: `${side}技能${slot}`,
  });
  await picker.scrollIntoViewIfNeeded();
  await picker.click();
  const options = picker.locator("xpath=..").locator(".skill-picker__options");
  await expect(options).toBeVisible();

  const layout = await options.evaluate((node) => {
    const menu = node.getBoundingClientRect();
    const picker = node.parentElement.getBoundingClientRect();
    const clippingAncestors = [];
    let ancestor = node.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowX,
      );
      const clipsY = ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowY,
      );
      if (clipsX || clipsY) {
        const box = ancestor.getBoundingClientRect();
        if (
          (clipsX && (menu.left < box.left - 1 || menu.right > box.right + 1)) ||
          (clipsY && (menu.top < box.top - 1 || menu.bottom > box.bottom + 1))
        ) {
          clippingAncestors.push(ancestor.className || ancestor.tagName);
        }
      }
      ancestor = ancestor.parentElement;
    }

    const name = node.querySelector(".skill-picker__option-name strong");
    const text = name?.textContent?.slice(0, 4) ?? "";
    const style = name ? getComputedStyle(name) : null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (style) {
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    }

    return {
      clippingAncestors,
      menuBottom: menu.bottom,
      menuTop: menu.top,
      nameWidth: name?.getBoundingClientRect().width ?? 0,
      pickerBottom: picker.bottom,
      pickerTop: picker.top,
      requiredNameWidth: context.measureText(text).width,
    };
  });

  await page.keyboard.press("Escape");
  return layout;
}

test("applies and explains Beast Flower bloodlines without retaining the battle trigger", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "兽花蕾");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("透射");
  await page.getByRole("option", { name: /透射/ }).click();
  const bloodline = page.getByRole("combobox", { name: "血脉" });
  await bloodline.selectOption("normal");
  await page.getByRole("checkbox", { name: "入场已触发" }).check();

  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "普通血脉｜技能威力 +40",
  );

  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "攻击方", "兽花蕾");
  await expect(page.getByRole("combobox", { name: "血脉" })).toHaveValue("normal");
  await expect(page.getByRole("checkbox", { name: "入场已触发" })).not.toBeChecked();
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
  const skillOptions = skillPicker
    .locator("xpath=..")
    .locator('.skill-picker__options [role="option"]');
  await expect(skillOptions).toHaveCount(19);
  await expect(skillOptions.first()).toHaveAttribute("aria-setsize", "571");
  const skillList = skillPicker
    .locator("xpath=..")
    .locator(".skill-picker__options");
  await skillList.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(skillOptions.last()).toHaveAttribute("aria-posinset", "571");
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

test("keeps Gal choice controls inside two-line four-skill rows at desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ height: 861, width: 1424 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "加尔");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const picker = page.getByRole("combobox", { name: "攻击方技能1" });
  await picker.fill("友谊满溢");
  await page
    .getByRole("option")
    .filter({ hasText: "友谊满溢" })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "攻击方技能1选择效果" })
    .selectOption("counter");
  await page.getByRole("checkbox", { name: "攻击方技能1触发应对" }).check();
  await page.getByRole("checkbox", { name: "攻击方技能1触发特性" }).check();

  const firstRow = page
    .locator(".four-skill-side")
    .first()
    .locator(".skill-slot-group")
    .first();
  const layout = await firstRow.evaluate((row) => {
    const context = row.querySelector(".skill-slot__context");
    const description = row.querySelector(".skill-slot__description");
    const styles = getComputedStyle(description);
    return {
      contextFits: context.scrollWidth <= context.clientWidth,
      descriptionHeight: description.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(styles.lineHeight),
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layout.contextFits).toBe(true);
  expect(layout.pageFits).toBe(true);
  expect(layout.descriptionHeight).toBeLessThanOrEqual(layout.lineHeight * 2 + 2);

  await expect(page.getByLabel("选择特性结算")).toContainText("仅第一段触发应对");
});

test("calculates Stone Lizard family's Skin Spikes as a selectable trait source", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  await attackerPicker.fill("石冠王蜥");
  await page.getByRole("option", { name: /^石冠王蜥\s/ }).click();
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const traitSource = page.getByRole("group", {
    name: "攻击方特性伤害刺肤",
  });
  await expect(traitSource).toBeVisible();
  await expect(traitSource).toContainText("无·特性");
  await expect(traitSource).toContainText("50");
  await traitSource.click();
  await expect(
    page.getByRole("group", {
      name: "攻击方特性伤害刺肤，当前选中",
    }),
  ).toBeVisible();

  const hitCount = page.getByRole("spinbutton", {
    name: "攻击方刺肤连击次数",
  });
  await hitCount.fill("3");
  await expect(hitCount).toHaveValue("3");
  await expect(page.getByText("特性造成伤害", { exact: true })).toBeVisible();
  await expect(page.getByText("刺肤", { exact: true }).last()).toBeVisible();
});

test("keeps Dimo-family trait stacks synchronized in both damage directions", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "幻影荆棘");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const stackInputs = page.getByRole("spinbutton", { name: "触发层数" });
  await expect(stackInputs).toHaveCount(2);
  await expect(page.getByText("圣光迪莫 · 裁决", { exact: true })).toBeVisible();
  await stackInputs.first().fill("4");
  await expect(stackInputs.first()).toHaveValue("4");
  await expect(stackInputs.last()).toHaveValue("4");

  await page.reload();
  await selectSpirit(page, "攻击方", "幻影荆棘");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();
  const restoredInputs = page.getByRole("spinbutton", { name: "触发层数" });
  await expect(restoredInputs.first()).toHaveValue("4");
  await expect(restoredInputs.last()).toHaveValue("4");
});

test("derives Comet power from one shared, editable current-HP value", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "黑猫密探");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const skill = page.getByRole("combobox", { name: "攻击方技能1" });
  await skill.fill("彗星");
  await page
    .getByRole("option")
    .filter({ hasText: "彗星" })
    .first()
    .click();

  const percent = page.getByRole("spinbutton", {
    name: "攻击方生命百分比",
  });
  await expect(percent).toHaveValue("100");
  await percent.fill("50");
  await expect(
    page.getByRole("spinbutton", { name: "攻击方技能1威力" }),
  ).toHaveValue("140");

  await page.getByRole("button", { name: "按当前值输入" }).click();
  const currentHp = page.getByRole("spinbutton", {
    name: "攻击方当前生命",
  });
  await expect(currentHp).toHaveValue("212");
  await expect(
    page.locator('output[aria-label^="攻击方彗星攻击圣光迪莫"]'),
  ).toHaveAttribute("data-status", "ready");
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
