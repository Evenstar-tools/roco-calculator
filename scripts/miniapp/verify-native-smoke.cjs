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
    await refresh();
    checks.push("cold-start: bundled S4 workspace rendered");
    await screenshot("01-cold-start.png");

    await tap(".app-header__action");
    const settings = String(await (await find(".settings-sheet")).text());
    assert.ok(settings.includes(`v${version}`), "settings version does not match new package");
    report.settings = settings;
    const switches = await root.$$(".settings-sheet__switch");
    report.memoryEnabled = String(await switches[0].attribute("class")).includes("--on");
    checks.push("settings: new runtime version displayed");
    await screenshot("02-settings-version.png");
    await tap(".settings-sheet__close");

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
    await screenshot("04-share-preview.png");
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
    report.systemInfo = await miniProgram.systemInfo();
    assert.deepEqual(errors, [], "native runtime exceptions detected");
    report.passed = true;
  } catch (error) {
    report.failure = error.stack;
    await screenshot("failure.png").catch(() => {});
    throw error;
  } finally {
    await writeFile(path.join(outputDir, "native-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    miniProgram.disconnect();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
