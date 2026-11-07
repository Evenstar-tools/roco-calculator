import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resetUiuxStorage, waitForAppReady } from "./helpers/uiux-helpers.js";

const toolPath = "/tools/s5-nature/index.html";

test('S5 nature type dice calculate single resistance and preserve entered power without double counting', async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="luoyin"]').click();
  await page.locator('#load-own-preset').click();
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
  await page.screenshot({ path: 'output/playwright/s5-type-dice-single-relation.png', fullPage: true });
});


test('S5 nature searches all ten battlepass initial forms in the default and dedicated filters', async ({ page }) => {
  test.setTimeout(60000);
  const names = ['绒绒', '犀角鸟', '小雪人', '爆焰仔', '咬咬小子', '足尖元件', '热团团', '新月鹭', '地银链', '沉金兽'];
  await page.goto(toolPath);
  await expect(page.locator('#target-filter')).toHaveValue('initial');
  const source = await page.evaluate(async () => {
    const catalog = await (await fetch('./data/catalog.json')).json();
    const seasons = await (await fetch('./data/season-targets.json')).json();
    const group = catalog.targetGroups.find(row => row.id === 'battlepass');
    return { stageAudit: catalog.meta.strengthStageAudit,
      verifiedStages: catalog.spirits.filter(row => row.wildStrengthStageEvidence?.status === 'verified').length,
      unconfirmedStages: catalog.spirits.filter(row => row.wildStrengthStageEvidence?.status === 'unconfirmed').length,
      group, fallback: seasons.groups.find(row => row.id === 'battlepass'),
      spirits: catalog.spirits.filter(row => group.spiritIds.includes(row.id)) };
  });
  expect(source.stageAudit.counts).toEqual({ catalog: 694, verified: 666, unconfirmed: 28, mismatched: 0 });
  expect(source.stageAudit.damageFormulaVerified).toBe(false);
  expect(source.verifiedStages).toBe(666);
  expect(source.unconfirmedStages).toBe(28);
  expect(source.group).toEqual(source.fallback);
  expect(source.group.spiritIds).toHaveLength(10);
  expect(new Set(source.group.spiritIds).size).toBe(10);
  expect(source.group.families.map(row => row.name)).toEqual(names);
  expect(source.spirits.every(row => row.stage === '一阶')).toBe(true);
  expect(Object.fromEntries(source.spirits.map(row => [row.name, row.wildStrengthStage]))).toEqual({
    '绒绒': 1, '犀角鸟': 1, '小雪人': 2, '爆焰仔': 2, '咬咬小子': 2,
    '足尖元件': 2, '热团团': 1, '新月鹭': 1, '地银链': 1, '沉金兽': 1,
  });
  for (const name of names) {
    await chooseTarget(page, name);
    expect(await page.evaluate(() => window.pveNatureUi.getSession().targetId)).toBe(source.spirits.find(row => row.name === name).id);
    await expect(page.locator('#target-hp-range')).toContainText('普通');
  }
  await page.locator('#target-filter').selectOption('battlepass');
  const picker = page.getByRole('combobox', { name: '选择野生目标', exact: true });
  await picker.click();
  const options = page.locator('#target-picker-listbox [role="option"]');
  await expect(options).toHaveCount(10);
  expect(await options.locator('strong').allTextContents()).toEqual(expect.arrayContaining(names));
  await expect(options.first()).toContainText('通行证');
  await picker.fill('沉金');
  await expect(options).toHaveCount(1);
  await expect(options).toContainText('沉金兽');
  await picker.press('Escape');
  for (const [filter, target] of [['S2', '恶魔叮'], ['S5', '深蓝鲸']]) {
    await page.locator('#target-filter').selectOption(filter);
    await chooseTarget(page, target);
  }
  await page.locator('#target-filter').selectOption('battlepass');
  await chooseTarget(page, '沉金兽');
  const coefficientDetails = page.locator('.coefficient-details');
  await expect(coefficientDetails).not.toHaveAttribute('open', '');
  await coefficientDetails.locator('summary').click();
  await expect(coefficientDetails).toContainText('强度阶位 1 · 包体字段已核对');
  await expect(coefficientDetails).toContainText('原始伤害公式尚未还原');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await picker.click();
    await expect(options).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/s5-battlepass-targets-${width}.png` });
    await picker.press('Escape');
  }
});



for (const activation of ['automatic', 'waiting']) test(`S5 nature delays old cached modules until a real worker confirms its policy and retries after a slow install (${activation})`, async ({ page, context }) => {
  const publicRoot = path.resolve(process.env.S5_UPGRADE_PUBLIC_ROOT || 'dist/client');
  const currentWorker = readFileSync('public/sw.js', 'utf8');
  // Reproduce the observed installed/waiting state in one variant. All policy,
  // activation-message and fetch handlers still run as the real worker code.
  const workerSource = activation === 'waiting'
    ? currentWorker.replace('.then(() => self.skipWaiting()),', '.then(() => undefined),')
    : currentWorker;
  if (activation === 'waiting') expect(workerSource).not.toBe(currentWorker);
  const cacheName = 'rock-calculator-webapp-browser-old';
  const legacyWorker = `
    self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', event => {
      if (event.request.method !== 'GET') return;
      if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request)); return; }
      event.respondWith((async () => {
        const cache = await caches.open('${cacheName}');
        const saved = await cache.match(event.request);
        const fresh = fetch(event.request).then(async response => {
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        });
        if (saved) { event.waitUntil(fresh.catch(() => {})); return saved; }
        return fresh;
      })());
    });`;
  let useCurrent = false;
  let releaseInstall;
  const installGate = new Promise(resolve => { releaseInstall = resolve; });
  const resourceRequests = [];
  page.on('request', request => resourceRequests.push(new URL(request.url()).pathname));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/seed') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Worker fixture</title>');
      return;
    }
    if (pathname === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(useCurrent ? workerSource : legacyWorker);
      return;
    }
    if (useCurrent && pathname === '/manifest.webmanifest') await installGate;
    const file = path.resolve(publicRoot, '.' + pathname);
    if (!file.startsWith(publicRoot + path.sep)) { response.writeHead(404).end(); return; }
    const contentTypes = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
    try { response.end(readFileSync(file)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin + '/seed');
    await page.evaluate(async ({ cacheName, toolPath }) => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      const cache = await caches.open(cacheName);
      const toolRoot = toolPath.replace('index.html', '');
      await cache.put(toolRoot + 'ui.mjs', new Response('globalThis.oldS5UiExecuted = true; throw new Error("old UI mixed into new HTML");',
        { headers: { 'Content-Type': 'text/javascript' } }));
      await cache.put(toolRoot + 'web-startup.mjs', new Response('globalThis.oldS5StartupExecuted = true; throw new Error("old bootstrap");',
        { headers: { 'Content-Type': 'text/javascript' } }));
      await cache.put(toolRoot + 'matchup.css', new Response('body { background: red; }', { headers: { 'Content-Type': 'text/css' } }));
      await cache.put(toolRoot + 'data/catalog.json', new Response('{"old":true}', { headers: { 'Content-Type': 'application/json' } }));
    }, { cacheName, toolPath });
    useCurrent = true;
    resourceRequests.length = 0;
    const startedAt = Date.now();
    await page.goto(origin + toolPath);
    await expect(page.locator('#tool-startup-status')).toHaveText('缓存更新尚未完成，请刷新重试。');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3000);
    expect(resourceRequests.filter(url => /\/(?:ui\.mjs|[^/]+\.css|data\/[^/]+\.json)$/.test(url))).toEqual([]);
    expect(await page.evaluate(() => Boolean(window.oldS5UiExecuted || window.oldS5StartupExecuted || window.pveNatureUi))).toBe(false);
    await expect(page.getByRole('heading', { name: 'S5奇遇性格计算', exact: true })).toBeHidden();
    expect(await page.evaluate(async cacheName => (await (await caches.open(cacheName)).match('/tools/s5-nature/ui.mjs')).text(), cacheName))
      .toContain('oldS5UiExecuted');

    releaseInstall();
    const workerPolicy = waitingAllowed => page.evaluate(async waitingAllowed => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const worker = (waitingAllowed && registration?.waiting) || navigator.serviceWorker.controller;
      return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 300);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timer); channel.port1.close();
        resolve(data?.type === 'S5_TOOL_CACHE_POLICY' && data?.policy === 'network-first-v1');
      };
      worker.postMessage({ type: 'GET_S5_TOOL_CACHE_POLICY' }, [channel.port2]);
    }); }, waitingAllowed);
    // The failed page has deliberately stopped. Retry once installation is done;
    // an installed worker may still be waiting until the retry activates it.
    await expect.poll(() => workerPolicy(true), { timeout: 10_000 }).toBe(true);
    if (activation === 'waiting') {
      expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/')).waiting?.state)).toBe('installed');
      expect(await workerPolicy(false)).toBe(false);
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'S5奇遇性格计算', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.pveNatureUi))).toBe(true);
    expect(await page.evaluate(() => Boolean(window.oldS5UiExecuted || window.oldS5StartupExecuted))).toBe(false);
    expect(await workerPolicy(false)).toBe(true);
    await expect(page.locator('#tool-startup-status')).toHaveCount(0);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'S5奇遇性格计算', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.pveNatureUi))).toBe(true);
  } catch (error) {
    const workerState = await page.evaluate(async () => {
      const capability = worker => worker && new Promise(resolve => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 300);
        channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); resolve(data); };
        worker.postMessage({ type: 'GET_S5_TOOL_CACHE_POLICY' }, [channel.port2]);
      });
      return {
      controller: navigator.serviceWorker.controller && { url: navigator.serviceWorker.controller.scriptURL, state: navigator.serviceWorker.controller.state },
      registrations: await Promise.all((await navigator.serviceWorker.getRegistrations()).map(async registration => ({
        scope: registration.scope,
        installing: registration.installing && { url: registration.installing.scriptURL, state: registration.installing.state },
        waiting: registration.waiting && { url: registration.waiting.scriptURL, state: registration.waiting.state, capability: await capability(registration.waiting) },
        active: registration.active && { url: registration.active.scriptURL, state: registration.active.state, capability: await capability(registration.active) },
      }))),
      caches: await caches.keys(),
    }; }).catch(diagnosticError => ({ diagnosticError: diagnosticError.message }));
    await test.info().attach('worker-state', { body: JSON.stringify(workerState, null, 2), contentType: 'application/json' });
    throw error;
  } finally {
    releaseInstall();
    await context.setOffline(false);
    await page.goto('about:blank');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("S5 nature display power and conditional attacks calculate immediately without duplicate boosts", async ({ page }) => {
  await page.goto(toolPath);
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
  const base = page.locator('#preview-cells-0 [data-nature-group="hp"][data-nature-condition="base"]');
  await expect(base.locator('.dmg')).toHaveText('103');
  await expect(base.locator('.rem b')).toHaveText('77%');
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
  await page.keyboard.press('Escape');
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await condition.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/s5-conditional-power-${width}.png` });
  }
});

async function clearOwnIvs(page) {
  for (const stat of ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed']) {
    const button = page.locator(`[data-iv-stat="${stat}"]`);
    if (await button.getAttribute('aria-pressed') === 'true') await button.click();
  }
}

async function setDice(page, side, id) {
  const toggle = page.locator(`#${side}-dice-ui [data-dice-switch]`);
  if (id === 'none') await toggle.uncheck();
  else {
    await toggle.check();
    await page.locator(`#${side}-dice`).selectOption(id);
  }
}

async function chooseTarget(page, name) {
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
  await expect(menu).not.toContainText("S5奇遇性格计算");
});

test("S5 nature incoming attack shows measured whale damage and matches nature", async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="dimo"]').click();
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
  await expect(page.locator('#preview-verdict [data-stat="magicalAttack"] b')).toHaveText('加');

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

test("S5 nature defense branch selection preserves HP and incoming, clears measurements and supports undo", async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('#target-filter').selectOption('all');
  await chooseTarget(page, '毛毛');
  const branch = page.getByRole('combobox', { name: '野怪防御分支', exact: true });
  await expect(branch).toBeVisible();
  await expect(page.locator('#preview-cells-0')).toContainText('防御分支');
  const incoming = page.getByRole('combobox', { name: '敌方技能 1', exact: true });
  await incoming.fill('抓挠');
  await page.getByRole('option').getByText('抓挠', { exact: true }).click();
  await expect(page.locator('#preview-incoming-cells-0 .axis-label')).toHaveText(['减物攻', '物攻不变', '加物攻']);
  const baseline = await page.evaluate(() => window.pveNatureUi.getPreview());
  expect(baseline.incomingList[0].status).toBe('estimated');
  const forms = await branch.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  expect(forms.length).toBeGreaterThan(1);
  await branch.selectOption(forms[0]);
  await expect(page.locator('#preview-cells-0 .dmg').first()).toHaveText(/^\d+$/);
  const selected = await page.evaluate(() => window.pveNatureUi.getPreview());
  const incomingValues = result => result.incomingList[0].predictions.map(row =>
    [row.natureId, row.damage, row.attackerStat, row.targetHpMax]);
  expect(incomingValues(selected)).toEqual(incomingValues(baseline));
  await page.locator('#preview-incoming-damage-0').fill('10');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await branch.selectOption(forms[1]);
  await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('');
  await page.locator('#undo').click();
  await expect(branch).toHaveValue(forms[0]);
  await expect(page.locator('#preview-incoming-damage-0')).toHaveValue('10');
  await page.reload();
  await expect(branch).toHaveValue(forms[0]);
  await chooseTarget(page, '深蓝鲸');
  await expect(branch).toBeHidden();
  expect(await page.evaluate(() => window.pveNatureUi.getSession().wildStatFormId)).toBe('');
  const rejected = await page.evaluate(formId => {
    const session = window.pveNatureUi.getSession();
    session.wildStatFormId = formId;
    try { window.pveNatureUi.setSession(session); return false; } catch { return true; }
  }, forms[0]);
  expect(rejected).toBe(true);
});

test("S5 nature level evidence does not confirm a fixed level or a single matching attack", async ({ page }) => {
  await page.goto(toolPath);
  await chooseTarget(page, '小翼龙');
  const levels = page.getByRole('group', { name: '野怪等级', exact: true });
  await levels.getByRole('button', { name: '42', exact: true }).click();
  const picker = page.getByRole('combobox', { name: '我方技能 1', exact: true });
  await picker.fill('先发制人');
  await page.getByRole('option').getByText('先发制人', { exact: true }).click();
  const damage = await page.locator('#preview-cells-0 [data-nature-group="hp"][data-nature-condition="base"] .dmg').textContent();
  await page.locator('#preview-observed-0').fill(damage);
  await page.locator('#preview-observed-0').press('Tab');
  await expect(page.locator('.verdict-level')).not.toContainText('✓');
  await levels.getByRole('button', { name: '41–43级全部', exact: true }).click();
  await page.locator('#preview-observed-0').fill(damage);
  await page.locator('#preview-observed-0').press('Tab');
  await expect(page.locator('.verdict-level')).not.toContainText('✓');
  await expect(page.locator('#preview-comparison')).toContainText('我方 1/1 招吻合');
});

test("S5 nature incoming damage above own HP still identifies unchanged magical attack", async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="luoyin"]').click();
  await page.locator('#load-own-preset').click();
  await page.locator('#star-seg').getByRole('button', { name: '10★', exact: true }).click();
  await chooseTarget(page, '伊雷龙');
  await page.getByRole('group', { name: '野怪等级', exact: true })
    .getByRole('button', { name: '43', exact: true }).click();
  await setDice(page, 'target', 'custom');
  await page.locator('#target-dice-magicalAttackMultiplier').fill('1.3');
  await page.locator('#target-dice-magicalAttackMultiplier').press('Tab');
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
  const verdict = page.locator('#preview-verdict');
  await expect(verdict.locator('.verdict-big')).toHaveText(/^\d+ 个模型候选$/);
  await expect(verdict.locator('[data-stat="magicalAttack"] b')).toHaveText('不变');
  await expect(verdict.locator('.evidence')).toContainText('升龙咆哮 总伤 660');
  await page.reload();
  await expect(damage).toHaveValue('660');
  await expect(verdict.locator('[data-stat="magicalAttack"] b')).toHaveText('不变');
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
  await expect(verdict).toHaveText('模型未吻合');
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
    await page.screenshot({path:`output/playwright/s5-compact-${width}.png`});
    if (fallbackFont) await fallbackFont.evaluate(node => node.remove());
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


test('S5 nature star changes keep fixed-panel incoming damage monotone with wild polarization zero', async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="luoyin"]').click();
  await page.locator('#load-own-preset').click();
  await chooseTarget(page, '深蓝鲸');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '42', exact: true }).click();
  await setDice(page, 'own', 'none');
  await setDice(page, 'target', 'none');
  await page.getByRole('combobox', { name: '敌方技能 1', exact: true }).fill('气泡');
  await page.getByRole('option').getByText('气泡', { exact: true }).click();
  let previous = Infinity;
  for (const stars of [5, 6, 7, 8, 9, 10]) {
    await page.locator('#star-seg').getByRole('button', { name: `${stars}★`, exact: true }).click();
    const result = await page.evaluate(() => window.pveNatureUi.getPreview());
    expect(result.ownPanel.magicalDefense).toBe(137);
    const entry = result.incomingList[0];
    expect(entry.typeInteraction.polarizationPercent).toBe(0);
    expect(entry.typeInteraction.dullingPercent).toBe((stars - 5) * 45);
    const hit = entry.predictions.find(row => row.upStat === 'magicalAttack' && row.downStat === 'speed').damage;
    expect(hit).toBeLessThanOrEqual(previous);
    expect(hit).toBe(stars === 5 ? 370 : stars === 10 ? 222 : 266);
    await expect(page.locator('#preview-incoming-cells-0')).toContainText(String(hit));
    previous = hit;
  }
  await page.reload();
  await expect(page.locator('#star-seg').getByRole('button', { name: '10★', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preview-incoming-cells-0')).toContainText('222');
});

test('S5 nature first action survives reload and manual power reset without double adding burst', async ({ page }) => {
  await page.goto(toolPath);
  await page.locator('[data-profile="luoyin"]').click();
  await page.locator('#load-own-preset').click();
  await page.locator('[data-iv-stat="physicalDefense"]').click();
  await page.locator('#target-filter').selectOption('all');
  await chooseTarget(page, '噼啪鸟');
  await page.getByRole('group', { name: '野怪等级', exact: true }).getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('combobox', { name: '敌方技能 1', exact: true }).fill('天旋地转');
  await page.getByRole('option').getByText('天旋地转', { exact: true }).click();
  const hit = () => page.evaluate(() => window.pveNatureUi.getPreview().incomingList[0].predictions.find(row => row.natureName === '勇敢').damage);
  expect(await hit()).toBe(19);
  const prefix = '#preview-incoming-condition-0';
  await page.locator(`${prefix}-gear`).click();
  await page.locator(`${prefix}-firstAction`).check();
  expect(await hit()).toBe(29);
  await page.locator(`${prefix}-displayedPower`).fill('45');
  await page.locator(`${prefix}-displayedPower`).press('Tab');
  expect(await hit()).toBe(29);
  await expect(page.locator(`${prefix}-firstAction`)).toBeDisabled();
  await page.locator(`${prefix}-resetPower`).click();
  await expect(page.locator(`${prefix}-firstAction`)).toBeChecked();
  expect(await hit()).toBe(29);
  await page.reload();
  await page.locator(`${prefix}-gear`).click();
  await expect(page.locator(`${prefix}-firstAction`)).toBeChecked();
  expect(await hit()).toBe(29);
  await page.locator(`${prefix}-firstAction`).uncheck();
  expect(await hit()).toBe(19);
});


test("S5 nature separates HP evidence and exact per-hit observations without dropping conflicts", async ({ page }) => {
  await page.goto(toolPath);
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
  await page.waitForFunction(() => Boolean(window.pveNatureUi));
  const verdict = page.locator('#preview-verdict');
  await expect(verdict.locator('.hp-comparison')).toContainText('421–426');
  await expect(page.locator('#preview-comparison')).toContainText('敌方 1/2 招吻合');
  await expect(verdict).toContainText('实测比最近值少 140');
  await expect(page.locator('#preview-incoming-cells-0')).toContainText('6 × 4 段');
  await expect(page.locator('#preview-incoming-unit-0')).toHaveValue('total');
  await page.locator('#preview-incoming-unit-0').selectOption('perHit');
  await page.locator('#preview-incoming-damage-0').fill('6');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(2);
  await expect(verdict).toContainText('单段 6 × 4 = 24');
  await page.reload();
  await expect(page.locator('#preview-incoming-unit-0')).toHaveValue('perHit');
  await page.locator('#preview-incoming-damage-0').fill('7');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(0);
  await expect(verdict).toContainText('实测比最近值多 4');
  await page.locator('#preview-incoming-damage-0').fill('-1');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  await expect(verdict.locator('.verdict-big')).toHaveText('输入有误');
  await expect(page.locator('#preview-incoming-cells-0 .hit')).toHaveCount(0);
  await page.locator('#preview-incoming-damage-0').fill('6');
  await page.locator('#preview-incoming-damage-0').press('Tab');
  // Independent HP evidence remains usable without discarding a damage conflict.
  await page.locator('#preview-remaining-0').fill('43');
  await page.locator('#preview-remaining-0').press('Tab');
  await expect(verdict.locator('[data-stat="hp"] b')).toHaveText('加');
  await expect(verdict.locator('.verdict-big')).toHaveText('模型未吻合');
});
