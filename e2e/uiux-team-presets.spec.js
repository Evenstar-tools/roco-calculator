import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-storage-initialized")) return;
    localStorage.removeItem("rock-calculator.spirit-configs.v1");
    localStorage.removeItem("rock-calculator.spirit-configs.v2");
    localStorage.removeItem("rock-calculator.favorites.v1");
    localStorage.removeItem("rock-calculator.teams.v1");
    localStorage.removeItem("rock-calculator.settings.type-coverage.v1");
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
    sessionStorage.setItem("e2e-storage-initialized", "1");
  });
});

test("first-run guide appears once, can be replayed, and imports popular configs", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("first-run-guide-e2e")) return;
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
    sessionStorage.setItem("first-run-guide-e2e", "1");
  });
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 2/6" })).toBeVisible();
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("button", { name: "具体版" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("以后修改性格、个体和技能，都会继续记住"))
    .toBeVisible();
  await page.getByRole("button", { name: "导入并完成" }).click();
  await expect(page.getByText(/已导入 \d+ 只常用配置/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: /新手引导/ })).toHaveCount(0);
  expect(await page.evaluate(() =>
    localStorage.getItem("rock-calculator.first-run-guide.v1"),
  )).toBe("1");

  await page.reload();
  await expect(page.getByRole("dialog", { name: /新手引导/ })).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "新手引导" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
});

test("captures the selected onboarding design at the desktop viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-step-1.png",
  });
  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 6/6" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-step-6.png",
  });
});

test("resizes the picker spotlight without blocking dropdown or page wheel scrolling", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const spotlight = page.locator(".first-run-guide__spotlight");
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  const attackerRoot = page.locator('[data-guide-root="attacker"]');
  const attackerSearch = attackerRoot.locator('[data-guide-target="attacker"]');
  const initialSpotlight = await spotlight.boundingBox();
  const searchBox = await attackerSearch.boundingBox();
  expect(initialSpotlight.height).toBeLessThan(60);
  expect(initialSpotlight.y).toBeLessThanOrEqual(searchBox.y);

  await attackerPicker.click();
  const options = attackerRoot.locator('[data-guide-part="options"]');
  await expect(options).toBeVisible();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(250);
  const beforeListScroll = await options.evaluate((node) => node.scrollTop);
  await options.hover();
  await page.mouse.wheel(0, 520);
  await expect.poll(async () => options.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(beforeListScroll);

  await attackerPicker.fill("音速犬");
  await page.getByRole("option", { name: /^音速犬/ }).click();
  const selection = attackerRoot.locator('[data-guide-part="selection"]');
  const selectionBox = await selection.boundingBox();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(selectionBox.height);
  const selectedSpotlight = await spotlight.boundingBox();
  expect(selectedSpotlight.y).toBeLessThanOrEqual(searchBox.y);
  expect(selectedSpotlight.y + selectedSpotlight.height)
    .toBeGreaterThanOrEqual(selectionBox.y + selectionBox.height);

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.testScrollSpacer = "true";
    spacer.style.height = "900px";
    document.querySelector("main")?.append(spacer);
  });
  const beforePageScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1100, 700);
  await page.mouse.wheel(0, 520);
  await expect.poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(beforePageScroll);

  await page.getByRole("button", { name: "下一步" }).click();
  const defenderPicker = page.getByRole("combobox", { name: "防御方精灵" });
  await defenderPicker.click();
  const defenderRoot = page.locator('[data-guide-root="defender"]');
  await expect(defenderRoot.locator('[data-guide-part="options"]')).toBeVisible();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(250);
  await defenderPicker.fill("水灵");
  await page.getByRole("option", { name: /^水灵/ }).click();
  const defenderSelection = defenderRoot.locator('[data-guide-part="selection"]');
  const defenderSelectionBox = await defenderSelection.boundingBox();
  const defenderSpotlight = await spotlight.boundingBox();
  expect(defenderSpotlight.y + defenderSpotlight.height)
    .toBeGreaterThanOrEqual(defenderSelectionBox.y + defenderSelectionBox.height);
});

test("keeps the six-step guide aligned in a narrow viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const card = page.locator(".first-run-guide__card");
  const spotlight = page.locator(".first-run-guide__spotlight");
  const expectInsideViewport = async (locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  };
  const expectSeparated = async (first, second) => {
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    const overlaps = !(
      firstBox.x + firstBox.width <= secondBox.x ||
      secondBox.x + secondBox.width <= firstBox.x ||
      firstBox.y + firstBox.height <= secondBox.y ||
      secondBox.y + secondBox.height <= firstBox.y
    );
    expect(overlaps).toBe(false);
  };

  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);

  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();

  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 3/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 4/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);
  const skillSpotlight = await spotlight.boundingBox();
  expect(skillSpotlight.height).toBeLessThan(90);
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-mobile-step-4.png",
  });

  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 6/6" })).toBeVisible();
  await expectInsideViewport(card);
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

test("keeps Dazzling's seven slots readable and exposes Refraction effects", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "彩虹独角兽");
  await selectSpirit(page, "防御方", "水灵");

  const compactSeventh = page.getByRole("combobox", { name: "攻击方技能7" });
  await expect(compactSeventh).toBeVisible();
  expect(
    await page.locator(".compact-skill-side--attacker .compact-skill__row")
      .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth)),
  ).toBe(true);

  await expect(page.locator(".compact-skill__effect-hint")).toContainText(
    "普·威力+10",
  );

  await page.getByRole("button", { name: "具体版" }).click();
  await expect(page.getByRole("combobox", { name: "攻击方技能7" })).toBeVisible();
  const hint = page.locator(".skill-slot__effect-hint");
  await expect(hint).toContainText("普·威力+10");
  expect(await hint.evaluate((node) => getComputedStyle(node).webkitLineClamp))
    .toBe("2");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  await page.setViewportSize({ height: 844, width: 390 });
  const mobileSeventh = page.getByRole("combobox", { name: "攻击方技能7" });
  await mobileSeventh.scrollIntoViewIfNeeded();
  await expect(mobileSeventh).toBeVisible();
  expect(
    await page.locator(".four-skill-side--attacker .skill-slot-group")
      .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth)),
  ).toBe(true);
  const lastSlotBox = await mobileSeventh.boundingBox();
  const resultBarBox = await page.getByRole("button", {
    name: "展开伤害结果",
  }).boundingBox();
  expect(lastSlotBox.y + lastSlotBox.height).toBeLessThanOrEqual(resultBarBox.y);
});

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

test("applies and remembers Meteor Bug contract ball effects", async ({ page }) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "陨星虫");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("啃咬");
  await page.getByRole("option", { name: /啃咬/ }).click();
  const ball = page.getByRole("combobox", { name: "咕噜球" });
  await ball.selectOption("beautiful");
  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "美妙球｜对方双攻 -30% · 威力 +20",
  );

  await ball.selectOption("prism");
  const prism = page.getByRole("combobox", { name: "棱镜效果" });
  await expect(prism).toBeVisible();
  await prism.selectOption("darkstar");
  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "棱镜球（暗星球半值）",
  );

  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "攻击方", "陨星虫");
  await expect(page.getByRole("combobox", { name: "咕噜球" })).toHaveValue("prism");
  await expect(page.getByRole("combobox", { name: "棱镜效果" })).toHaveValue("darkstar");
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
  const actualPower = page.getByRole("spinbutton", { name: "实际威力" });
  await expect(actualPower).toHaveValue("80");
  await page
    .getByRole("checkbox", { name: "敌方本回合换精灵" })
    .check();
  await expect(
    page.locator("#single-skill-panel").getByText("80 + 100 = 180"),
  ).toBeVisible();
  await expect(actualPower).toHaveValue("180");

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

test("applies Wing Extension and combines Gale Turbine with one carried wing skill", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "凡鹰");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const first = page.getByRole("combobox", { name: "攻击方技能1" });
  await first.fill("先发制人");
  await page.getByRole("option").filter({ hasText: "先发制人" }).first().click();
  const turbine = page.getByRole("combobox", { name: "攻击方技能4" });
  await turbine.fill("疾风涡轮");
  await page.getByRole("option").filter({ hasText: "疾风涡轮" }).first().click();

  const firstRow = page.getByRole("group", { name: "攻击方技能1" });
  await expect(firstRow).toContainText("翼·物");
  const companion = page.getByRole("combobox", {
    name: "攻击方技能4前置翼技",
  });
  await companion.selectOption("1");
  await expect(page.getByLabel("选择特性结算")).toContainText("先发制人");
  await expect(page.getByLabel("选择特性结算")).toContainText("疾风涡轮");

  const turbineRow = page.getByRole("group", {
    name: "攻击方技能4，当前选中",
  });
  const layout = await turbineRow.evaluate((row) => ({
    pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    rowFits: row.scrollWidth <= row.clientWidth,
  }));
  expect(layout).toEqual({ pageFits: true, rowFits: true });
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
  await expect(traitSource.getByTitle("固定特性伤害")).toContainText("刺肤");
  expect(await traitSource.evaluate((row) => row.scrollWidth <= row.clientWidth))
    .toBe(true);
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
  await expect(page.getByText("特性", { exact: true })).toBeVisible();
  await expect(page.getByText("刺肤", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "精简版" }).click();
  const compactTraitSource = page.getByRole("group", {
    name: "攻击方特性伤害刺肤，当前选中",
  });
  await expect(compactTraitSource.getByTitle("固定特性伤害"))
    .toContainText("威力 50");
  expect(await compactTraitSource.evaluate((row) => row.scrollWidth <= row.clientWidth))
    .toBe(true);
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
    page.getByRole("spinbutton", { name: "攻击方技能1实际威力" }),
  ).toHaveValue("140");

  await page.getByRole("button", { name: "按当前值输入" }).click();
  const currentHp = page.getByRole("spinbutton", {
    name: "攻击方当前生命",
  });
  await expect(currentHp).toHaveValue("237");
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
  const actualPower = page.getByRole("spinbutton", { name: "实际威力" });
  const guardianBasePower = Number(
    await actualPower.inputValue(),
  );
  await page
    .getByRole("spinbutton", { name: "己方火系技能次数" })
    .fill("3");
  await expect
    .poll(async () =>
      Number(await actualPower.inputValue()),
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
    .getByRole("spinbutton", { name: "实际威力" })
    .fill("137");
  await page.getByRole("spinbutton", { name: "实际威力" }).press("Enter");

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
    page.getByRole("spinbutton", { name: "实际威力" }),
  ).toHaveValue("137");

  await selectSpirit(page, "攻击方", "水灵");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).not.toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "实际威力" }),
  ).not.toHaveValue("137");

  await selectSpirit(page, "攻击方", "音速犬");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "实际威力" }),
  ).toHaveValue("137");
});
