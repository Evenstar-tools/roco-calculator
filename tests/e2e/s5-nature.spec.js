import { expect, test } from "@playwright/test";
import { resetUiuxStorage, waitForAppReady } from "./helpers/uiux-helpers.js";

const toolPath = "/tools/s5-nature/index.html";

async function openTool(page) {
  await page.goto(toolPath);
  await expect(page.locator('#flow-result')).toBeVisible();
}

// 手机上野怪条件和出战配置各自收起，一次点开即可修改；桌面始终展开。
async function openConfig(page) {
  if (page.viewportSize().width <= 820) {
    for (const id of ['flow-wild-more', 'flow-own-summary']) {
      const toggle = page.locator(`#${id}`);
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    }
    await expect(page.locator('#flow-own-card')).toBeVisible();
    await expect(page.locator('#flow-wild-sub')).toBeVisible();
  }
}

async function selectProfile(page, id) {
  await openConfig(page);
  await page.locator('#profile-select').selectOption(id);
  await expect(page.locator('#profile-select')).toHaveValue(id);
}

// 低频配置操作收在“⋯”菜单里。
async function ownMenu(page, action) {
  await openConfig(page);
  await page.locator('#flow-own-menu-button').click();
  await page.locator(action === 'preset' ? '#load-own-preset' : `[data-own-menu="${action}"]`).click();
}
const loadPreset = page => ownMenu(page, 'preset');

// 桌面两种测法同页；手机切页签。
async function switchMethod(page, direction) {
  if (page.viewportSize().width <= 820) await page.locator(`[data-flow-tab="${direction}"]`).click();
  await expect(page.locator(`#flow-${direction}-card`)).toBeVisible();
}

async function editOwnSkill(page, index = 0) {
  if (page.viewportSize().width <= 820) {
    await page.locator(`[data-flow-skill="${index}"]`).click();
    const edit = page.locator(`[data-preview-row="${index}"] .flow-edit-skill`);
    if (await edit.getAttribute('aria-expanded') !== 'true') await edit.click();
  }
}

const AXIS_KEYS = { 生命: 'hp', 物防: 'physicalDefense', 魔防: 'magicalDefense', 物攻: 'physicalAttack', 魔攻: 'magicalAttack' };
function resultAxis(page, label) {
  return page.locator(`#flow-result [data-axis="${AXIS_KEYS[label]}"] > b`);
}

async function calculationPreview(page) {
  return page.evaluate(() => {
    const { uiVerdict: _uiVerdict, ...calculation } = window.pveNatureUi.getPreview();
    return calculation;
  });
}

test('S5 nature chess roots are searchable separately and keep color when returning from evolved forms', async ({ page }) => {
  test.setTimeout(60000);
  await openTool(page);
  const picker = page.getByRole('combobox', { name: '选择野生目标', exact: true });
  const options = page.locator('#target-picker-listbox [role="option"]');
  await picker.fill('棋棋');
  await expect(options.locator('strong')).toHaveText(['棋棋（白子）', '棋棋（黑子）']);
  const forms = [
    { name: '棋棋（黑子）', alias: '黑棋', id: 'spirit_28e59ee92341bf43', root: 3555, legacy: 'petbase-3556', evolved: '棋齐垒（黑子）' },
    { name: '棋棋（白子）', alias: '白棋', id: 'spirit_4e1344e0cfd82bf9', root: 3550, legacy: 'petbase-3551', evolved: '棋契陛下（白棋棋骑士分支）' },
  ];
  for (const form of forms) {
    await picker.click();
    await picker.fill(form.alias);
    await expect(options).toHaveCount(1);
    await options.getByText(form.name, { exact: true }).click();
    await expect(picker).toHaveValue(form.name);
    await expect(page.getByRole('combobox', { name: '野怪防御分支', exact: true })).toHaveCount(0);
    const target = await page.evaluate(async id => {
      const catalog = await (await fetch('./data/catalog.json')).json();
      return catalog.spirits.find(row => row.id === id);
    }, form.id);
    expect(target.wildStatForms).toBeUndefined();
    expect(target.wildDefenseRaceStats).toMatchObject({ sourcePetbaseId: form.root, defensePetbaseId: form.root,
      physicalDefense: target.raceStats.physicalDefense, magicalDefense: target.raceStats.magicalDefense });
    await switchMethod(page, 'incoming');
    const incoming = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
    await incoming.fill('猛烈撞击');
    await page.getByRole('option').getByText('猛烈撞击', { exact: true }).click();
    await expect(page.locator('#preview-cells-0 .dmg').first()).toHaveText(/^\d+$/);
    const baseline = await calculationPreview(page);
    expect(baseline.incomingList[0].status).toBe('estimated');
    expect(baseline.targetHpRange.min).toBeGreaterThan(0);
    await page.locator('#preview-incoming-damage-0').fill('75');
    await page.locator('#preview-incoming-damage-0').press('Tab');
    await page.evaluate(legacyId => {
      const session = window.pveNatureUi.getSession();
      session.wildStatFormId = legacyId;
      window.pveNatureUi.setSession(session);
    }, form.legacy);
    expect(await calculationPreview(page)).toEqual(baseline);
    await page.reload();
    await expect(page.locator('#flow-result')).toBeVisible();
    await expect(picker).toHaveValue(form.name);
    await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('75');
    expect(await calculationPreview(page)).toEqual(baseline);
    await page.locator('#target-filter').selectOption('all');
    await picker.fill(form.evolved);
    await expect(options).toHaveCount(1);
    await options.getByText(form.name, { exact: true }).click();
    await expect(picker).toHaveValue(form.name);
    await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('75');
    const session = await page.evaluate(() => window.pveNatureUi.getSession());
    expect(session.targetId).toBe(form.id);
    expect(session.wildStatFormId).toBe(form.legacy);
  }
  await page.locator('#target-filter').selectOption('all');
  for (const form of forms) {
    await picker.click();
    await picker.fill(form.evolved);
    await expect(options).toHaveCount(1);
    await options.getByText(form.name, { exact: true }).click();
    await expect(picker).toHaveValue(form.name);
    expect(await page.evaluate(() => window.pveNatureUi.getSession().wildStatFormId)).toBe('');
  }
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(picker).toHaveValue('棋棋（白子）');
  await page.locator('#target-filter').selectOption('all');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openConfig(page);
    await picker.click();
    await picker.fill('棋棋');
    await expect(options).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-chess-targets-${width}.png`, fullPage: true });
    await picker.press('Escape');
  }
});


test('S5 nature offers three initial-form scopes, supported shiny targets and contained controls', async ({ page }) => {
  test.setTimeout(60000);
  const names = ['绒绒', '犀角鸟', '小雪人', '爆焰仔', '咬咬小子', '足尖元件', '热团团', '新月鹭', '地银链', '沉金兽'];
  await openTool(page);
  const filter = page.locator('#target-filter');
  await expect(filter).toHaveValue('all');
  expect(await filter.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['all', 'shiny', 'battlepass']);
  await expect(filter.locator('option[value=all]')).toContainText('全部精灵');
  await expect(filter.locator('option[value=shiny]')).toHaveText(/S2\s*\/\s*S5.*异色/);
  await expect(filter.locator('option[value=battlepass]')).toHaveText(/通行证.*火红尾.*江豚/);
  const source = await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const seasons = await (await fetch('./data/season-targets.json')).json();
    const group = catalog.targetGroups.find(row => row.id === 'battlepass');
    return { group, fallback: seasons.groups.find(row => row.id === 'battlepass'),
      spirits: catalog.spirits.filter(row => group.spiritIds.includes(row.id)) };
  });
  expect(source.group).toEqual(source.fallback);
  expect(source.group.spiritIds).toHaveLength(10);
  expect(new Set(source.group.spiritIds).size).toBe(10);
  expect(source.group.families.map(row => row.name)).toEqual(names);
  expect(source.spirits.every(row => row.stage === '一阶')).toBe(true);
  expect(Object.fromEntries(source.spirits.map(row => [row.name, row.wildStrengthStage]))).toEqual({
    '绒绒': 1, '犀角鸟': 1, '小雪人': 2, '爆焰仔': 2, '咬咬小子': 2,
    '足尖元件': 2, '热团团': 1, '新月鹭': 1, '地银链': 1, '沉金兽': 1,
  });
  const scopeNames = [...names, '火红尾', '云梦豚'];
  for (const name of scopeNames) {
    await chooseTarget(page, name);
    const expected = source.spirits.find(row => row.name === name);
    if (expected) expect(await page.evaluate(() => window.pveNatureUi.getSession().targetId)).toBe(expected.id);
    await expect(page.locator('#target-hp-range [data-hp-nature="neutral"] .hp-state-label')).toHaveAttribute('aria-label', '生命不变');
  }
  await page.locator('#target-filter').selectOption('battlepass');
  const picker = page.getByRole('combobox', { name: '选择野生目标', exact: true });
  await picker.click();
  const options = page.locator('#target-picker-listbox [role="option"]');
  await expect(options).toHaveCount(12);
  expect((await options.locator('strong').allTextContents()).sort()).toEqual([...scopeNames].sort());
  await picker.fill('沉金');
  await expect(options).toHaveCount(1);
  await expect(options).toContainText('沉金兽');
  await picker.press('Escape');
  await filter.selectOption('shiny');
  for (const target of ['恶魔叮', '深蓝鲸']) await chooseTarget(page, target);
  const shiny = page.locator('#target-shiny');
  await expect(shiny).toBeVisible();
  await shiny.check();
  await expect(shiny).toBeChecked();
  await filter.selectOption('all');
  await chooseTarget(page, '棋棋（白子）');
  await expect(shiny.locator('..')).toBeHidden();
  expect(await page.evaluate(() => window.pveNatureUi.getSession().preview.shiny)).toBe(false);
  const ordinaryHp = await page.locator('#target-hp-range').textContent();
  // Old saves can contain a checked shiny flag for an unsupported target.
  await page.evaluate(() => {
    const session = window.pveNatureUi.getSession();
    session.preview.shiny = true;
    window.pveNatureUi.setSession(session);
  });
  await expect(shiny.locator('..')).toBeHidden();
  expect(await page.evaluate(() => window.pveNatureUi.getSession().preview.shiny)).toBe(false);
  await expect(page.locator('#target-hp-range')).toHaveText(ordinaryHp);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.pveNatureUi));
  await expect(shiny.locator('..')).toBeHidden();
  expect(await page.evaluate(() => window.pveNatureUi.getSession().preview.shiny)).toBe(false);
  await expect(page.locator('#target-hp-range')).toHaveText(ordinaryHp);
  await page.locator('#target-filter').selectOption('battlepass');
  await chooseTarget(page, '沉金兽');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openConfig(page);
    await picker.click();
    await expect(options).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectWildControlsContained(page);
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-battlepass-targets-${width}.png` });
    await picker.press('Escape');
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-target-scope-closed-${width}.png` });
  }
  await filter.selectOption('all');
  await chooseTarget(page, '缇塔');
  await setDice(page, 'target', 'game-dice-effect-15');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openConfig(page);
    await expectWildControlsContained(page);
    await expect(shiny).toBeVisible();
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-target-scope-${width}.png`, fullPage: true });
  }
});

async function expectWildControlsContained(page) {
  const outside = await page.locator('#flow-wild-card').evaluate(side => {
    const bounds = side.getBoundingClientRect();
    return [...side.querySelectorAll('#target-picker, #target-filter, #level-seg, #target-hp-range, .dice-ui, .switch-label, input, select')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .filter(node => { const rect = node.getBoundingClientRect(); return rect.left < bounds.left - 1 || rect.right > bounds.right + 1; })
      .map(node => node.id || node.className);
  });
  expect(outside).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('S5 nature type dice calculate single resistance and preserve entered power without double counting', async ({ page }) => {
  await openTool(page);
  await selectProfile(page, 'luoyin');
  await loadPreset(page);
  await chooseTarget(page, '伊雷龙');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '42', exact: true }).click();
  await setDice(page, 'own', 'none');
  await setDice(page, 'target', 'game-dice-effect-8');
  const fire = () => page.evaluate(() => window.pveNatureUi.getPreview().outgoing[0]);
  const automatic = await fire();
  expect(automatic.skillName).toBe('火焰切割');
  expect(automatic.status).toBe('estimated');
  expect(automatic.displayedPower).toBe(40);
  expect(automatic.effectivePower).toBe(72);
  expect(automatic.predictions.find(row => row.upStat === 'physicalDefense').damage).toBe(133);
  await expect(page.locator('#preview-cells-0 .dmg').first()).toHaveText(/^\d+$/);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#target-dice')).toHaveValue('game-dice-effect-8');
  await page.locator('#preview-condition-0-gear').click();
  await page.locator('#preview-condition-0-displayedPower').fill('40');
  await page.locator('#preview-condition-0-displayedPower').press('Tab');
  expect((await fire()).predictions.map(row => row.damage)).toEqual(automatic.predictions.map(row => row.damage));
  await page.locator('#preview-condition-0-gear').click();
  await setDice(page, 'target', 'game-dice-effect-15');
  expect((await fire()).effectivePower).toBe(72);
  await page.locator('#preview-condition-0-gear').click();
  await page.locator('#preview-condition-0-resetPower').click();
  expect((await fire()).displayedPower).toBe(25);
  expect((await fire()).effectivePower).toBe(45);
  await page.locator('#preview-condition-0-gear').click();
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-type-dice-single-relation.png', fullPage: true });
});

test("S5 nature display power and conditional attacks calculate immediately without duplicate boosts", async ({ page }) => {
  await openTool(page);
  await expect(page.getByRole('heading', { name: 'S5奇遇性格计算', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('S5奇遇性格计算 · 洛克计算器');
  await chooseTarget(page, '可爱猿');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '41', exact: true }).click();
  await page.locator('#star-seg').getByRole('button', { name: '10★', exact: true }).click();
  await page.locator('#nature-picker-trigger').click();
  await page.getByRole('textbox', { name: '搜索性格', exact: true }).fill('固执');
  await page.locator('[data-nature-id="adamant"]').click();
  await clearOwnIvs(page);
  for (const stat of ['hp', 'physicalAttack', 'magicalDefense']) await page.locator(`[data-iv-stat="${stat}"]`).click();
  const skillPicker = page.getByRole('combobox', { name: '我方技能 1', exact: true });
  await skillPicker.fill('火焰切割');
  await page.getByRole('option').getByText('火焰切割', { exact: true }).click();
  const base = page.locator('#preview-cells-0 [data-defense-band="neutral"]');
  await expect(base.locator('.dmg')).toHaveText('103');
  await expect(base.locator('[data-hp-nature="up"] b')).toHaveText('77%');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 100');
  await setDice(page, 'own', 'custom');
  await page.locator('#own-dice-physicalAttackMultiplier').fill('1.1');
  await page.locator('#own-dice-physicalAttackMultiplier').press('Tab');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 110');
  await expect(base.locator('.dmg')).toHaveText('113');
  const condition = page.locator('#preview-condition-0-gear');
  await condition.click();
  const power = page.locator('#preview-condition-0-displayedPower');
  await power.fill('110');
  await power.press('Tab');
  await expect(base.locator('.dmg')).toHaveText('113');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('手填');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(power).toHaveValue('110');
  await expect(base.locator('.dmg')).toHaveText('113');
  await condition.click();
  await power.fill('60.5');
  await power.press('Tab');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 60.5');
  await power.fill('');
  await power.press('Tab');
  await expect(base.locator('.dmg')).toHaveText('113');

  // Loading an old session must preserve its final-power meaning and give a
  // visible way to leave it, rather than silently treating it as skill-bar power.
  await page.evaluate(() => {
    const session = window.pveNatureUi.getSession();
    const own = session.profiles.find(p => p.id === session.activeProfileId) ?? session.profiles[0];
    own.preview.skillOverrides[own.preview.skillIds[0]] = { effectivePower: 90 };
    window.pveNatureUi.setSession(session);
  });
  await expect(page.locator('#preview-condition-0-legacyPower-label')).toHaveText('最终威力 90 · 已含系别与觉醒');
  await page.locator('#preview-condition-0-resetPower').click();
  await expect(page.locator('#preview-condition-0-legacyPower')).toBeHidden();
  await expect(base.locator('.dmg')).toHaveText('113');
  await setDice(page, 'own', 'none');
  await chooseTarget(page, '伊雷龙');
  await expect(base.locator('.dmg')).toHaveText('182');
  await expect(base.locator('[data-hp-nature="up"] b')).toHaveText('57%');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 50');
  // Conditional damage moves must produce numbers as soon as selected.
  await skillPicker.fill('先发制人');
  await page.getByRole('option').getByText('先发制人', { exact: true }).click();
  await expect(base.locator('.dmg')).toHaveText('111');
  await expect(base.locator('[data-hp-nature="up"] b')).toHaveText('74%');
  await expect(power).toHaveValue('');
  await page.locator('#preview-observed-0').fill('111');
  await page.locator('#preview-observed-0').press('Tab');
  await expect(base).toHaveClass(/\bhit\b/);
  await expect(page.locator('#flow-result .flow-verdict')).not.toHaveText('有读数未吻合');
  const secondPicker = page.getByRole('combobox', { name: '我方技能 2', exact: true });
  await secondPicker.fill('地刺');
  await page.getByRole('option').getByText('地刺', { exact: true }).click();
  const ground = page.locator('#preview-cells-1 [data-defense-band="neutral"]');
  await expect(ground.locator('.dmg')).toHaveText('364');
  await expect(ground.locator('[data-hp-nature="up"] b')).toHaveText('13%');
  await expect(page.locator('#preview-skill-meta-1')).toContainText('显示威力 180');
  await expect(page.locator('#preview-condition-1-displayedPower')).toHaveValue('');
  await page.keyboard.press('Escape');
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await condition.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-conditional-power-${width}.png` });
  }
});

async function clearOwnIvs(page) {
  await openConfig(page);
  for (const stat of ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed']) {
    const button = page.locator(`[data-iv-stat="${stat}"]`);
    if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  }
}

async function setDice(page, side, id) {
  await openConfig(page);
  const toggle = page.locator(`#${side}-dice-ui [data-dice-switch]`);
  if (id === 'none') await toggle.uncheck();
  else {
    await toggle.check();
    await page.locator(`#${side}-dice`).selectOption(id);
  }
}

async function chooseTarget(page, name) {
  await openConfig(page);
  const picker = page.getByRole("combobox", { name: "选择野生目标", exact: true });
  await picker.click();
  await picker.fill(name);
  await page.getByRole("option").getByText(name, { exact: true }).click();
  await expect(picker).toHaveValue(name);
}

async function expectHp(page, values) {
  for (const [index, nature] of ["neutral", "up", "down"].entries()) {
    await expect(page.locator(`#target-hp-range [data-hp-nature="${nature}"] b`)).toHaveText(String(values[index]));
  }
}

test("S5 nature CN toolbox opens encounter HP with shiny and responsive assets", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/cn/");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  const calculations = page.getByRole("navigation", { name: "工具箱", exact: true })
    .getByRole("region", { name: "计算", exact: true });
  const entry = calculations.getByRole("link", { name: "S5奇遇性格计算", exact: true });
  await expect(entry).toHaveAttribute("href", toolPath);
  await expect(entry).toHaveClass("app-menu__nature-tool");
  expect(await entry.evaluate(node => getComputedStyle(node).gridColumn)).toBe("1 / -1");
  await entry.click();
  await expect(page).toHaveURL(/\/tools\/s5-nature\/index\.html$/);
  await expect(page.getByRole("heading", { name: "S5奇遇性格计算", exact: true })).toBeVisible();
  await expect(page.locator("#target-hp-range [data-hp-nature=up] b")).toHaveText(/^\d+$/);

  const ownHp = await page.evaluate(() => window.pveNatureUi.getPreview().ownPanel.hp);
  await chooseTarget(page, "深蓝鲸");
  const shiny = page.getByRole("checkbox", { name: "异色 · 生命×1.5", exact: true });
  for (const [level, values] of [[41, [508, 554, 462]], [42, [516, 564, 468]], [43, [522, 570, 474]]]) {
    await page.getByRole("group", { name: "野怪等级", exact: true })
      .getByRole("button", { name: String(level), exact: true }).click();
    await expectHp(page, values);
    await shiny.check();
    await expectHp(page, values.map(value => value * 1.5));
    await shiny.uncheck();
    await expectHp(page, values);
  }
  // A fixed level must show each nature condition as a single value. Only the
  // explicit all-level selection may aggregate the same condition across levels.
  const levelButtons = page.getByRole("group", { name: "野怪等级", exact: true });
  for (const level of [41, 42, 43]) {
    await levelButtons.getByRole("button", { name: String(level), exact: true }).click();
    for (const value of await page.locator(".pcell .dmg").all()) await expect(value).toHaveText(/^\d+$/);
    for (const value of await page.locator("#preview-outgoing .hp-reading:not(.impossible) b").all()) await expect(value).toHaveText(/^\d+%$/);
  }
  await shiny.check();
  await levelButtons.getByRole("button", { name: "41–43级全部", exact: true }).click();
  await expect(shiny).toBeChecked();
  await expectHp(page, ["762–783", "831–855", "693–711"]);
  const allLevels = await page.evaluate(() => window.pveNatureUi.getPreview());
  expect(allLevels.targetLevels).toEqual([41, 42, 43]);
  for (const row of allLevels.outgoing.filter(row => row.status === "estimated")) {
    expect([...new Set(row.predictions.map(p => p.targetLevel))]).toEqual([41, 42, 43]);
  }
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(levelButtons.getByRole("button", { name: "41–43级全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expectHp(page, ["762–783", "831–855", "693–711"]);
  await shiny.uncheck();
  await levelButtons.getByRole("button", { name: "41", exact: true }).click();
  await expectHp(page, [508, 554, 462]);
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().ownPanel.hp)).toBe(ownHp);

  // Root-relative assets must survive the nested standalone-tool route.
  const portraits = page.locator("#own-image, #target-image");
  await expect(portraits).toHaveCount(2);
  for (const portrait of await portraits.all()) await expect(portrait).toHaveAttribute("src", /^\/assets\//);
  // 立绘栏图片按需懒加载，不计入首屏已加载检查。
  await expect.poll(() => page.locator('img[src^="/assets/"]:not([loading="lazy"])').evaluateAll(images =>
    images.length >= 2 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);

  await chooseTarget(page, "可爱猿");
  await page.getByRole("group", { name: "野怪等级", exact: true })
    .getByRole("button", { name: "41", exact: true }).click();
  await expectHp(page, [410, 446, 374]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const heading of await page.locator(".preview-card:visible .preview-heading h2").all()) {
    expect(await heading.evaluate(node => node.scrollWidth <= node.clientWidth && getComputedStyle(node).whiteSpace === "nowrap")).toBe(true);
  }
});

test("S5 nature stays absent from the Global toolbox", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/en/");
  await expect(page.locator("html")).toHaveAttribute("data-server", "global");
  await expect(page.locator(".toolbox-trigger")).toBeEnabled();
  await page.locator(".toolbox-trigger").click();
  const menu = page.locator("#toolbox-panel");
  await expect(menu).toBeVisible();
  await expect(menu.locator(`a[href="${toolPath}"]`)).toHaveCount(0);
  await expect(menu).not.toContainText("S5奇遇性格计算");
});

test("S5 nature incoming attack shows measured whale damage and matches nature", async ({ page }) => {
  await openTool(page);
  await selectProfile(page, 'dimo');
  await page.locator('#nature-picker-trigger').click();
  await page.getByRole('textbox', { name: '搜索性格', exact: true }).fill('莽撞');
  await page.locator('[data-nature-id="rash"]').click();
  await clearOwnIvs(page);
  for (const stat of ['physicalAttack', 'magicalAttack', 'speed']) {
    await page.locator(`[data-iv-stat="${stat}"]`).click();
  }
  await page.locator('#own-trait-stacks').fill('0');
  await page.locator('#own-trait-stacks').press('Tab');
  await setDice(page, 'own', 'none');
  await chooseTarget(page, '深蓝鲸');
  await page.getByRole('group', { name: '野怪等级', exact: true })
    .getByRole('button', { name: '41', exact: true }).click();
  await switchMethod(page, 'incoming');
  const picker = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await picker.fill('甩水');
  await page.getByRole('option').getByText('甩水', { exact: true }).click();
  const cells = page.locator('#preview-incoming-cells-0');
  const normal = cells.locator('[data-nature-group="other"][data-nature-condition="base"]');
  const raised = cells.locator('[data-nature-group="magicalAttack"][data-nature-condition="base"]');
  await expect(normal.locator('.dmg')).toHaveText('41');
  await expect(raised.locator('.dmg')).toHaveText('45');
  await expect(cells.locator('.axis-label')).toHaveText(['减魔攻', '魔攻不变', '加魔攻']);
  const result = await page.evaluate(() => window.pveNatureUi.getPreview());
  expect(result.ownPanel.magicalDefense).toBe(163);
  expect(result.incomingList[0].effectivePower).toBe(37.5);
  expect(result.incomingList[0].manualPower).toBe(false);
  await page.locator('#preview-incoming-damage-0').fill('45');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(raised).toHaveClass(/\bhit\b/);
  await expect(normal).toHaveClass(/\bmiss\b/);
  await expect(resultAxis(page, '魔攻')).toHaveText('加');

  // A skill power die must recalculate the shown incoming damage immediately.
  await setDice(page, 'target', 'game-dice-effect-17');
  await expect(raised.locator('.dmg')).toHaveText('106');
  await setDice(page, 'target', 'none');
  await expect(raised.locator('.dmg')).toHaveText('45');
  await page.locator('#preview-incoming-damage-0').click();
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await cells.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(raised.locator('.dmg')).toBeVisible();
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-incoming-${width}.png` });
    if (width === 1280) await page.locator('#preview-incoming').locator('..')
      .screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-incoming-result.png' });
  }
  await picker.fill('天洪');
  await page.getByRole('option').getByText('天洪', { exact: true }).click();
  await expect(normal.locator('.dmg')).toHaveText('209');
  await expect(page.locator('#preview-incoming-condition-0-displayedPower')).toHaveValue('');
  const flood = await page.evaluate(() => window.pveNatureUi.getPreview().incomingList[0]);
  expect(flood.displayedPower).toBe(187.5);
  expect(flood.manualPower).toBe(false);
});

test("S5 nature archived defense branches restore native calculations and measurements through reload", async ({ page }) => {
  await openTool(page);
  await page.locator('#target-filter').selectOption('all');
  await chooseTarget(page, '毛毛');
  await expect(page.getByRole('combobox', { name: '野怪防御分支', exact: true })).toHaveCount(0);
  await expect(page.locator('#preview-cells-0 .dmg').first()).toHaveText(/^\d+$/);
  await switchMethod(page, 'incoming');
  const incoming = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await incoming.fill('抓挠');
  await page.getByRole('option').getByText('抓挠', { exact: true }).click();
  await expect(page.locator('#preview-incoming-cells-0 .axis-label')).toHaveText(['减物攻', '物攻不变', '加物攻']);
  const baseline = await calculationPreview(page);
  expect(baseline.incomingList[0].status).toBe('estimated');
  const legacyIds = await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    return catalog.spirits.find(row => row.name === '毛毛').legacyWildStatFormIds;
  });
  expect(legacyIds.length).toBeGreaterThan(1);
  await page.locator('#preview-incoming-damage-0').fill('10');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await page.evaluate(id => {
    const session = window.pveNatureUi.getSession();
    session.wildStatFormId = id;
    window.pveNatureUi.setSession(session);
  }, legacyIds[0]);
  expect(await calculationPreview(page)).toEqual(baseline);
  // Install the archived fixture before the next document reads storage. The
  // current document may still have a pending input autosave after Tab.
  const legacySession = await page.evaluate(id => {
    const session = window.pveNatureUi.getSession();
    session.wildStatFormId = id;
    return session;
  }, legacyIds[1]);
  await page.addInitScript(session => {
    localStorage.setItem('roco-pve-nature-manual-v1', JSON.stringify(session));
  }, legacySession);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '选择野生目标', exact: true })).toHaveValue('毛毛');
  await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('10');
  expect(await calculationPreview(page)).toEqual(baseline);
  expect(await page.evaluate(() => window.pveNatureUi.getSession().wildStatFormId)).toBe(legacyIds[1]);
  await chooseTarget(page, '深蓝鲸');
  expect(await page.evaluate(() => window.pveNatureUi.getSession().wildStatFormId)).toBe('');
  await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('');
  const rejected = await page.evaluate(formId => {
    const session = window.pveNatureUi.getSession();
    session.wildStatFormId = formId;
    try { window.pveNatureUi.setSession(session); return false; } catch { return true; }
  }, legacyIds[0]);
  expect(rejected).toBe(true);
});

test("S5 nature level evidence does not confirm a fixed level or a single matching attack", async ({ page }) => {
  await openTool(page);
  await chooseTarget(page, '小翼龙');
  const levels = page.getByRole('group', { name: '野怪等级', exact: true });
  await levels.getByRole('button', { name: '42', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '我方技能 1', exact: true });
  await picker.fill('先发制人');
  await page.getByRole('option').getByText('先发制人', { exact: true }).click();
  const damage = await page.locator('#preview-cells-0 [data-defense-band="neutral"] .dmg').textContent();
  await page.locator('#preview-observed-0').fill(damage);
  await page.locator('#preview-observed-0').press('Tab');
  await expect(page.locator('#flow-result')).not.toContainText(/等级.*✓/);
  await levels.getByRole('button', { name: '41–43级全部', exact: true }).click();
  await page.locator('#preview-observed-0').fill(damage);
  await page.locator('#preview-observed-0').press('Tab');
  await expect(page.locator('#flow-result')).not.toContainText(/等级.*✓/);
  await expect(page.locator('#flow-result .flow-result-count')).toHaveText('1 条读数');
  await expect(page.locator('#flow-result .flow-evidence')).toContainText('吻合');
});

test("S5 nature incoming damage above own HP still identifies unchanged magical attack", async ({ page }) => {
  await openTool(page);
  await selectProfile(page, 'luoyin');
  await loadPreset(page);
  await page.locator('#star-seg').getByRole('button', { name: '10★', exact: true }).click();
  await chooseTarget(page, '伊雷龙');
  await page.getByRole('group', { name: '野怪等级', exact: true })
    .getByRole('button', { name: '43', exact: true }).click();
  await setDice(page, 'target', 'custom');
  await page.locator('#target-dice-magicalAttackMultiplier').fill('1.3');
  await page.locator('#target-dice-magicalAttackMultiplier').press('Tab');
  await switchMethod(page, 'incoming');
  const picker = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await picker.fill('升龙咆哮');
  await page.getByRole('option').getByText('升龙咆哮', { exact: true }).click();
  const cells = page.locator('#preview-incoming-cells-0');
  const normal = cells.locator('[data-nature-group="other"][data-nature-condition="base"]');
  await expect(normal.locator('.dmg')).toHaveText('660');
  const preview = await page.evaluate(() => window.pveNatureUi.getPreview());
  expect(preview.ownPanel.hp).toBe(403);
  expect(preview.ownPanel.magicalDefense).toBe(137);
  expect(660).toBeGreaterThan(preview.ownPanel.hp);

  // Displayed incoming damage can exceed HP; it still constrains enemy attack.
  // The separate outgoing-KO test retains the target-HP ambiguity behavior.
  const damage = page.locator('#preview-incoming-damage-0');
  await damage.fill('660');
  await damage.press('Tab');
  await expect(normal).toHaveClass(/\bhit\b/);
  const verdict = page.locator('#flow-result');
  await expect(verdict.locator('.flow-verdict')).toHaveText(/^剩 \d+ 种/);
  await expect(resultAxis(page, '魔攻')).toHaveText('不变');
  await expect(verdict.locator('.flow-evidence')).toContainText('升龙咆哮 总伤 660');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(damage).toHaveValue('660');
  await expect(resultAxis(page, '魔攻')).toHaveText('不变');
});

test("S5 nature presets share calculator configurations and preserve saved manual edits", async ({ page }) => {
  await openTool(page);
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  const active = () => page.evaluate(() => {
    const session = window.pveNatureUi.getSession();
    return session.profiles.find(row => row.id === session.activeProfileId);
  });
  for (const [id, nature, ivs, moves, panel] of [
    ['luoyin', 'adamant', ['hp','physicalAttack','physicalDefense'], ['火焰切割','地刺','彼岸之手','鸣沙陷阱'], [403,312,136,216,137,143]],
    ['dimo', 'rash', ['physicalAttack','magicalAttack','speed'], ['光球','棘突','热砂','超导'], [374,181,181,175,163,223]],
  ]) {
    await selectProfile(page, id);
    const profile = await active();
    expect(profile.awakening).toBe(5);
    expect(profile.natureId).toBe(nature);
    const stats = ['hp','physicalAttack','magicalAttack','physicalDefense','magicalDefense','speed'];
    expect(stats.map(key => profile.displayIvs[key])).toEqual(stats.map(key => ivs.includes(key) ? 60 : 0));
    expect(stats.map(key => profile.panel[key])).toEqual(panel);
    for (const [index, move] of moves.entries()) await expect(page.getByRole('combobox', { name: `我方技能 ${index + 1}`, exact: true })).toHaveValue(move);
  }
  await page.locator('#star-seg').getByRole('button', { name: '8★', exact: true }).click();
  await page.locator('[data-iv-stat="magicalAttack"]').click();
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#star-seg').getByRole('button', { name: '8★', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await active()).displayIvs.magicalAttack).toBe(0);
  await loadPreset(page);
  expect((await active()).awakening).toBe(5);
  expect((await active()).displayIvs.magicalAttack).toBe(60);
  for (const [width, height] of [[1280,1000], [390,844]]) {
    await page.setViewportSize({ width, height });
    await openConfig(page);
    await page.locator('#flow-own-menu-button').click();
    await expect(page.locator('#load-own-preset')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#load-own-preset')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-presets-${width}.png` });
  }

  // Other species read the same published library, then prefer local CN edits.
  const library = await (await page.request.get('/data/presets/pvp-popular-configs.json')).json();
  const catalog = await (await page.request.get('/tools/s5-nature/data/catalog.json')).json();
  const wolf = catalog.spirits.find(row => row.name === '恶魔狼王');
  const shared = library.entries.find(row => row.spiritId === wolf.id);
  const picker = page.getByRole('combobox', { name: '选择我方精灵', exact: true });
  await picker.fill('恶魔狼王');
  await page.getByRole('option').getByText('恶魔狼王', { exact: true }).click();
  const picked = await active();
  expect(picked.natureId).toBe(shared.natureId);
  expect(picked.displayIvs).toEqual(shared.displayIvs);
  expect(picked.preview.skillIds).toEqual(shared.skills);
  await page.evaluate(entry => localStorage.setItem('rock-calculator.servers.cn.spirit-configs.v2', JSON.stringify({
    schemaVersion: 2, configs: { [entry.spiritId]: { ...entry, natureId: 'rash', skills: { four: entry.skills.map(skillId => ({skillId})) } } },
  })), shared);
  await loadPreset(page);
  expect((await active()).natureId).toBe('rash');
  expect((await active()).preview.skillIds).toEqual(shared.skills);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await openConfig(page);
  await expect(picker).toHaveValue('恶魔狼王');
  expect((await active()).natureId).toBe('rash');
  for (const name of ['圆号鱼', '圣光迪莫']) {
    const spirit = catalog.spirits.find(row => row.name === name);
    const expected = library.entries.find(row => row.spiritId === spirit.id);
    await picker.click();
    await picker.fill(name);
    await page.getByRole('option').getByText(name, { exact: true }).click();
    expect((await active()).preview.skillIds).toEqual(expected.skills);
    await expect(page.locator('#load-own-preset')).toBeEnabled();
  }
});


test("S5 nature compact comparison keeps paired measurements separate from highlights and KO", async ({ page }) => {
  await openTool(page);
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  await chooseTarget(page, '可爱猿');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '41', exact: true }).click();
  const cells = page.locator('#preview-cells-0');
  const hp = cells.locator('[data-defense-band="neutral"]');
  const other = cells.locator('[data-defense-band="up"]');
  const damage = page.locator('#preview-observed-0'), remaining = page.locator('#preview-remaining-0');
  const verdict = page.locator('#flow-result .flow-verdict');
  const hpAxis = resultAxis(page, '生命');
  await expect(cells.locator('.pcell-stack')).toHaveCount(3);
  await expect(page.locator('#preview-outgoing')).not.toContainText('其他增益');
  await expect(cells.locator('.same-placeholder')).toHaveCount(0);
  await expect(hp.locator('.dmg')).toHaveText('103');
  await expect(hp.locator('[data-hp-nature="down"] b')).toHaveText('73%');
  await expect(hp.locator('[data-hp-nature="neutral"] b')).toHaveText('75%');
  await expect(hp.locator('[data-hp-nature="up"] b')).toHaveText('77%');
  await expect(other.locator('[data-hp-nature="up"] b')).toHaveText('—');
  await expect(cells).not.toContainText('同其他');
  // A bookmark never constitutes a measurement, including after reload.
  await hp.locator('[data-hp-nature="up"] b').click();
  await expect(hp).toHaveAttribute('aria-pressed', 'true');
  await expect(verdict).toHaveText('待实测');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(hp).toHaveAttribute('aria-pressed', 'true');
  await expect(verdict).toHaveText('待实测');
  await damage.fill('103'); await damage.press('Tab');
  await expect(resultAxis(page, '生命')).toHaveText(/^待/);
  await remaining.fill('77'); await remaining.press('Tab');
  await expect(hpAxis).toHaveText('加');
  await expect(resultAxis(page, '物攻')).toHaveText(/^待/); await expect(resultAxis(page, '魔攻')).toHaveText(/^待/);
  await expect(page.locator('#flow-result .flow-evidence')).toContainText('伤害 103 · 余 77%');
  // Picking a different column neither discards measurements nor changes the result.
  await other.locator('.dmg').click();
  await expect(other).toHaveAttribute('aria-pressed','true');
  await expect(damage).toHaveValue('103'); await expect(remaining).toHaveValue('77');
  await expect(hpAxis).toHaveText('加');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(damage).toHaveValue('103'); await expect(remaining).toHaveValue('77');
  // Each field individually exists, but no single nature matches this pair.
  await damage.fill('94'); await damage.press('Tab');
  await expect(verdict).toHaveText('已判断 1 项');
  await expect(resultAxis(page, '物防')).toHaveText('加');
  await expect(hpAxis).toHaveText('记录冲突');
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().uiVerdict.candidates)).toEqual([]);
  await damage.fill('103'); await damage.press('Tab');
  await remaining.fill(''); await remaining.press('Tab');
  await expect(damage).toHaveValue('103'); await expect(resultAxis(page, '生命')).toHaveText(/^待/);
  // Previously saved percent-only records retain their unit and do not become damage.
  await page.evaluate(() => {
    const session=window.pveNatureUi.getSession();
    const own=session.profiles.find(p=>p.id===session.activeProfileId);
    own.preview.observed={0:{remainingPercent:77}}; own.preview.observedUnits={0:'percent'};
    window.pveNatureUi.setSession(session);
  });
  await expect(damage).toHaveValue(''); await expect(remaining).toHaveValue('77');
  await expect(hpAxis).toHaveText('加');
  await damage.fill('103'); await damage.press('Tab');
  for (const [width,height] of [[1920,1080],[390,844],[320,740]]) {
    await page.setViewportSize({width,height});
    // Fallback glyph metrics exposed the rail's implicit min-content width.
    const fallbackFont = width === 320
      ? await page.addStyleTag({ content: ':root { font-family: SimSun, serif; }' }) : null;
    await page.locator('[data-preview-row="0"]').locator('.pskill').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')].filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.right > innerWidth + 0.5;
      }).map(node => ({ id: node.id, className: node.className, right: node.getBoundingClientRect().right })).slice(0, 12),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport);
    await expect(damage).toBeVisible(); await expect(remaining).toBeVisible();
    if(width<800) expect(await damage.boundingBox().then(box=>box.width)).toBeGreaterThan(60);
    await page.screenshot({path:`artifacts/s5-player-flow/screenshots/s5-compact-${width}.png`});
    if (fallbackFont) await fallbackFont.evaluate(node => node.remove());
  }
  await page.setViewportSize({width:1920,height:1080});
  await chooseTarget(page, '小翼龙');
  const picker=page.getByRole('combobox',{name:'我方技能 1',exact:true});
  await picker.fill('地震'); await page.getByRole('option').getByText('地震',{exact:true}).click();
  await expect(hp.locator('[data-hp-nature="up"] b')).toHaveText('0%');
  await hp.locator('.dmg').click();
  await expect(hp).toHaveClass(/\bpicked\b/);
  await expect(verdict).toHaveText('待实测');
  await other.locator('.dmg').click();
  await expect(other).toHaveClass(/\bpicked\b/);
  await expect(cells.locator('.picked')).toHaveCount(1);
  await expect(verdict).toHaveText('待实测');
  const koDamage=await hp.locator('.dmg').textContent();
  await damage.fill(koDamage); await damage.press('Tab');
  await expect(verdict).toHaveText('待实测');
  await remaining.fill('0'); await remaining.press('Tab');
  await expect(verdict).toHaveText('待实测');
  await expect(page.locator('#flow-result .flow-evidence')).toHaveCount(0);
});


test("S5 nature separates HP evidence and exact per-hit observations without dropping conflicts", async ({ page }) => {
  await openTool(page);
  await page.waitForFunction(() => Boolean(window.pveNatureUi));
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const { calculateOwnPanel } = await import('./own-panel.mjs');
    const session = window.pveNatureUi.getSession();
    const own = catalog.spirits.find(s => s.name === '圣代甜甜（蓝莓抹茶口味）');
    const target = catalog.spirits.find(s => s.name === '锤头鹳');
    const skill = name => catalog.skills.find(s => s.name === name).id;
    if (!own || !target) throw new Error('Screenshot species missing');
    const p = session.profiles[0];
    session.activeProfileId = p.id; session.targetId = target.id; session.level = 43;
    p.spiritId = own.id; p.name = own.name; p.level = 60; p.awakening = 3;
    p.natureId = catalog.natures.find(n => n.name === '踏实').id;
    p.displayIvs = { hp: 60, physicalAttack: 0, magicalAttack: 60, physicalDefense: 60, magicalDefense: 0, speed: 0 };
    p.panel = calculateOwnPanel({ raceStats: own.raceStats, level: 60, natureId: p.natureId, displayIvs: p.displayIvs }, catalog);
    p.panelSource = 'pvp-five-star';
    p.preview = { speciesId: own.id, skillIds: ['碎冰冰','寒潮','离子震荡','打喷嚏'].map(skill),
      diceId: 'game-dice-effect-18', diceLast: 'game-dice-effect-18', trait: { stacks: 0, active: false },
      observed: { 0: { damage: 311, remainingPercent: 27 } }, observedTargetId: target.id, observedLevel: 43 };
    session.preview = { targetId: target.id, level: 43, diceId: 'game-dice-effect-4', diceLast: 'game-dice-effect-4',
      incomingSkillIds: ['水花四溅','升龙咆哮'].map(skill), incomingDamages: [24, 7], incomingDefender: `${p.id}:${own.id}` };
    localStorage.setItem('roco-pve-nature-manual-v1', JSON.stringify(session));
    return session;
  });
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.pveNatureUi));
  const verdict = page.locator('#flow-result');
  await expect(verdict.locator('[data-axis="hp"] small').filter({ hasText: '421–426' })).toHaveCount(1);
  await expect(verdict.locator('.flow-result-count')).toHaveText('3 条读数');
  await expect(verdict).toContainText('实测比最近值少 140');
  await expect(page.locator('#preview-incoming-cells-0')).toContainText('6 × 4 段');
  await switchMethod(page, 'incoming');
  await expect(page.locator('#preview-incoming-unit-0')).toHaveValue('total');
  await page.locator('#preview-incoming-unit-0').selectOption('perHit');
  await page.locator('#preview-incoming-damage-0').fill('6');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(2);
  await expect(verdict).toContainText('单段 6 × 4 = 24');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#preview-incoming-unit-0')).toHaveValue('perHit');
  await page.locator('#preview-incoming-damage-0').fill('7');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(0);
  await expect(verdict).toContainText('实测比最近值多 4');
  await page.locator('#preview-incoming-damage-0').fill('-1');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(verdict.locator('.flow-verdict')).toHaveText('已判断 1 项');
  await expect(verdict.locator('.flow-evidence')).toContainText('输入格式有误');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(0);
  await page.locator('#preview-incoming-damage-0').fill('6');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  // Independent HP evidence remains usable without discarding a damage conflict.
  await switchMethod(page, 'outgoing');
  await page.locator('#preview-remaining-0').fill('43');
  await page.locator('#preview-remaining-0').press('Tab');
  await expect(resultAxis(page, '生命')).toHaveText('加');
  await expect(verdict.locator('.flow-verdict')).toHaveText(/已判断 \d+ 项/);
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().uiVerdict.candidates)).toEqual([]);
});


test('S5 nature defense calibration renders stage-three rollout and Dimo trait timing', async ({ page }) => {
  await openTool(page);
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  const configure = async (name, moves, panel) => page.evaluate(async ({ name, moves, panel }) => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const session = window.pveNatureUi.getSession();
    const spirit = catalog.spirits.find(row => row.name === name);
    const profile = session.profiles.find(row => row.spiritId === spirit.id);
    session.activeProfileId = profile.id;
    session.targetId = catalog.spirits.find(row => row.name === '深蓝鲸').id;
    session.level = 43;
    Object.assign(profile, { awakening: 5, level: 60, panelSource: 'manual', panel });
    profile.preview = { speciesId: spirit.id, skillIds: moves.map(name => catalog.skills.find(row => row.name === name).id),
      diceId: 'game-dice-effect-1', trait: { stacks: 0 }, observed: {}, skillOverrides: {},
      observedTargetId: session.targetId, observedLevel: 43 };
    session.preview = { targetId: session.targetId, level: 43, shiny: false, diceId: 'game-dice-effect-8',
      incomingSkillIds: [], incomingOverridesList: [], incomingDamages: [] };
    window.pveNatureUi.setSession(session);
  }, { name, moves, panel });
  const damages = () => page.evaluate(() => window.pveNatureUi.getPreview().outgoing.filter(row => row?.skillId)
    .map(row => row.predictions.find(p => p.upStat === 'physicalAttack' && p.downStat === 'speed').damage));
  await configure('罗隐', ['地刺','火焰切割','彼岸之手'],
    { hp:403, physicalAttack:312, magicalAttack:136, physicalDefense:183, magicalDefense:137, speed:176 });
  expect(await damages()).toEqual([294,117,491]);
  await expect(page.locator('.coefficient-details')).toContainText('43级（物防不变）');
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  expect(await damages()).toEqual([294,117,491]);
  await configure('迪莫', ['光球','棘突','热砂'],
    { hp:425, physicalAttack:138, magicalAttack:181, physicalDefense:175, magicalDefense:175, speed:223 });
  expect(await damages()).toEqual([136,308,68]);
  await expect(page.locator('.coefficient-details')).toContainText('41级（魔防不变）；42级（魔防不变）；43级（魔防不变）');
  await page.locator('#preview-observed-0').fill('136');
  await page.locator('#preview-observed-0').press('Tab');
  await page.locator('#preview-remaining-0').fill('74');
  await page.locator('#preview-remaining-0').press('Tab');
  await expect(page.locator('#flow-result .flow-evidence')).toContainText('吻合');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '增加层数', exact: true }).click();
  expect((await damages())[2]).toBe(80);
  await expect(page.locator('#preview-cells-2 .dmg')).toContainText(['80']);
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().outgoing[2].displayedPower)).toBe(104);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#own-trait-stacks')).toHaveValue('1');
  expect((await damages())[2]).toBe(80);

  // The rollout must reach another species through the actual UI/session path.
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const session = window.pveNatureUi.getSession();
    const profile = session.profiles.find(row => row.id === session.activeProfileId);
    session.targetId = catalog.spirits.find(row => row.name === '噼啪鸟').id;
    session.level = 41;
    profile.preview = { ...profile.preview, diceId: 'none', trait: { stacks: 0 }, observed: {}, observedRemaining: {},
      skillIds: [catalog.skills.find(row => row.name === '热砂').id], skillOverrides: {},
      observedTargetId: session.targetId, observedLevel: 41 };
    session.preview = { targetId: session.targetId, level: 41, shiny: false, diceId: 'none',
      incomingSkillIds: [], incomingOverridesList: [], incomingDamages: [] };
    window.pveNatureUi.setSession(session);
  });
  const bird = await page.evaluate(() => window.pveNatureUi.getPreview().outgoing[0].predictions
    .find(row => row.upStat === 'magicalDefense' && row.downStat === 'speed'));
  expect(bird.damage).toBe(317);
  expect(bird.defenderDefense).toBe(148);
  await expect(page.locator('.coefficient-details')).toContainText('41级（加魔防）');
  await page.locator('#preview-observed-0').fill('317');
  await page.locator('#preview-observed-0').press('Tab');
  await expect(page.locator('#flow-result .flow-evidence')).toContainText('吻合');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#preview-observed-0')).toHaveValue('317');
  await expect(page.locator('#flow-result .flow-evidence')).toContainText('吻合');
});


test('S5 nature player flow compares defense independently from HP and preserves scoped readings', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openTool(page);
  // Reproduce the reported 42-level shiny stork, using the same public session
  // entry point as saved records; this fixture does not change product defaults.
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const { calculateOwnPanel } = await import('./own-panel.mjs');
    const session = window.pveNatureUi.getSession();
    const profile = session.profiles.find(row => row.id === session.activeProfileId);
    const spirit = catalog.spirits.find(row => row.name === '深渊罗隐');
    const target = catalog.spirits.find(row => row.name === '锤头鹳');
    const skill = name => catalog.skills.find(row => row.name === name).id;
    Object.assign(session, { targetId: target.id, level: 42, wildStatFormId: '', observations: [] });
    Object.assign(profile, { name: spirit.name, spiritId: spirit.id, level: 60, awakening: 5,
      natureId: 'adamant', panelSource: 'pvp-five-star',
      displayIvs: { hp: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 60, magicalDefense: 0, speed: 0 } });
    profile.panel = calculateOwnPanel({ raceStats: spirit.raceStats, level: profile.level,
      natureId: profile.natureId, displayIvs: profile.displayIvs }, catalog);
    const skillIds = ['鸣沙陷阱','彼岸之手','地震','地刺'].map(skill);
    profile.preview = { speciesId: spirit.id, skillIds, skillOverrides: { [skillIds[0]]: { displayedPower: 280 } },
      observed: {}, picked: {}, trait: { stacks: 0, active: false }, diceId: 'none', diceEffects: {},
      panelIncludesDice: false, observedTargetId: target.id, observedLevel: 42 };
    session.preview = { targetId: target.id, level: 42, shiny: true, diceId: 'none', diceEffects: {},
      incomingSkillIds: ['风矢','升龙咆哮'].map(skill), incomingOverridesList: [{},{}],
      incomingDamages: [null,null], incomingPicks: [null,null], incomingDamageUnits: ['total','total'],
      incomingDefender: `${profile.id}:${spirit.id}`, percentFormat: 'game0' };
    window.pveNatureUi.setSession(session);
  });
  await expectHp(page, [738, 804, 672]);
  await expect(page.locator('#preview-outgoing > .defense-column-head > span')).toHaveText(['物防↓','物防不变','物防↑']);
  const sharedIcons = page.locator('#preview-outgoing > .defense-column-head .hp-state-label');
  await expect(sharedIcons).toHaveCount(9);
  await expect(sharedIcons.nth(1)).toHaveAttribute('aria-label', '生命不变时的剩余血量');
  for (const [index, damage] of [[0,['547','502','461']],[1,['586','538','493']],[2,['743','681','625']],[3,['351','322','296']]]) {
    await expect(page.locator(`#preview-cells-${index} .dmg`)).toHaveText(damage);
    await expect(page.locator(`#preview-cells-${index} .hp-reading`)).toHaveCount(9);
  }
  const cells = page.locator('#preview-cells-0');
  const neutral = cells.locator('[data-defense-band="neutral"]');
  await expect(neutral.locator('.hp-reading b')).toHaveText(['26%','32%','38%']);
  await expect(cells.locator('[data-defense-band="down"] .hp-reading b')).toHaveText(['—','26%','32%']);
  await expect(cells.locator('[data-defense-band="up"] .hp-reading b')).toHaveText(['32%','38%','—']);
  await expect(page.locator('#preview-cells-2 [data-defense-band="neutral"] [data-hp-nature="down"] b')).toHaveText('0%');
  const damage = page.locator('#preview-observed-0'), remaining = page.locator('#preview-remaining-0');
  const incoming = page.locator('#preview-incoming-damage-0');
  const verdict = page.locator('#flow-result .flow-verdict');
  await neutral.click();
  await expect(neutral).toHaveAttribute('aria-pressed', 'true');
  await expect(damage).toHaveValue(''); await expect(remaining).toHaveValue('');
  await expect(verdict).toHaveText('待实测');
  await damage.fill('502'); await damage.press('Tab');
  await expect(verdict).toHaveText('剩 20 种');
  await remaining.fill('32'); await remaining.press('Tab');
  await expect(verdict).toHaveText('剩 12 种');
  await expect(resultAxis(page, '生命')).toHaveText('不变');
  await expect(resultAxis(page, '物防')).toHaveText('不变');
  await expect(page.locator('#flow-result [data-axis="hp"] small')).toContainText('推算总血量 728–738');
  await expect(page.locator('#flow-row-verdict-out-0')).toHaveText('物防不变 · 生命不变');
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().uiVerdict.matching.some(n => n.id === 'rash'))).toBe(true);
  // One-point tolerance applies above 50; a larger miss affects only its tested axis.
  await damage.fill('503'); await damage.press('Tab');
  await expect(verdict).toHaveText('剩 12 种');
  await expect(resultAxis(page, '生命')).toHaveText('不变');
  await expect(resultAxis(page, '物防')).toHaveText('不变');
  await damage.fill('504'); await damage.press('Tab');
  await expect(resultAxis(page, '物防')).toHaveText('记录冲突');
  await expect(resultAxis(page, '生命')).toHaveText('不变');
  await switchMethod(page, 'incoming');
  await incoming.fill('14'); await incoming.press('Tab');
  await expect(resultAxis(page, '物攻')).toHaveText('不变');
  await expect(resultAxis(page, '物防')).toHaveText('记录冲突');
  await expect(resultAxis(page, '生命')).toHaveText('不变');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-axis-evidence-independent.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#flow-result').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-axis-evidence-independent-390.png' });
  await page.setViewportSize({ width: 1366, height: 768 });
  await incoming.fill(''); await incoming.press('Tab');
  await switchMethod(page, 'outgoing');
  await damage.fill('502'); await damage.press('Tab');
  await expect(verdict).toHaveText('剩 12 种');

  // Conflicting readings for the same axis must not be silently discarded.
  const secondDamage = page.locator('#preview-observed-1');
  await secondDamage.fill('493'); await secondDamage.press('Tab');
  await expect(resultAxis(page, '物防')).toHaveText('记录冲突');
  await expect(resultAxis(page, '生命')).toHaveText('不变');
  await secondDamage.fill(''); await secondDamage.press('Tab');
  await expect(verdict).toHaveText('剩 12 种');

  // Direct maximum HP intersects with inferred HP while defense remains independent.
  await page.locator('#flow-hp-value').fill('804');
  await page.locator('#flow-hp-value').press('Enter');
  await expect(resultAxis(page, '生命')).toHaveText('记录冲突');
  await expect(resultAxis(page, '物防')).toHaveText('不变');
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-axis-evidence-hp-conflict.png' });
  await page.locator('#flow-hp-value').fill('');
  await page.locator('#flow-hp-value').press('Enter');
  await expect(verdict).toHaveText('剩 12 种');
  await cells.locator('[data-defense-band="up"]').click();
  await expect(damage).toHaveValue('502'); await expect(remaining).toHaveValue('32');
  await expect(verdict).toHaveText('剩 12 种');
  await switchMethod(page, 'incoming');
  await expect(incoming).toHaveValue('');
  await expect(verdict).toHaveText('剩 12 种');
  await expect(page.locator('#flow-result .flow-result-count')).toHaveText('1 条读数');
  await expect(page.locator('#preview-incoming-cells-0 .dmg')).toHaveText(['12','14','15']);
  await incoming.fill('14'); await incoming.press('Tab');
  await switchMethod(page, 'outgoing');
  await expect(damage).toHaveValue('502'); await expect(remaining).toHaveValue('32');
  await page.locator('#flow-outgoing-card .flow-clear').click();
  await expect(damage).toHaveValue(''); await expect(remaining).toHaveValue('');
  await expect(cells.locator('.picked')).toHaveCount(0);
  await expect(incoming).toHaveValue('14');
  await switchMethod(page, 'incoming');
  await expect(incoming).toHaveValue('14');
  await page.locator('#flow-incoming-card .flow-clear').click();
  await expect(incoming).toHaveValue(''); await expect(verdict).toHaveText('待实测');
  await switchMethod(page, 'outgoing');
  await damage.fill('502'); await damage.press('Tab');
  await remaining.fill('32'); await remaining.press('Tab');
  await page.reload();
  await expect(verdict).toHaveText('剩 12 种');
  await expect(damage).toHaveValue('502'); await expect(remaining).toHaveValue('32');
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-axis-evidence-desktop.png' });
  for (const [width,height] of [[390,844],[320,740]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0,0));
    await expect(page.locator('[data-flow-skill]')).toHaveCount(4);
    await expect(damage).toBeInViewport({ ratio: 1 });
    await expect(remaining).toBeInViewport({ ratio: 1 });
    for (const cell of await cells.locator('.defense-pcell').all()) await expect(cell).toBeInViewport({ ratio: 1 });
    const layout = await page.evaluate(() => {
      const footer = document.querySelector('#flow-mobile-result');
      const footerBox = footer.getBoundingClientRect();
      const cells = document.querySelector('#preview-cells-0').getBoundingClientRect();
      return { viewport: innerWidth, width: document.documentElement.scrollWidth, bottom: cells.bottom,
        visibleBottom: footerBox.height && getComputedStyle(footer).position === 'fixed' ? footerBox.top : innerHeight };
    });
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);
    expect(layout.bottom).toBeLessThanOrEqual(layout.visibleBottom);
    await page.screenshot({ path: `artifacts/s5-player-flow/screenshots/s5-axis-evidence-${width}.png` });
  }
  await page.locator('[data-flow-skill="1"]').click();
  await expect(page.locator('[data-preview-row="1"]')).toBeVisible();
  await expect(page.locator('[data-preview-row="0"]')).toBeHidden();
  await editOwnSkill(page, 1);
  await expect(page.getByRole('combobox', { name: '我方技能 2', exact: true })).toBeVisible();
  await page.locator('[data-flow-skill="0"]').click();
  await expect(damage).toHaveValue('502'); await expect(remaining).toHaveValue('32');
  // 手机切页签；读数不随页签丢失。桌面两种测法同页可见。
  await page.locator('[data-flow-tab="incoming"]').click();
  await expect(page.locator('#flow-incoming-card')).toBeVisible();
  await expect(page.locator('#flow-outgoing-card')).toBeHidden();
  await page.locator('[data-flow-tab="outgoing"]').click();
  await expect(damage).toHaveValue('502'); await expect(remaining).toHaveValue('32');
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.locator('#flow-incoming-card')).toBeVisible();
  await expect(page.locator('#flow-outgoing-card')).toBeVisible();
  await expect(page.locator('.flow-test-bar')).toBeHidden();
  const ownCheck = page.locator('#flow-check-own');
  await ownCheck.click();
  await expect(ownCheck).toHaveAttribute('aria-pressed', 'true');
  const profileBefore = await page.evaluate(() => window.pveNatureUi.getSession().activeProfileId);
  const ownPicker = page.getByRole('combobox', { name: '选择我方精灵', exact: true });
  await ownPicker.fill('罗隐');
  await page.getByRole('option').getByText('罗隐', { exact: true }).click();
  expect(await page.evaluate(() => window.pveNatureUi.getSession().activeProfileId)).toBe(profileBefore);
  await expect(ownCheck).toHaveAttribute('aria-pressed', 'false');
  await expect(ownCheck).toHaveText('未核对');
});

test('S5 nature player flow preserves an unreadable saved session during initial render', async ({ page }) => {
  await openTool(page);
  const raw = '{"schemaVersion":1,"profiles":[';
  await page.evaluate(raw => localStorage.setItem('roco-pve-nature-manual-v1', raw), raw);
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(page.locator('#flow-result .flow-verdict')).toHaveText('待实测');
  expect(await page.evaluate(() => localStorage.getItem('roco-pve-nature-manual-v1'))).toBe(raw);
});

test('S5 nature plan A keeps named configs, per-config incoming readings and one-step level edits', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openTool(page);
  const session = () => page.evaluate(() => window.pveNatureUi.getSession());
  const incoming = page.locator('#preview-incoming-damage-0');
  // 等级在精灵旁，桌面一步可改；换精灵不再重置为 60。
  await page.locator('#profile-level').fill('55'); await page.locator('#profile-level').press('Enter');
  await expect.poll(async () => (await session()).profiles.find(p => p.id === 'luoyin').level).toBe(55);
  // 受击读数按配置保存：切走、切回、刷新都不丢。
  await incoming.fill('11'); await incoming.press('Enter');
  await selectProfile(page, 'dimo');
  await expect(incoming).toHaveValue('');
  await incoming.fill('22'); await incoming.press('Enter');
  await selectProfile(page, 'luoyin');
  await expect(incoming).toHaveValue('11');
  await selectProfile(page, 'dimo');
  await page.reload();
  await expect(page.locator('#profile-select')).toHaveValue('dimo');
  await expect(incoming).toHaveValue('22');
  await selectProfile(page, 'luoyin');
  await expect(incoming).toHaveValue('11');
  // 另存为命名配置：保留等级，不沿用本场读数；改名、删除需确认。
  await ownMenu(page, 'save');
  await page.locator('#config-name').fill('罗隐 · 物攻主力');
  await page.locator('#config-ok').click();
  await expect(page.locator('#profile-select option:checked')).toHaveText('罗隐 · 物攻主力');
  await expect(page.locator('#profile-level')).toHaveValue('55');
  await expect(incoming).toHaveValue('');
  await page.reload();
  await expect(page.locator('#profile-select option:checked')).toHaveText('罗隐 · 物攻主力');
  await ownMenu(page, 'delete');
  await expect(page.locator('#config-dialog-message')).toContainText('罗隐 · 物攻主力');
  await page.locator('#config-ok').click();
  await expect(page.locator('#profile-select option')).toHaveCount(2);
  // 读数旁直接给结论；矩阵点格设目标。
  // 删除后回到迪莫，它的受击读数 22 与小翼龙对不上，先清掉。
  await expect(incoming).toHaveValue('22');
  await expect(page.locator('#flow-row-verdict-in-0')).toContainText('实测比最近值');
  await page.locator('#flow-incoming-card .flow-clear').click();
  await chooseTarget(page, '小翼龙');
  const damage = await page.locator('#preview-cells-0 [data-defense-band="neutral"] .dmg').textContent();
  await page.locator('#preview-observed-0').fill(damage); await page.locator('#preview-observed-0').press('Enter');
  await expect(page.locator('#flow-row-verdict-out-0')).toContainText('不变');
  await expect(page.locator('#flow-result .fm-cell.on').first()).toBeVisible();
  const nature = await page.locator('#flow-result .fm-cell.on').first().getAttribute('data-goal-nature');
  await page.locator(`#flow-result [data-goal-nature="${nature}"]`).click();
  await expect(page.locator('#flow-goal')).toHaveValue(nature);
  await expect(page.locator('#flow-result .flow-goal-result')).toContainText('还在候选');
  // 手机：出战折成一行摘要，点一次即可改等级。
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#flow-own-card')).toBeHidden();
  await page.locator('#flow-own-summary').click();
  await page.locator('#profile-level').fill('50'); await page.locator('#profile-level').press('Enter');
  await expect(page.locator('#flow-own-summary-text')).toContainText('50级');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/s5-player-flow/screenshots/s5-plan-a-390.png' });
});

test('S5 nature plan A review: readings keep their own move, HP verdict matches the rail, deleting a config keeps the save', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openTool(page);
  const session = () => page.evaluate(() => window.pveNatureUi.getSession());
  const skillInput = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  const damage = page.locator('#preview-incoming-damage-0'), unit = page.locator('#preview-incoming-unit-0');
  const chooseIncoming = async name => { await skillInput.fill(name); await page.getByRole('option').getByText(name, { exact: true }).click(); await expect(skillInput).toHaveValue(name); };
  const hitCount = async value => {
    await page.locator('#preview-incoming-condition-0-gear').click();
    await page.locator('#preview-incoming-condition-0-hitCount').fill(String(value));
    await page.locator('#preview-incoming-condition-0-hitCount').press('Tab');
    await page.keyboard.press('Escape');
  };
  // 1. 罗隐：吹炎 · 2 段 · 单段 6；迪莫换成抓挠、总伤；切回罗隐恢复原来那一招、段数和口径。
  await selectProfile(page, 'luoyin');
  await chooseIncoming('吹炎');
  await hitCount(2);
  await expect(unit).toBeVisible();
  await unit.selectOption('perHit');
  await damage.fill('6'); await damage.press('Enter');
  await selectProfile(page, 'dimo');
  await expect(damage).toHaveValue('');
  await chooseIncoming('抓挠');
  await damage.fill('30'); await damage.press('Enter');
  await selectProfile(page, 'luoyin');
  await expect(skillInput).toHaveValue('吹炎');
  await expect(unit).toHaveValue('perHit');
  await expect(damage).toHaveValue('6');
  expect((await session()).preview.incomingOverridesList[0].hitCount).toBe(2);
  await page.reload();
  await expect(skillInput).toHaveValue('吹炎');
  await expect(unit).toHaveValue('perHit');
  await expect(damage).toHaveValue('6');
  await selectProfile(page, 'dimo');
  await expect(skillInput).toHaveValue('抓挠');
  await expect(damage).toHaveValue('30');
  // 纠错路径保留：只改当前配置的条件，读数不清。
  await hitCount(3);
  await expect(damage).toHaveValue('30');

  // 2. 163 按 ±1 吻合物防不变，但 440 扣 163 显示 63%，不是 64%：行内与右栏都判生命冲突。
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const { calculateOwnPanel } = await import('./own-panel.mjs');
    const s = window.pveNatureUi.getSession();
    const profile = s.profiles.find(row => row.id === 'luoyin');
    const spirit = catalog.spirits.find(row => row.name === '罗隐');
    const target = catalog.spirits.find(row => row.name === '锤头鹳');
    const skill = name => catalog.skills.find(row => row.name === name).id;
    s.activeProfileId = 'luoyin';
    Object.assign(s, { targetId: target.id, level: 41, wildStatFormId: '', observations: [] });
    Object.assign(profile, { level: 60, awakening: 5, natureId: 'adamant', panelSource: 'pvp-five-star', spiritId: spirit.id, name: spirit.name,
      displayIvs: { hp: 60, physicalAttack: 60, magicalAttack: 0, physicalDefense: 60, magicalDefense: 0, speed: 0 } });
    profile.panel = calculateOwnPanel({ raceStats: spirit.raceStats, level: 60, natureId: 'adamant', displayIvs: profile.displayIvs }, catalog);
    profile.preview = { speciesId: spirit.id, skillIds: ['火焰切割', '地刺', '彼岸之手', '鸣沙陷阱'].map(skill), skillOverrides: {},
      observed: { 0: { damage: 163, remainingPercent: 64 } }, picked: {}, trait: { stacks: 0, active: false }, diceId: 'none', diceEffects: {},
      observedTargetId: target.id, observedLevel: 41 };
    s.preview = { targetId: target.id, level: 41, shiny: false, diceId: 'none', diceEffects: {} };
    window.pveNatureUi.setSession(s);
  });
  await expectHp(page, [484, 528, 440]);
  await expect(page.locator('#flow-row-verdict-out-0 .good')).toHaveText('物防不变');
  await expect(page.locator('#flow-row-verdict-out-0 .bad')).toContainText('生命对不上');
  await expect(page.locator('#flow-row-verdict-out-0')).not.toContainText('减生命');
  await expect(resultAxis(page, '生命')).toHaveText('记录冲突');
  await expect(page.locator('#flow-result [data-axis="hp"] small')).toContainText('441–452');
  // 对照表同一口径：163 吻合物防不变那格，但 64% 不再标成任何生命档吻合。
  await expect(page.locator('#preview-cells-0 [data-defense-band="neutral"]')).toHaveClass(/\bhit\b/);
  await expect(page.locator('#preview-cells-0 .hp-reading.matches')).toHaveCount(0);
  // 反推与三档一致时照常标出：162 / 64% → 440 血，减生命。
  await page.locator('#preview-observed-0').fill('162'); await page.locator('#preview-observed-0').press('Enter');
  await expect(page.locator('#preview-cells-0 [data-defense-band="neutral"] [data-hp-nature="down"]')).toHaveClass(/\bmatches\b/);
  await expect(page.locator('#flow-row-verdict-out-0')).toHaveText('物防不变 · 减生命');
  await expect(resultAxis(page, '生命')).toHaveText('减');
  await page.locator('#preview-observed-0').fill('163'); await page.locator('#preview-observed-0').press('Enter');

  // 3. 删除带旧顺序记录的配置：引用它的记录一起删，其余配置与血量记录刷新后正常恢复。
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const s = window.pveNatureUi.getSession();
    const skillId = catalog.skills.find(row => row.name === '火焰切割').id;
    s.observations = [
      { id: 'old-out', direction: 'outgoing', context: 'unknown', profileId: 'luoyin', skillId, damage: 163 },
      { id: 'old-hp', direction: 'hp', context: 'unknown', damage: 100 },
    ];
    window.pveNatureUi.setSession(s);
  });
  await selectProfile(page, 'luoyin');
  await ownMenu(page, 'delete');
  await page.locator('#config-ok').click();
  await expect(page.locator('#profile-select option')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#notice')).not.toContainText('未能恢复');
  await expect(page.locator('#profile-select')).toHaveValue('dimo');
  const restored = await session();
  expect(restored.profiles.map(p => p.id)).toEqual(['dimo']);
  expect(restored.observations.map(o => o.id)).toEqual(['old-hp']);
});

test('S5 nature lightweight pickers retain keyboard choices and return saved evolved targets to their initial form', async ({ page }) => {
  await openTool(page);
  await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const session = window.pveNatureUi.getSession();
    session.targetId = catalog.spirits.find(row => row.name === '翼龙').id;
    window.pveNatureUi.setSession(session);
  });
  const target = page.getByRole('combobox', { name: '选择野生目标', exact: true });
  await expect(target).toHaveValue('翼龙');
  await page.locator('#use-initial-form').click();
  await expect(target).toHaveValue('小翼龙');

  const own = page.getByRole('combobox', { name: '选择我方精灵', exact: true });
  await own.fill('迪莫');
  await own.press('Enter');
  await expect(own).toHaveValue('迪莫');
  const incoming = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await incoming.fill('猛烈撞击');
  await incoming.press('Enter');
  await expect(incoming).toHaveValue('猛烈撞击');
  await page.locator('#preview-incoming-damage-0').fill('50');
  await page.locator('#preview-incoming-damage-0').press('Enter');
  await page.reload();
  await expect(target).toHaveValue('小翼龙');
  await expect(own).toHaveValue('迪莫');
  await expect(incoming).toHaveValue('猛烈撞击');
  await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('50');
});

test('S5 nature shiny target column collapses to an edge handle on wide screens and is absent on phones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page);
  const column = page.locator('#flow-roster'), handle = page.locator('#flow-roster-tab');
  // 宽屏默认展开成左侧一列，不产生横向滚动，一屏放下。
  await expect(column).toBeVisible();
  await expect(handle).toBeHidden();
  await expect(column.locator('.fr-group h3')).toHaveText(['S5 异色', 'S2 异色', '通行证', '其他']);
  await expect(column.locator('.fr-item span')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const listed = await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    return [...document.querySelectorAll('[data-roster-id]')].map(item => catalog.spirits.find(row => row.id === item.dataset.rosterId))
      .map(row => ({ name: row.name, stage: row.stage, shiny: row.hasShinyForm }));
  });
  expect(listed.length).toBeGreaterThan(40);
  expect(listed.every(row => row.stage === '一阶' && row.shiny === true)).toBe(true);
  expect(listed.at(-1).name).toBe('云梦豚');
  // 选中：切换野怪并按异色计算，栏保持展开。
  await column.locator('.fr-item[title^="恶魔叮"]').click();
  const picker = page.getByRole('combobox', { name: '选择野生目标', exact: true });
  await expect(picker).toHaveValue('恶魔叮');
  await expect(page.locator('#target-shiny')).toBeChecked();
  await expect(column.locator('.fr-item[title^="恶魔叮"]')).toHaveAttribute('aria-pressed', 'true');
  const scroller = column.locator('.fr-scroll');
  const expectScroll = async top => {
    await expect.poll(async () => Math.abs(await scroller.evaluate(el => el.scrollTop) - top)).toBeLessThan(1);
  };
  const scrollTo = top => scroller.evaluate((el, value) => {
    el.scrollTo({ top: value, behavior: 'instant' });
    return el.scrollTop;
  }, top);
  // 当前选中项留在上方；往下浏览后关开，不再自动追到选中项。
  const browsedTop = await scrollTo(1200);
  expect(browsedTop).toBeGreaterThan(1000);
  await column.locator('.fr-close').click();
  await expect(column).toBeHidden();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box.x).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(4);
  await handle.click();
  await expect(column).toBeVisible();
  await expectScroll(browsedTop);
  // 选择当前可见的精灵会重算页面，但不移动名单的位置。
  const visibleId = await scroller.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll('.fr-item')].find(item => {
      const box = item.getBoundingClientRect();
      return box.top > bounds.top + 24 && box.bottom < bounds.bottom - 24;
    }).dataset.rosterId;
  });
  const visibleItem = column.locator(`[data-roster-id="${visibleId}"]`);
  await visibleItem.click();
  await expect(visibleItem).toHaveAttribute('aria-pressed', 'true');
  await expectScroll(browsedTop);
  // 展开状态刷新，恢复浏览位置而不是重新定位已选精灵。
  const refreshedTop = await scrollTo(browsedTop + 170);
  await page.reload();
  await expect(column).toBeVisible();
  await expectScroll(refreshedTop);
  // 滚动后同一轮事件立即关闭，不能等防抖落盘；隐藏状态刷新也保留位置。
  const closedTop = await scroller.evaluate(el => {
    el.scrollTo({ top: el.scrollTop + 220, behavior: 'instant' });
    const top = el.scrollTop;
    document.querySelector('#flow-roster .fr-close').click();
    return top;
  });
  await expect(column).toBeHidden();
  await page.reload();
  await expect(page.locator('#flow-result')).toBeVisible();
  await expect(column).toBeHidden();
  await handle.click();
  await expect(column).toBeVisible();
  await expectScroll(closedTop);
  // 没有异色形态的精灵不出现异色开关。
  await chooseTarget(page, '棋棋（白子）');
  await expect(page.locator('#target-shiny-control')).toBeHidden();
  await expectScroll(closedTop);
  // 手机隐藏时读到的 scrollTop=0，不能覆盖桌面的浏览位置。
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(column).toBeHidden();
  await expect(handle).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(column).toBeVisible();
  await expectScroll(closedTop);
});

async function selectExchangeWhale(page) {
  await openTool(page);
  await openConfig(page);
  const own=page.getByRole('combobox',{name:'选择我方精灵',exact:true});
  await own.fill('龙息帕尔');
  await page.locator('#own-picker-listbox [role="option"]').filter({hasText:'龙息帕尔'}).click();
  const target=page.getByRole('combobox',{name:'选择野生目标',exact:true});
  await target.fill('深蓝鲸');
  await page.locator('#target-picker-listbox [role="option"]').filter({hasText:'深蓝鲸'}).click();
  await page.locator('#level-seg button').filter({hasText:/^43$/}).click();
}

test('Evil Exchange fifth row keeps an independent exact HP observation across profiles and refresh',async({page})=>{
  test.setTimeout(60000);
  await openTool(page);
  const toggle=page.getByRole('switch',{name:'恶念交换第五行'});
  const row=page.locator('#flow-exchange-row'),heal=page.locator('#flow-exchange-healing');
  await expect(toggle).not.toBeChecked();
  await expect(row).toBeHidden();
  await selectExchangeWhale(page);
  await expect(toggle).toBeChecked();
  await expect(page.locator('#flow-exchange-values b')).toHaveText(['214','235','257']);
  await page.locator('#target-shiny').check();
  await expect(page.locator('#flow-exchange-values b')).toHaveText(['214','235','257']);
  await heal.fill('257');
  await expect(page.locator('#flow-exchange-verdict')).toHaveText('加生命');
  await expect(page.locator('#flow-exchange-condition-label')).toHaveText('破盾10%');
  await page.locator('#flow-exchange-condition-gear').click();
  await page.locator('#flow-exchange-percent').fill('25');
  await page.locator('#flow-exchange-percent').press('Enter');
  await expect(page.locator('#flow-exchange-condition-pop')).toBeHidden();
  await expect(page.locator('#flow-exchange-condition-label')).toHaveText('余血25% · 手填');
  await expect(page.locator('#flow-exchange-values b')).toHaveText(['178','196','214']);
  await expect(heal).toHaveValue('257');
  await heal.fill('214');
  await expect(resultAxis(page,'生命')).toHaveText('加');
  await page.reload();
  await expect(page.locator('#flow-exchange-condition-label')).toHaveText('余血25% · 手填');
  await expect(heal).toHaveValue('214');
  await page.locator('#flow-exchange-condition-gear').click();
  await page.locator('#flow-exchange-reset').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#flow-exchange-condition-label')).toHaveText('破盾10%');
  await heal.fill('257');
  await expect(resultAxis(page,'生命')).toHaveText('加');
  await expect(page.locator('#flow-result .fm-cell.on')).toHaveText(['沉默','平和','忧郁','粗心','踏实']);
  for(const stat of ['物攻','魔攻','物防','魔防']) await expect(resultAxis(page,stat)).toHaveText('待区分');
  await selectProfile(page,'dimo');
  await expect(row).toBeVisible();
  await expect(heal).toHaveValue('257');
  await page.reload();
  await expect(heal).toHaveValue('257');
  await expect(resultAxis(page,'生命')).toHaveText('加');
  await toggle.uncheck();
  await expect(row).toBeHidden();
  await expect(resultAxis(page,'生命')).toHaveText('待测');
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(heal).toHaveValue('257');
  await heal.fill('256');
  await expect(page.locator('#flow-exchange-verdict')).toContainText('三档不符');
  await expect(resultAxis(page,'生命')).toHaveText('记录冲突');
  await heal.fill('257');
  await page.locator('#flow-hp-value').fill('783');
  await page.locator('#flow-hp-value').press('Enter');
  await expect(resultAxis(page,'生命')).toHaveText('记录冲突');
  await heal.fill('abc');
  await expect(page.locator('#flow-exchange-verdict')).toHaveText('填写正整数回血量');
  await expect(resultAxis(page,'生命')).toHaveText('不变');
  await heal.fill('235');
  await expect(resultAxis(page,'生命')).toHaveText('不变');
  await page.locator('#flow-outgoing-card .flow-clear').click();
  await expect(heal).toHaveValue('');
  await expect(page.locator('#flow-hp-value')).toHaveValue('783');
  await heal.fill('235');
  await page.locator('#flow-next').click();
  await expect(heal).toHaveValue('');
  await expect(page.locator('#flow-hp-value')).toHaveValue('');
  await expect(toggle).toBeChecked();
  await heal.fill('235');
  const picker=page.getByRole('combobox',{name:'选择野生目标',exact:true});
  await picker.fill('可爱猿');
  await page.locator('#target-picker-listbox [role="option"]').filter({hasText:'可爱猿'}).click();
  await expect(heal).toHaveValue('');
  await expect(resultAxis(page,'生命')).toHaveText('待测');
});

test('Evil Exchange fifth row remains usable on desktop and narrow mobile',async({page})=>{
  test.setTimeout(60000);
  await selectExchangeWhale(page);
  await page.locator('#flow-exchange-healing').fill('257');
  for(const [width,height] of [[1440,1000],[900,900],[390,844],[320,740]]) {
    await page.setViewportSize({width,height});
    const row=page.locator('#flow-exchange-row');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:`artifacts/s5-player-flow/screenshots/s5-evil-exchange-${width}.png`});
    await page.locator('#flow-exchange-healing').fill('235');
    await expect(page.locator('#flow-exchange-verdict')).toHaveText('生命不变');
    await page.locator('#flow-exchange-healing').fill('257');
    await expect(page.locator('#flow-exchange-verdict')).toHaveText('加生命');
    await page.locator('#flow-exchange-condition-gear').click();
    await expect(page.locator('#flow-exchange-condition-pop')).toBeVisible();
    await expect(page.locator('#flow-exchange-percent')).toHaveValue('10');
    const box=await page.locator('#flow-exchange-condition-pop').boundingBox();
    expect(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=height).toBe(true);
    await page.screenshot({path:`artifacts/s5-player-flow/screenshots/s5-evil-exchange-conditions-${width}.png`});
    await page.keyboard.press('Escape');
  }
});
