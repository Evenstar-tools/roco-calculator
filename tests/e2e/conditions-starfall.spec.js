import { expect, test } from "@playwright/test";
import { resetUiuxStorage, selectSpirit, setViewMode } from "./helpers/uiux-helpers.js";

async function selectSkill(page, name, index = 1) {
  const input = page.getByRole("combobox", { name: `攻击方技能${index}`, exact: true });
  await input.fill(name);
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
}

async function configureCounter(page) {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "烈火战神");
  await selectSpirit(page, "防御方", "玳塔");
  await selectSkill(page, "暗突袭");
  return page.locator(".compact-skill-side--attacker .compact-skill__damage").first();
}

test("compact conditions preserve edits across detailed mode, undo and reload", async ({ page }) => {
  const damage = await configureCounter(page);
  const initial = Number(await damage.innerText());
  const trigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const counter = dialog.getByRole("checkbox", { name: /触发应对/ });
  await expect(counter).not.toBeChecked();
  await counter.check();
  await expect.poll(async () => Number(await damage.innerText())).toBeGreaterThan(initial);
  const boosted = Number(await damage.innerText());
  await page.keyboard.press("Tab");
  await expect(page.locator(".app-header--compact")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await setViewMode(page, "具体版");
  await expect(page.getByRole("checkbox", { name: /攻击方技能1触发应对/ })).toBeChecked();
  await setViewMode(page, "精简版");
  await expect(damage).toHaveText(String(boosted));
  await page.getByRole("button", { name: /撤回上一步/ }).click();
  await expect(damage).toHaveText(String(initial));
  await trigger.click();
  await dialog.getByRole("checkbox", { name: /触发应对/ }).check();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(damage).toHaveText(String(boosted));
  await trigger.click();
  await expect(page.getByRole("dialog").getByRole("checkbox", { name: /触发应对/ })).toBeChecked();
});

test("compact conditions keep trait and skill starfall inputs on the same target", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "祭礼巨像");
  await selectSpirit(page, "防御方", "玳塔");
  await selectSkill(page, "多维击打");
  const skillTrigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
  await skillTrigger.click();
  const dialog = page.getByRole("dialog");
  const skillStacks = dialog.getByRole("spinbutton", { name: "敌方星陨印记", exact: true });
  await skillStacks.fill("3");
  await skillStacks.press("Tab");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "攻击方特性条件", exact: true }).click();
  const traitStacks = dialog.getByRole("spinbutton", { name: "敌方星陨层数", exact: true });
  await expect(traitStacks).toHaveValue("3");
  await traitStacks.fill("5");
  await traitStacks.press("Tab");
  await page.keyboard.press("Escape");
  await skillTrigger.click();
  await expect(skillStacks).toHaveValue("5");
});

test("compact conditions keep numeric trait controls readable in a narrow viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const damage = await configureCounter(page);
  const initial = Number(await damage.innerText());
  await page.getByRole("button", { name: "攻击方特性条件", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const uses = dialog.getByRole("spinbutton", { name: "火系技能使用次数", exact: true });
  await uses.fill("1");
  await uses.press("Tab");
  await expect.poll(async () => Number(await damage.innerText())).toBeGreaterThan(initial);
  const labels = await dialog.locator("label").evaluateAll((nodes) => nodes.map((node) => ({
    readable: Number.parseFloat(getComputedStyle(node).fontSize) >= 14,
    fits: node.scrollWidth <= node.clientWidth,
  })));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(({ readable, fits }) => readable && fits)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("compact-trait-390-light.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "攻击方特性条件", exact: true })).toContainText("1");
});

for (const [width, height, theme] of [[1920, 1080, "light"]]) {
  test(`compact conditions keep inputs and damage readable ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await configureCounter(page);
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const trigger = page.getByRole("button", { name: "攻击方技能1条件", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: /触发应对/ })).toBeVisible();
    const bounds = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { fits: node.scrollWidth <= node.clientWidth,
        inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        documentFits: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(bounds).toEqual({ fits: true, inViewport: true, documentFits: true });
    await page.screenshot({ path: testInfo.outputPath(`compact-${width}-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

async function configureStarfall(page, slot = 1) {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectSpirit(page, "攻击方", "祭礼巨像");
  await selectSpirit(page, "防御方", "玳塔");
  await selectSkill(page, "多维击打", slot);
}

for (const [width, height, theme] of [[1920, 1080, "light"], [390, 844, "light"], [320, 740, "dark"]]) {
  test(`compact conditions adapt every skill in the reported lineup ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await resetUiuxStorage(page);
    await page.goto("/");
    await selectSpirit(page, "攻击方", "烈火战神");
    await selectSpirit(page, "防御方", "稻草守护者");
    for (const [index, name] of ["水泡盾", "驱赶", "蹦跶", "甜心续航"].entries()) {
      await page.getByRole("combobox", { name: `防御方技能${index + 1}`, exact: true }).fill(name);
      await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
    }
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const side = page.locator(".compact-skill-side--defender");
    await expect(side.locator(".skill-follow-up")).toHaveCount(0);
    if (width <= 760) {
      await expect(page.locator(".compact-skill__row > .compact-condition-trigger:visible")).toHaveCount(0);
      const lastSkill = page.getByRole("combobox", { name: "防御方技能4", exact: true });
      await page.getByRole("button", { name: "清空防御方技能4", exact: true }).click();
      await expect(lastSkill).toHaveValue("");
      await lastSkill.fill("甜心续航");
      await page.getByRole("option", { name: /^甜心续航/ }).click();
      await expect(lastSkill).toHaveValue("甜心续航");
      const driveDamage = page.getByRole("group", { name: /^防御方技能2(?:，当前选中)?$/ }).locator(".compact-skill__damage");
      const initialDamage = Number(await driveDamage.innerText());
      await setViewMode(page, "具体版");
      await page.getByRole("button", { name: "防御", exact: true }).click();
      await page.getByRole("combobox", { name: "防御方技能2选择效果", exact: true }).selectOption("counter");
      await page.getByRole("checkbox", { name: "防御方技能2触发应对", exact: true }).check();
      await setViewMode(page, "精简版");
      await expect.poll(async () => Number(await driveDamage.innerText())).toBeGreaterThan(initialDamage);
      const boosted = await driveDamage.innerText();
      await setViewMode(page, "具体版");
      await page.getByRole("button", { name: "防御", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "防御方技能2选择效果", exact: true })).toHaveValue("counter");
      await expect(page.getByRole("checkbox", { name: "防御方技能2触发应对", exact: true })).toBeChecked();
      await setViewMode(page, "精简版");
      await expect(driveDamage).toHaveText(boosted);
      await expect(page.locator(".compact-skill__row > .compact-condition-trigger:visible")).toHaveCount(0);
      const rows = await page.locator(".compact-skill__row:not(.compact-skill__row--trait)").evaluateAll((nodes) => nodes.map((node) => {
        const input = node.querySelector(".skill-picker input");
        const picker = node.querySelector(".skill-picker");
        const result = node.querySelector(".compact-skill__result");
        const style = getComputedStyle(input);
        const context = document.createElement("canvas").getContext("2d");
        context.font = style.font;
        return {
          originalColumns: getComputedStyle(node).gridTemplateColumns.split(/\s+/).length === 4,
          nameFits: context.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1,
          nameWidth: picker.getBoundingClientRect().width >= 105,
          resultWidth: result.getBoundingClientRect().width >= 74,
          resultFits: result.scrollWidth <= result.clientWidth,
          rowFits: node.scrollWidth <= node.clientWidth,
        };
      }));
      expect(rows).toHaveLength(8);
      expect(rows.every((row) => Object.values(row).every(Boolean))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await side.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`adapt-list-${width}-${theme}.png`) });
      return;
    }
    for (const index of [2, 3, 4]) {
      await page.getByRole("button", { name: `防御方技能${index}条件`, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("footer")).toHaveCount(0);
      if (index === 2) {
        await dialog.getByRole("combobox", { name: "选择效果" }).selectOption("counter");
        await dialog.getByRole("checkbox", { name: "触发应对" }).check();
        await expect(dialog).toContainText("70 + 140 = 210");
      } else await expect(dialog).toContainText("状态效果未接入");
      await page.keyboard.press("Escape");
    }
    await side.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`adapt-list-${width}-${theme}.png`) });
    await page.getByRole("button", { name: "防御方技能1条件", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "防御应对成功" }).check();
    await dialog.getByRole("button", { name: "使用技能", exact: true }).click();
    await expect(dialog).toContainText("攻击+7层");
    await expect(dialog).toContainText("减伤80%");
    await expect(dialog.getByRole("button", { name: "解除状态", exact: true })).toBeEnabled();
    const layout = await dialog.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { fits: node.scrollWidth <= node.clientWidth, inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        labelsFit: [...node.querySelectorAll("label")].every((label) => label.scrollWidth <= label.clientWidth),
        documentFits: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(layout).toEqual({ fits: true, inside: true, labelsFit: true, documentFits: true });
    await page.screenshot({ path: testInfo.outputPath(`adapt-defense-${width}-${theme}.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /撤回上一步/ }).click();
    await page.getByRole("button", { name: "防御方技能1条件", exact: true }).click();
    await expect(dialog).not.toContainText("已用 1 次");
  });
}

test("compact conditions expose repeat counts, branch health and expandable burst sources on desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await configureCounter(page);
  await selectSkill(page, "吹火");
  const open = async () => {
    await page.getByRole("button", { name: "攻击方技能1条件", exact: true }).click();
    return page.getByRole("dialog");
  };
  let dialog = await open();
  await dialog.getByRole("button", { name: "此前使用次数增加" }).click();
  await expect(dialog.getByRole("spinbutton", { name: "此前使用次数" })).toHaveValue("1");
  await dialog.getByRole("button", { name: "此前使用次数重置" }).click();
  await expect(dialog.getByRole("spinbutton", { name: "此前使用次数" })).toHaveValue("0");
  await page.screenshot({ path: testInfo.outputPath("adapt-count-1920.png") });
  await page.keyboard.press("Escape");
  await selectSkill(page, "下注");
  dialog = await open();
  await expect(dialog.getByRole("spinbutton", { name: "自身生命百分比" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "选择效果" }).selectOption("lowHp");
  await dialog.getByRole("spinbutton", { name: "自身生命百分比" }).fill("50");
  await dialog.getByRole("combobox", { name: "选择效果" }).selectOption("fixed");
  await expect(dialog.getByRole("spinbutton", { name: "自身生命百分比" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "选择效果" }).selectOption("lowHp");
  await expect(dialog.getByRole("spinbutton", { name: "自身生命百分比" })).toHaveValue("50");
  await page.screenshot({ path: testInfo.outputPath("adapt-health-1920.png") });
  await page.keyboard.press("Escape");
  await selectSkill(page, "雷暴");
  dialog = await open();
  await dialog.getByLabel("攻击方技能1条件选择迸发来源", { exact: true }).click();
  const source = dialog.getByRole("checkbox", { name: /（迸发来源）$/ }).last();
  await source.check();
  await expect(source).toBeChecked();
  expect(await dialog.locator(".burst-source-controls__menu label").evaluateAll((labels) => labels.every((label) =>
    Number.parseFloat(getComputedStyle(label).fontSize) >= 14 && label.scrollWidth <= label.clientWidth))).toBe(true);
  await expect(dialog.getByLabel("攻击方技能1条件选择迸发来源", { exact: true })).toContainText("已选 1");
  await page.screenshot({ path: testInfo.outputPath("adapt-burst-1920.png") });
  await page.keyboard.press("Escape");
});

async function openStarfall(page, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "展开伤害结果", exact: true }).click();
  await page.getByRole("button", { name: "星陨斩杀线", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "星陨斩杀线", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^填入 \d+ 层$/ })).toBeEnabled();
  return dialog;
}

test("starfall thresholds apply the real minimum to the chosen slot and undo in one step", async ({ page }) => {
  await configureStarfall(page, 2);
  const dialog = await openStarfall(page);
  const apply = dialog.getByRole("button", { name: /^填入 \d+ 层$/ });
  const minimum = Number((await apply.innerText()).match(/\d+/)[0]);
  await dialog.getByRole("spinbutton", { name: "试算星陨层数" }).fill("99");
  await expect(page.locator(".compact-skill-side--attacker .compact-skill__damage").first()).not.toContainText("NaN");
  await apply.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "四技能", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("combobox", { name: "攻击方技能2", exact: true })).toHaveValue("多维击打");
  await expect(page.getByRole("group", { name: "攻击方技能2，当前选中", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "攻击方技能2条件", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "敌方星陨印记", exact: true })).toHaveValue(String(minimum));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /撤回上一步/ }).click();
  await page.getByRole("button", { name: "攻击方技能2条件", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "敌方星陨印记", exact: true })).toHaveValue("0");
});

test("starfall thresholds choose cultivation then restore the actual target before recalculating", async ({ page }) => {
  await configureStarfall(page);
  await page.getByRole("checkbox", { name: "防御方物防个体加点", exact: true }).uncheck();
  const dialog = await openStarfall(page);
  await dialog.getByRole("textbox", { name: "搜索星陨斩杀精灵" }).fill("玳塔");
  await dialog.getByRole("button", { name: "选择玳塔培养", exact: true }).click({ timeout: 60_000 });
  await dialog.getByRole("button", { name: /^代入生防/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".starfall-current")).toContainText("按当前血量、减伤与特性");
  await expect(dialog.getByRole("button", { name: /^填入 \d+ 层$/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("checkbox", { name: "防御方生命个体加点", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "防御方物防个体加点", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "防御方魔防个体加点", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "防御方普通性格", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /撤回上一步/ }).click();
  await expect(page.getByRole("checkbox", { name: "防御方物防个体加点", exact: true })).not.toBeChecked();
});

test("starfall thresholds finish the full form table and keep search available", async ({ page }) => {
  test.setTimeout(90_000);
  await configureStarfall(page);
  const dialog = await openStarfall(page);
  await expect(dialog.locator(".starfall-progress")).toHaveText(/^\d+ 只精灵／形态$/, { timeout: 70_000 });
  await dialog.getByRole("textbox", { name: "搜索星陨斩杀精灵" }).fill("水灵");
  await expect(dialog.getByRole("button", { name: "选择水灵培养", exact: true })).toBeVisible();
  await expect(dialog.locator(".starfall-row").first()).not.toContainText("NaN");
  await dialog.getByRole("button", { name: "清空星陨搜索" }).click();
  await expect(dialog.locator(".starfall-item")).toHaveCount(60);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const [width, height, theme] of [[1920, 1080, "light"], [390, 844, "light"], [320, 740, "dark"]]) {
  test(`starfall thresholds keep the real table and cultivation actions readable ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await configureStarfall(page);
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const dialog = await openStarfall(page, width < 761);
    await dialog.getByRole("textbox", { name: "搜索星陨斩杀精灵" }).fill("玳塔");
    await dialog.getByRole("button", { name: "选择玳塔培养", exact: true }).click({ timeout: 60_000 });
    await expect(dialog.getByRole("button", { name: /^代入纯肉/ })).toBeVisible();
    const layout = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { fits: node.scrollWidth <= node.clientWidth, inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        tableFits: node.querySelector(".starfall-table-scroll").scrollWidth <= node.querySelector(".starfall-table-scroll").clientWidth };
    });
    expect(layout).toEqual({ fits: true, inViewport: true, tableFits: true });
    await page.screenshot({ path: testInfo.outputPath(`starfall-${width}-${theme}.png`) });
    if (width === 320) {
      await dialog.getByRole("button", { name: /^代入纯肉/ }).click();
      await expect(dialog.getByRole("button", { name: /^填入 \d+ 层$/ })).toBeEnabled();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
