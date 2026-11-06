import { expect, test } from "@playwright/test";
import { resetUiuxStorage, waitForAppReady } from "./helpers/uiux-helpers.js";

const toolPath = "/tools/s5-nature/index.html";

test("S5 nature display power and conditional attacks calculate immediately without duplicate boosts", async ({ page }) => {
  await page.goto(toolPath);
  await expect(page.getByRole('heading', { name: 'S5奇异性格计算', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('S5奇异性格计算 · 洛克计算器');
  await chooseTarget(page, '可爱猿');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '41', exact: true }).click();
  await page.locator('#star-seg').getByRole('button', { name: '10★', exact: true }).click();
  await page.locator('#nature-picker-trigger').click();
  await page.getByRole('textbox', { name: '搜索性格', exact: true }).fill('固执');
  await page.locator('[data-nature-id="adamant"]').click();
  await page.locator('#ivs-zero').click();
  for (const stat of ['hp', 'physicalAttack', 'magicalDefense']) await page.locator(`[data-iv-stat="${stat}"]`).click();
  const skillPicker = page.getByRole('combobox', { name: '我方技能 1', exact: true });
  await skillPicker.fill('火焰切割');
  await page.getByRole('option').getByText('火焰切割', { exact: true }).click();
  const base = page.locator('#preview-cells-0 [data-nature-group="hp"][data-nature-condition="base"]');
  await expect(base.locator('.dmg')).toHaveText('103');
  await expect(base.locator('.rem b')).toHaveText('77%');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 100');
  await page.locator('#own-dice').selectOption('custom');
  await page.locator('#own-dice-physicalAttackMultiplier').fill('1.1');
  await page.locator('#own-dice-physicalAttackMultiplier').press('Tab');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 110');
  await expect(base.locator('.dmg')).toHaveText('113');
  const condition = page.locator('[data-preview-row="0"] .preview-condition');
  await condition.locator('summary').click();
  const power = page.locator('#preview-condition-0-displayedPower');
  await power.fill('110');
  await power.press('Tab');
  await expect(base.locator('.dmg')).toHaveText('113');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('手填');
  await page.reload();
  await expect(power).toHaveValue('110');
  await expect(base.locator('.dmg')).toHaveText('113');
  await condition.locator('summary').click();
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
  await expect(page.locator('#preview-condition-0-legacyPower')).toContainText('最终威力 90');
  await page.locator('#preview-condition-0-resetPower').click();
  await expect(page.locator('#preview-condition-0-legacyPower')).toBeHidden();
  await expect(base.locator('.dmg')).toHaveText('113');
  await page.locator('#own-dice').selectOption('none');
  await chooseTarget(page, '伊雷龙');
  await expect(base.locator('.dmg')).toHaveText('182');
  await expect(base.locator('.rem b')).toHaveText('57%');
  await expect(page.locator('#preview-skill-meta-0')).toContainText('显示威力 50');
  // Conditional damage moves must produce numbers as soon as selected.
  await skillPicker.fill('先发制人');
  await page.getByRole('option').getByText('先发制人', { exact: true }).click();
  await expect(base.locator('.dmg')).toHaveText('111');
  await expect(base.locator('.rem b')).toHaveText('74%');
  await expect(power).toHaveValue('');
  await page.locator('#preview-observed-0').fill('111');
  await page.locator('#preview-observed-0').press('Tab');
  await expect(base).toHaveClass(/\bhit\b/);
  await expect(page.locator('#preview-verdict')).not.toContainText('未找到匹配');
  const secondPicker = page.getByRole('combobox', { name: '我方技能 2', exact: true });
  await secondPicker.fill('地刺');
  await page.getByRole('option').getByText('地刺', { exact: true }).click();
  const ground = page.locator('#preview-cells-1 [data-nature-group="hp"][data-nature-condition="base"]');
  await expect(ground.locator('.dmg')).toHaveText('364');
  await expect(ground.locator('.rem b')).toHaveText('13%');
  await expect(page.locator('#preview-skill-meta-1')).toContainText('显示威力 180');
  await expect(page.locator('#preview-condition-1-displayedPower')).toHaveValue('');
  if (await condition.evaluate(node => node.open)) await condition.locator('summary').click();
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await condition.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/s5-conditional-power-${width}.png` });
  }
});

async function chooseTarget(page, name) {
  const picker = page.getByRole("combobox", { name: "选择野生目标", exact: true });
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
  const entry = calculations.getByRole("link", { name: "S5奇异性格计算", exact: true });
  await expect(entry).toHaveAttribute("href", toolPath);
  await expect(entry).toHaveClass("app-menu__nature-tool");
  expect(await entry.evaluate(node => getComputedStyle(node).gridColumn)).toBe("1 / -1");
  await entry.click();
  await expect(page).toHaveURL(/\/tools\/s5-nature\/index\.html$/);
  await expect(page.getByRole("heading", { name: "S5奇异性格计算", exact: true })).toBeVisible();
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
    for (const value of await page.locator(".pcell .rem b").all()) await expect(value).toHaveText(/^\d+%$/);
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
  await expect.poll(() => page.locator('img[src^="/assets/"]').evaluateAll(images =>
    images.length >= 2 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);

  await chooseTarget(page, "可爱猿");
  await page.getByRole("group", { name: "野怪等级", exact: true })
    .getByRole("button", { name: "41", exact: true }).click();
  await expectHp(page, [410, 446, 374]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const heading of await page.locator(".preview-heading h2").all()) {
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
  await expect(menu).not.toContainText("S5奇异性格计算");
});

test("S5 nature incoming attack shows measured whale damage and matches nature", async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="dimo"]').click();
  await page.locator('#nature-picker-trigger').click();
  await page.getByRole('textbox', { name: '搜索性格', exact: true }).fill('莽撞');
  await page.locator('[data-nature-id="rash"]').click();
  await page.locator('#ivs-zero').click();
  for (const stat of ['physicalAttack', 'magicalAttack', 'speed']) {
    await page.locator(`[data-iv-stat="${stat}"]`).click();
  }
  await page.locator('#own-trait-stacks').fill('0');
  await page.locator('#own-trait-stacks').press('Tab');
  await page.locator('#own-dice').selectOption('none');
  await chooseTarget(page, '深蓝鲸');
  await page.getByRole('group', { name: '野怪等级', exact: true })
    .getByRole('button', { name: '41', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await picker.fill('甩水');
  await page.getByRole('option').getByText('甩水', { exact: true }).click();
  const cells = page.locator('#preview-incoming-cells-0');
  const normal = cells.locator('[data-nature-group="other"][data-nature-condition="base"]');
  const raised = cells.locator('[data-nature-group="magicalAttack"][data-nature-condition="base"]');
  await expect(normal.locator('.dmg')).toHaveText('41');
  await expect(raised.locator('.dmg')).toHaveText('45');
  const result = await page.evaluate(() => window.pveNatureUi.getPreview());
  expect(result.ownPanel.magicalDefense).toBe(163);
  expect(result.incomingList[0].effectivePower).toBe(37.5);
  expect(result.incomingList[0].manualPower).toBe(false);
  await page.locator('#preview-incoming-damage-0').fill('45');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(raised).toHaveClass(/\bhit\b/);
  await expect(normal).toHaveClass(/\bmiss\b/);
  await expect(page.locator('#preview-verdict [data-stat="magicalAttack"] b')).toHaveText('加');

  // A skill power die must recalculate the shown incoming damage immediately.
  await page.locator('#target-dice').selectOption('manual-power-plus-40');
  await expect(raised.locator('.dmg')).toHaveText('106');
  await page.locator('#target-dice').selectOption('none');
  await expect(raised.locator('.dmg')).toHaveText('45');
  await page.locator('#preview-incoming-damage-0').click();
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await cells.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(raised.locator('.dmg')).toBeVisible();
    await page.screenshot({ path: `output/playwright/s5-incoming-${width}.png` });
    if (width === 1280) await page.locator('#preview-incoming').locator('..')
      .screenshot({ path: 'output/playwright/s5-incoming-result.png' });
  }
  await picker.fill('天洪');
  await page.getByRole('option').getByText('天洪', { exact: true }).click();
  await expect(normal.locator('.dmg')).toHaveText('209');
  await expect(page.locator('#preview-incoming-condition-0-displayedPower')).toHaveValue('');
  const flood = await page.evaluate(() => window.pveNatureUi.getPreview().incomingList[0]);
  expect(flood.displayedPower).toBe(187.5);
  expect(flood.manualPower).toBe(false);
});

test("S5 nature presets share calculator configurations and preserve saved manual edits", async ({ page }) => {
  await page.goto(toolPath);
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  const active = () => page.evaluate(() => {
    const session = window.pveNatureUi.getSession();
    return session.profiles.find(row => row.id === session.activeProfileId);
  });
  for (const [id, nature, ivs, moves, panel] of [
    ['luoyin', 'adamant', ['hp','physicalAttack','physicalDefense'], ['火焰切割','地刺','彼岸之手','鸣沙陷阱'], [403,312,136,216,137,143]],
    ['dimo', 'rash', ['physicalAttack','magicalAttack','speed'], ['光球','棘突','热砂','超导'], [374,181,181,175,163,223]],
  ]) {
    await page.locator(`[data-profile="${id}"]`).click();
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
  await expect(page.locator('#star-seg').getByRole('button', { name: '8★', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await active()).displayIvs.magicalAttack).toBe(0);
  await page.locator('#load-own-preset').click();
  expect((await active()).awakening).toBe(5);
  expect((await active()).displayIvs.magicalAttack).toBe(60);
  await page.locator('#undo').click();
  expect((await active()).awakening).toBe(3);
  expect((await active()).displayIvs.magicalAttack).toBe(0);
  await page.locator('#load-own-preset').click();
  for (const [width, height] of [[1280,1000], [390,844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#load-own-preset').scrollIntoViewIfNeeded();
    await expect(page.locator('#load-own-preset')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/s5-presets-${width}.png` });
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
  await page.locator('#load-own-preset').click();
  expect((await active()).natureId).toBe('rash');
  expect((await active()).preview.skillIds).toEqual(shared.skills);
  await page.reload();
  await expect(picker).toHaveValue('恶魔狼王');
  expect((await active()).natureId).toBe('rash');
  for (const name of ['圆号鱼', '圣龙阿布']) {
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
  await page.goto(toolPath);
  await expect(page.locator('#load-own-preset')).toBeEnabled();
  await chooseTarget(page, '可爱猿');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '41', exact: true }).click();
  const cells = page.locator('#preview-cells-0');
  const hp = cells.locator('[data-nature-group="hp"][data-nature-condition="base"]');
  const other = cells.locator('[data-nature-group="magicalDefense"][data-nature-condition="base"]');
  const damage = page.locator('#preview-observed-0'), remaining = page.locator('#preview-remaining-0');
  const verdict = page.locator('#preview-verdict .verdict-big');
  const hpAxis = page.locator('#preview-verdict [data-stat="hp"] b');
  await expect(cells.locator('.pcell-stack')).toHaveCount(3);
  await expect(page.locator('#preview-outgoing')).not.toContainText('其他增益');
  await expect(cells.locator('.same-placeholder')).toHaveCount(0);
  const magicDefense = cells.locator('[data-nature-group="magicalDefense"][data-nature-condition="base"]');
  await expect(magicDefense.locator('.dmg')).toHaveText('103');
  await expect(magicDefense.locator('[data-hp-nature="neutral"] b')).toHaveText('75%');
  await expect(magicDefense.locator('[data-hp-nature="down"] b')).toHaveText('73%');
  await expect(cells).not.toContainText('同其他');
  await expect(hp.locator('.dmg')).toHaveText('103');
  await expect(other.locator('.dmg')).toHaveText('103');
  await expect(hp.locator('.rem b')).toHaveText('77%');
  await expect(other.locator('[data-hp-nature="down"] b')).toHaveText('73%');
  // A bookmark never constitutes a measurement, including after reload.
  await hp.locator('.rem').click();
  await expect(hp).toHaveAttribute('aria-pressed', 'true');
  await expect(verdict).toHaveText('待实测');
  await page.reload();
  await expect(hp).toHaveAttribute('aria-pressed', 'true');
  await expect(verdict).toHaveText('待实测');
  await damage.fill('103'); await damage.press('Tab');
  await expect(hpAxis).toHaveText('—');
  await remaining.fill('77'); await remaining.press('Tab');
  await expect(hpAxis).toHaveText('加');
  await expect(page.locator('#preview-verdict .nature-axis')).toHaveCount(5);
  await expect(page.locator('#preview-verdict')).toContainText('伤害 103 · 余 77%');
  // Picking a different column neither discards measurements nor changes the result.
  await other.locator('.dmg').click();
  await expect(other).toHaveAttribute('aria-pressed','true');
  await expect(damage).toHaveValue('103'); await expect(remaining).toHaveValue('77');
  await expect(hpAxis).toHaveText('加');
  await page.reload();
  await expect(damage).toHaveValue('103'); await expect(remaining).toHaveValue('77');
  // Each field individually exists, but no single nature matches this pair.
  await damage.fill('94'); await damage.press('Tab');
  await expect(verdict).toHaveText('数值未匹配');
  await damage.fill('103'); await damage.press('Tab');
  await remaining.fill(''); await remaining.press('Tab');
  await expect(damage).toHaveValue('103'); await expect(hpAxis).toHaveText('—');
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
    await page.locator('[data-preview-row="0"]').locator('.pskill').scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(damage).toBeVisible(); await expect(remaining).toBeVisible();
    if(width<800) expect(await damage.boundingBox().then(box=>box.width)).toBeGreaterThan(60);
    await page.screenshot({path:`output/playwright/s5-compact-${width}.png`});
  }
  // Undo feedback floats over the document and does not move the skill input.
  await page.setViewportSize({width:1920,height:1080});
  const top = await damage.evaluate(node=>node.getBoundingClientRect().top+scrollY);
  await page.locator('#undo').click();
  expect(await damage.evaluate(node=>node.getBoundingClientRect().top+scrollY)).toBe(top);
  await chooseTarget(page, '小翼龙');
  const picker=page.getByRole('combobox',{name:'我方技能 1',exact:true});
  await picker.fill('地震'); await page.getByRole('option').getByText('地震',{exact:true}).click();
  await expect(hp.locator('.ko')).toHaveText('0%');
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
  await expect(page.locator('#preview-verdict .evidence')).toHaveCount(0);
});
