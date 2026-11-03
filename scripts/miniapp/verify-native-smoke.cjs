const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const Connection = require("miniprogram-automator/out/Connection").default;
const MiniProgram = require("miniprogram-automator/out/MiniProgram").default;

const version = require("../../miniapp/package.json").version;
const outputDir = path.resolve(process.argv[2] ?? `artifacts/wechat-native-v${version}`);
const endpoint = process.argv[3] ?? "ws://127.0.0.1:9420";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deadline(promise, label, ms = 30000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const connection = await deadline(Connection.create(endpoint), "connect");
  const miniProgram = new MiniProgram(connection);
  const errors = [];
  const checks = [];
  let page;
  let root;
  const comparisonKey = "rock-calculator.miniapp.damage-comparison-enabled.v1";
  let previousComparisonChoice;
  let comparisonChoiceCaptured = false;
  let storageBackup;
  miniProgram.on("exception", (error) => errors.push(error));
  const report = { version, passed: false, checks, errors };
  async function refresh() {
    await deadline(miniProgram.reLaunch("/pages/index/index"), "cold launch");
    await wait(1800);
    page = await miniProgram.currentPage();
    root = await page.$("comp") ?? page;
    await find(".battle-workspace");
  }
  async function find(selector) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const element = await deadline(root.$(selector), `select ${selector}`);
      if (element) return element;
      await wait(250);
    }
    throw new Error(`Missing native element: ${selector}`);
  }
  async function tap(selector) {
    await (await find(selector)).tap();
    await wait(350);
  }
  async function screenshot(name) {
    await deadline(miniProgram.screenshot({ path: path.join(outputDir, name) }), name);
  }
  async function matchText(selector, text) {
    for (const element of await root.$$(selector)) {
      if (String(await element.text()).includes(text)) return element;
    }
    throw new Error(`Missing ${text} in ${selector}`);
  }
  async function checkResultBounds() {
    for (const row of await root.$$(".skill-panel--active .skill-result-row")) {
      const column = await row.$(".skill-result-row__result");
      const offset = await column.offset();
      const size = await column.size();
      for (const selector of [".skill-result-row__damage", ".skill-result-row__percent"]) {
        const label = await row.$(selector);
        const labelOffset = await label.offset();
        const labelSize = await label.size();
        assert.ok(labelOffset.left >= offset.left - 1 &&
          labelOffset.left + labelSize.width <= offset.left + size.width + 1,
        `${selector} overflows its result column`);
        assert.ok(labelOffset.top >= offset.top - 1 &&
          labelOffset.top + labelSize.height <= offset.top + size.height + 1,
        `${selector} vertically overflows its result column`);
      }
    }
  }
  async function checkShareButtons() {
    const viewport = await miniProgram.systemInfo();
    for (const selector of [".share-preview__primary", ".share-preview__secondary"]) {
      const button = await find(selector);
      const offset = await button.offset();
      const size = await button.size();
      assert.ok(Number(offset.top) >= 0 && Number(offset.top) + Number(size.height) <= viewport.windowHeight,
        `${selector} is clipped below the native viewport`);
    }
  }
  async function spirit(side, name) {
    const scope = `.combatant-card--${side}`;
    await tap(`${scope} .combatant-card__summary`);
    await (await find(`${scope} .spirit-picker__input`)).input(name);
    await wait(500);
    let selected;
    for (const row of await root.$$(`${scope} .spirit-picker__result`)) {
      const label = await row.$(".spirit-picker__result-name");
      if (label && String(await label.text()).trim() === name) {
        selected = row;
        break;
      }
    }
    assert.ok(selected, `exact spirit ${name} is missing`);
    await selected.tap();
    await wait(600);
    assert.equal(String(await (await find(`${scope} .combatant-card__name`)).text()).trim(), name);
  }
  try {
    report.toolInfo = await miniProgram.send("Tool.getInfo");
    const storageInfo = await miniProgram.callWxMethod("getStorageInfoSync");
    storageBackup = new Map();
    for (const key of storageInfo.keys) {
      storageBackup.set(key, await miniProgram.callWxMethod("getStorageSync", key));
    }
    previousComparisonChoice = await miniProgram.callWxMethod("getStorageSync", comparisonKey);
    comparisonChoiceCaptured = true;
    await miniProgram.callWxMethod("removeStorageSync", comparisonKey);
    await refresh();
    assert.equal(await root.$(".dc-entry"), null, "fresh settings must hide damage comparison");
    checks.push("comparison-default: no saved preference means entry hidden");
    checks.push("cold-start: bundled workspace rendered");
    await screenshot("01-cold-start.png");

    await tap(".app-header__action");
    const settings = String(await (await find(".settings-sheet")).text());
    assert.ok(settings.includes(`v${version}`), "settings version does not match new package");
    report.settings = settings;
    const switches = await root.$$(".settings-sheet__switch");
    report.memoryEnabled = String(await switches[0].attribute("class")).includes("--on");
    checks.push("settings: new runtime version displayed");
    const comparisonRow = await matchText(".settings-sheet__row", "承伤对比");
    const comparisonToggle = await comparisonRow.$(".settings-sheet__switch");
    assert.ok(comparisonToggle, "comparison settings switch is missing");
    assert.ok(!String(await comparisonToggle.attribute("class")).includes("--on"), "comparison must default to off");
    await screenshot("02-settings-version.png");
    await comparisonToggle.tap();
    await wait(350);
    await tap(".settings-sheet__close");
    await find(".dc-entry");
    await refresh();
    await find(".dc-entry");
    checks.push("comparison-opt-in: manually enabled choice persists after restart");
    await tap(".app-header__action");
    const enabledRow = await matchText(".settings-sheet__row", "承伤对比");
    await (await enabledRow.$(".settings-sheet__switch")).tap();
    await wait(350);
    await tap(".settings-sheet__close");
    assert.equal(await root.$(".dc-entry"), null, "disabled comparison entry must disappear");
    checks.push("comparison-disable: entry disappears when turned off");

    await spirit("defender", "圣光迪莫");
    await spirit("attacker", "迪莫");
    checks.push("spirit-search: both sides selected from bundled data");
    const modeButtons = await root.$$(".mode-switch__button");
    await modeButtons[0].tap();
    await wait(350);
    await tap(".skill-panel--active .skill-picker__trigger");
    await (await find(".skill-picker__search")).input("抓挠");
    await wait(500);
    await (await matchText(".skill-picker__option", "抓挠")).tap();
    await wait(500);
    const damage = String(await (await find(".result-bar__damage")).text()).trim();
    assert.match(damage, /^\d+$/u, "calculation did not return numeric damage");
    assert.ok(Number(damage) > 0, "direct damage must be positive");
    report.damage = damage;
    checks.push("skill-search: direct attack returns positive integer damage");
    await checkResultBounds();
    checks.push("single-skill-layout: damage and percentage remain inside result column");
    await screenshot("03-single-skill.png");

    await tap(".result-bar__action");
    assert.equal(String(await (await find(".result-sheet__damage")).text()).trim(), damage);
    checks.push("result-detail: agrees with homepage damage");
    await screenshot("04-result-detail.png");
    await tap(".result-sheet__share");
    const shareText = String(await (await find(".share-preview__configuration")).text());
    for (const label of ["攻击方配置", "防守方配置", "技能参数", "战斗条件"]) {
      assert.ok(shareText.includes(label), `share preview is missing ${label}`);
    }
    checks.push("share-preview: both configurations, skill parameters and battle conditions present");
    await checkShareButtons();
    await screenshot("04-share-preview.png");
    await (await find(".share-preview__scroll")).scrollTo(0, 10000);
    await wait(250);
    await checkShareButtons();
    await screenshot("04b-share-preview-scrolled.png");
    checks.push("share-preview-layout: both actions stay visible before and after native scroll");
    await tap(".share-preview__secondary");
    await tap(".result-sheet__close");
    const restoredNames = {
      attacker: String(await (await find(".combatant-card--attacker .combatant-card__name")).text()),
      defender: String(await (await find(".combatant-card--defender .combatant-card__name")).text()),
    };
    if (report.memoryEnabled) {
      await refresh();
      for (const side of ["attacker", "defender"]) {
        assert.equal(String(await (await find(`.combatant-card--${side} .combatant-card__name`)).text()), restoredNames[side]);
      }
      assert.equal(String(await (await find(".result-bar__damage")).text()).trim(), damage);
      checks.push("configuration-restore: both sides, selected skill and damage preserved");
    } else {
      checks.push("configuration-restore: skipped because existing memory preference is off");
    }
    const modes = await root.$$(".mode-switch__button");
    await modes[1].tap();
    await wait(600);
    assert.equal((await root.$$(".skill-panel--active .skill-result-row")).length, 4);
    await checkResultBounds();
    checks.push("four-skills: four result cards rendered");
    await screenshot("05-four-skills.png");
    if (process.argv.includes("--s5")) {
      process.stdout.write("native: S5 dice, energy and independent stat controls\n");
      await (await root.$$(".mode-switch__button"))[0].tap();
      await wait(350);
      async function skill(name) {
        await tap(".skill-panel--active .skill-picker__trigger");
        await (await find(".skill-picker__search")).input(name);
        await wait(400);
        await (await matchText(".skill-picker__option", name)).tap();
        await wait(450);
      }
      async function modifiers() {
        await tap(".result-bar__action");
        await (await matchText(".result-actions__category", "增减")).tap();
        await wait(350);
      }
      await spirit("attacker", "滴廿豚");
      await skill("抓挠");
      await modifiers();
      const diceField = await matchText(".result-sheet .condition-editor__field", "骰点");
      const dicePicker = await diceField.$("picker");
      assert.ok(dicePicker, "S5 dice requires the native picker");
      await dicePicker.trigger("change", { value: 1 });
      await wait(450);
      assert.match(await diceField.text(), /双方技能威力\+20/u);
      const diceDamage = String(await (await find(".result-sheet__damage")).text());
      assert.ok(Number(diceDamage) > 0, "supported dice result must be numeric");
      await screenshot("06-s5-dice.png");
      await tap(".result-sheet__share");
      assert.match(await (await find(".share-preview__configuration")).text(), /双方技能威力\+20/u);
      await checkShareButtons();
      await (await find(".share-preview__scroll")).scrollTo(0, 10000);
      await wait(250);
      await screenshot("07-s5-dice-share.png");
      await tap(".share-preview__secondary");
      await tap(".result-sheet__close");
      await refresh();
      assert.equal(String(await (await find(".result-bar__damage")).text()), diceDamage);
      checks.push("S5 dice: native picker applies, share explains and restart restores result");

      await spirit("attacker", "地绡银龙");
      await skill("扬尘");
      await modifiers();
      const energyField = await matchText(".result-sheet .condition-editor__field", "累计消耗能量");
      await (await energyField.$("input")).input("0");
      await wait(350);
      const useAction = await matchText(".result-actions__item", "扬尘");
      await (await useAction.$(".result-actions__apply")).tap();
      await wait(450);
      const energy = Number(await (await energyField.$("input")).value());
      assert.ok(energy > 0, "skill use must accumulate actual energy");
      await (await matchText(".result-sheet .condition-editor__choice", "回合结束")).tap();
      await wait(450);
      const settled = await (await find(".result-actions__list")).text();
      await (await matchText(".result-sheet .condition-editor__choice", "回合结束")).tap();
      await wait(350);
      assert.equal(await (await find(".result-actions__list")).text(), settled);
      const energyPosition = await energyField.offset();
      await (await find(".result-sheet__scroll")).scrollTo(0, Math.max(0, Number(energyPosition.top) - 300));
      await wait(250);
      await screenshot("08-s5-energy-settlement.png");
      checks.push("S5 silver dragon: actual energy accumulates; repeated end-turn does not settle twice");
      await tap(".result-sheet__close");
      await skill("矿物置换");
      await tap(".result-bar__action");
      assert.equal(await root.$(".result-sheet .condition-editor__power-modes"), null);
      assert.match(await (await find(".result-actions__parameters")).text(), /己方魔攻 \+12层/u);
      await screenshot("09-s5-status-skill.png");
      await tap(".result-sheet__close");
      const summary = await find(".active-ability-stage__specific");
      assert.match(await summary.text(), /物攻 0% · 魔攻 \+120%/u);
      const bounds = await summary.size();
      assert.ok(bounds.width <= (await miniProgram.systemInfo()).windowWidth);
      await screenshot("10-s5-independent-magic-attack.png");
      checks.push("S5 mineral conversion: status controls and independent magic-attack +120% summary");
    }
    report.systemInfo = await miniProgram.systemInfo();
    assert.deepEqual(errors, [], "native runtime exceptions detected");
    report.passed = true;
  } catch (error) {
    report.failure = error.stack;
    await screenshot("failure.png").catch(() => {});
    throw error;
  } finally {
    if (storageBackup) {
      const { keys } = await miniProgram.callWxMethod("getStorageInfoSync");
      for (const key of keys) {
        if (!storageBackup.has(key)) await miniProgram.callWxMethod("removeStorageSync", key);
      }
      for (const [key, value] of storageBackup) {
        await miniProgram.callWxMethod("setStorageSync", key, value);
        assert.deepEqual(await miniProgram.callWxMethod("getStorageSync", key), value);
      }
      report.storageRestored = true;
    } else if (comparisonChoiceCaptured) {
      if (previousComparisonChoice === "" || previousComparisonChoice === undefined) {
        await miniProgram.callWxMethod("removeStorageSync", comparisonKey);
      } else {
        await miniProgram.callWxMethod("setStorageSync", comparisonKey, previousComparisonChoice);
      }
    }
    await writeFile(path.join(outputDir, "native-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    miniProgram.disconnect();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
