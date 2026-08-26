const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const Connection = require("miniprogram-automator/out/Connection").default;
const MiniProgram = require("miniprogram-automator/out/MiniProgram").default;

const outputDir = path.resolve(
  process.argv[2] ?? "artifacts/wechat-review-package-v1.1.4",
);
const wsEndpoint = process.argv[3]
  ?? process.env.WECHAT_DEVTOOLS_WS_ENDPOINT
  ?? "ws://127.0.0.1:9421";
const runtimeOnly = process.argv.includes("--runtime-only");

function deadline(promise, label, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeout,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry(action, attempts = 3, delay = 1200) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(delay);
    }
  }
  throw lastError;
}

async function screenshot(miniProgram, name) {
  await deadline(
    miniProgram.screenshot({ path: path.join(outputDir, name) }),
    `screenshot ${name}`,
    30000,
  );
}

async function connectNative(wsEndpoint) {
  // Newer DevTools return Tool.getInfo.version instead of SDKVersion.
  // miniprogram-automator 0.12.1 still reads only SDKVersion, so connect
  // directly and accept either field after the transport is established.
  const connection = await Connection.create(wsEndpoint);
  const miniProgram = new MiniProgram(connection);
  const toolInfo = await miniProgram.send("Tool.getInfo");
  if (!(toolInfo?.SDKVersion || toolInfo?.version)) {
    miniProgram.disconnect();
    throw new Error("DevTools automation version is unavailable");
  }
  return { miniProgram, toolInfo };
}

(async () => {
  await mkdir(outputDir, { recursive: true });
  process.stdout.write(`native: connecting ${wsEndpoint}\n`);
  const runtimeErrors = [];
  const connectionResult = await deadline(
    connectNative(wsEndpoint),
    "connect",
  );
  const { miniProgram, toolInfo } = connectionResult;
  miniProgram.on("exception", (entry) => runtimeErrors.push(entry));
  process.stdout.write("native: connected\n");

  try {
    if (!runtimeOnly) {
      await deadline(
        retry(
          () => miniProgram.reLaunch("/pages/index/index"),
          4,
          1500,
        ),
        "relaunch calculator",
        30000,
      );
      await wait(500);
    }
    const page = await deadline(miniProgram.currentPage(), "current page", 30000);
    process.stdout.write("native: page ready\n");
    await wait(1800);
    if (runtimeOnly) {
      await screenshot(miniProgram, "native-runtime.png");
      const evidence = {
        passed: runtimeErrors.length === 0,
        runtimeErrors,
        systemInfo: await miniProgram.systemInfo(),
        toolInfo,
      };
      await writeFile(
        path.join(outputDir, "native-capture-report.json"),
        `${JSON.stringify(evidence, null, 2)}\n`,
        "utf8",
      );
      assert.deepEqual(runtimeErrors, [], "native runtime exceptions were reported");
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
      return;
    }
    const root = await deadline(page.$("comp"), "root component", 30000)
      ?? page;
    const selectOne = (selector) => deadline(
      root.$(selector),
      `select ${selector}`,
      30000,
    );
    const selectMany = (selector) => deadline(
      root.$$(selector),
      `select all ${selector}`,
      30000,
    );
    const findByText = async (selector, text, exact = false) => {
      const elements = await selectMany(selector);
      for (const element of elements) {
        const content = String(await element.text()).trim();
        if (exact ? content === text : content.includes(text)) return element;
      }
      return null;
    };
    const selectAttackerSpirit = async (name) => {
      const card = await selectOne(
        ".combatant-card--attacker .combatant-card__summary",
      );
      assert.ok(card, "attacker card is missing");
      await card.tap();
      await wait(180);
      const input = await selectOne(
        ".combatant-card--attacker .spirit-picker__input",
      );
      assert.ok(input, "spirit search is missing");
      await input.input(name);
      await wait(450);
      const row = await findByText(
        ".combatant-card--attacker .spirit-picker__result",
        name,
      );
      assert.ok(row, `spirit ${name} is missing`);
      await row.tap();
      await wait(350);
    };
    const selectSkill = async (name) => {
      const trigger = await selectOne(".skill-picker__trigger");
      assert.ok(trigger, "skill trigger is missing");
      await trigger.tap();
      await wait(220);
      const input = await selectOne(".skill-picker__search");
      assert.ok(input, "skill search is missing");
      await input.input(name);
      await wait(450);
      const row = await findByText(".skill-picker__option", name);
      assert.ok(row, `skill ${name} is missing`);
      await row.tap();
      await wait(450);
    };
    const openResult = async () => {
      const action = await selectOne(".result-bar__action");
      assert.ok(action, "result action is missing");
      await action.tap();
      await wait(600);
      assert.ok(await selectOne(".result-sheet"), "result sheet did not open");
    };
    const closeResult = async () => {
      const close = await selectOne(".result-sheet__close");
      assert.ok(close, "result close action is missing");
      await close.tap();
      await wait(260);
    };
    assert.ok(await selectOne(".battle-workspace"), "workspace did not load");
    process.stdout.write("native: workspace ready\n");
    await screenshot(miniProgram, "01-home-calculator.png");

    process.stdout.write("native: popular config and opt-in settings\n");
    const settingsAction = await selectOne(".app-header__action");
    assert.ok(settingsAction, "settings action is missing");
    await settingsAction.tap();
    await wait(250);
    const settingsSwitches = await selectMany(".settings-sheet__switch");
    assert.ok(settingsSwitches.length >= 5, "release settings are incomplete");
    for (const index of [1, 3, 4]) {
      const switchClass = await settingsSwitches[index].attribute("class");
      if (!String(switchClass).includes("settings-sheet__switch--on")) {
        await settingsSwitches[index].tap();
        await wait(180);
      }
    }
    const importAction = await selectOne(".settings-sheet__action-row");
    assert.ok(importAction, "popular config import is missing");
    await importAction.tap();
    await wait(350);
    assert.match(await importAction.text(), /已导入\s*193\s*只/u);
    await screenshot(miniProgram, "02-popular-config-settings.png");
    const settingsClose = await selectOne(".settings-sheet__close");
    assert.ok(settingsClose, "settings close action is missing");
    await settingsClose.tap();
    await wait(250);
    await selectAttackerSpirit("古卷执政官");
    const modeButtons = await selectMany(".mode-switch__button");
    assert.equal(modeButtons.length, 2, "mode switch is incomplete");
    await modeButtons[1].tap();
    await wait(1600);
    const fourSkillRows = await selectMany(
      ".skill-panel--active .skill-slots--matrix .skill-result-row",
    );
    assert.equal(
      fourSkillRows.length,
      4,
      "phone four-skill matrix should expose four result cards",
    );
    const fourSkillResults = await selectMany(
      ".skill-panel--active .skill-slots--matrix .skill-result-row__result",
    );
    const fourSkillDamages = await selectMany(
      ".skill-panel--active .skill-slots--matrix .skill-result-row__damage",
    );
    const fourSkillPercents = await selectMany(
      ".skill-panel--active .skill-slots--matrix .skill-result-row__percent",
    );
    assert.equal(fourSkillResults.length, 4, "four-skill result columns are incomplete");
    assert.equal(fourSkillDamages.length, 4, "four-skill damage labels are incomplete");
    assert.equal(fourSkillPercents.length, 4, "four-skill percent labels are incomplete");
    for (let index = 0; index < fourSkillResults.length; index += 1) {
      const [
        resultOffset,
        resultSize,
        damageOffset,
        damageSize,
        percentOffset,
        percentSize,
      ] = await Promise.all([
        fourSkillResults[index].offset(),
        fourSkillResults[index].size(),
        fourSkillDamages[index].offset(),
        fourSkillDamages[index].size(),
        fourSkillPercents[index].offset(),
        fourSkillPercents[index].size(),
      ]);
      const resultRight = Number(resultOffset.left) + Number(resultSize.width);
      for (const [label, offset, size] of [
        ["damage", damageOffset, damageSize],
        ["percent", percentOffset, percentSize],
      ]) {
        assert.ok(
          Number(offset.left) >= Number(resultOffset.left) - 0.5 &&
            Number(offset.left) + Number(size.width) <= resultRight + 0.5,
          `four-skill ${label} label ${index + 1} overflows its result column: ` +
            `${JSON.stringify({ offset, resultOffset, resultSize, size })}`,
        );
      }
    }
    await screenshot(miniProgram, "02a-four-skill-matrix.png");
    await modeButtons[0].tap();
    await wait(220);

    process.stdout.write("native: negative status settlement\n");
    await selectAttackerSpirit("迪莫");
    await selectSkill("猛烈撞击");
    const conditionsAction = await selectOne(".conditions-ribbon__main");
    assert.ok(conditionsAction, "battle conditions entry is missing");
    await conditionsAction.tap();
    await wait(300);
    const statusTabs = await selectMany(".negative-status-editor__tab");
    assert.equal(statusTabs.length, 2, "negative status side tabs are incomplete");
    const activeStatusTab = await selectOne(".negative-status-editor__tab--active");
    assert.match(await activeStatusTab.text(), /防守方/u, "defender status tab should open first");
    let statusSteps = await selectMany(".negative-status-editor__step");
    assert.equal(statusSteps.length, 10, "active negative status steppers are incomplete");
    for (const index of [1, 3, 5, 7, 9, 9]) {
      statusSteps = await selectMany(".negative-status-editor__step");
      await statusSteps[index].tap();
      await wait(100);
    }
    await screenshot(miniProgram, "03-negative-status-conditions.png");
    const conditionsClose = await selectOne(".conditions-sheet__close");
    assert.ok(conditionsClose, "battle conditions close action is missing");
    await conditionsClose.tap();
    await wait(250);
    await openResult();
    assert.ok(await selectOne(".result-sheet__status-settlement"), "negative status settlement is missing");
    assert.ok(await selectOne(".result-sheet__turn-preview"), "negative status turn preview is missing");
    const statusRows = await selectMany(".result-sheet__status-row");
    assert.ok(statusRows.length >= 5, "negative status rows are incomplete");
    await screenshot(miniProgram, "04-negative-status-result.png");
    await closeResult();

    process.stdout.write("native: baron settlement\n");
    await selectAttackerSpirit("恶魔男爵");
    await selectSkill("撕咬");
    await openResult();
    assert.ok(await selectOne(".result-sheet__baron-settlement"), "Baron settlement is missing");
    const baronLines = await selectMany(".result-sheet__baron-line");
    assert.ok(baronLines.length >= 2, "Baron settlement should contain two lines");
    const baronResultScroll = await selectOne(".result-sheet__scroll");
    assert.ok(baronResultScroll, "result scroll view is missing");
    await baronResultScroll.scrollTo(0, 620);
    await wait(220);
    await screenshot(miniProgram, "05-baron-settlement.png");
    await closeResult();

    process.stdout.write("native: bet settles after lifesteal\n");
    await selectSkill("下注");
    await openResult();
    const betSettlement = await selectOne(".result-sheet__baron-settlement");
    assert.ok(betSettlement, "Baron bet settlement is missing");
    assert.match(
      await betSettlement.text(),
      /吸血后自损/u,
      "bet should settle self damage after lifesteal",
    );
    await screenshot(miniProgram, "05b-baron-bet-settlement.png");
    await closeResult();

    process.stdout.write("native: quick undo\n");
    await page.scrollTop(0);
    await wait(250);
    let natureOptions = await selectMany(
      ".side-configuration--attacker .quick-controls__row--nature .quick-controls__option",
    );
    assert.equal(natureOptions.length, 6, "nature quick controls are incomplete");
    const natureClassesBefore = await Promise.all(
      natureOptions.map((option) => option.attribute("class")),
    );
    const natureSummaryBefore = await (
      await selectOne(".side-configuration--attacker .quick-controls__summary")
    ).text();
    const natureTargetIndex = natureClassesBefore.findIndex(
      (value) => !String(value).includes("quick-controls__option--selected"),
    );
    assert.ok(natureTargetIndex >= 0, "no unselected nature target is available");
    await natureOptions[natureTargetIndex].tap();
    await wait(180);
    natureOptions = await selectMany(
      ".side-configuration--attacker .quick-controls__row--nature .quick-controls__option",
    );
    const natureSummaryChanged = await (
      await selectOne(".side-configuration--attacker .quick-controls__summary")
    ).text();
    assert.notEqual(natureSummaryChanged, natureSummaryBefore, "nature selection did not change");
    const quickUndo = await selectOne(".quick-undo");
    assert.ok(quickUndo, "quick undo is missing");
    await quickUndo.tap();
    await wait(220);
    natureOptions = await selectMany(
      ".side-configuration--attacker .quick-controls__row--nature .quick-controls__option",
    );
    const natureSummaryRestored = await (
      await selectOne(".side-configuration--attacker .quick-controls__summary")
    ).text();
    assert.equal(natureSummaryRestored, natureSummaryBefore, "quick undo did not restore the nature selection");
    await screenshot(miniProgram, "06-quick-undo.png");

    process.stdout.write("native: thunderstorm burst groups\n");
    await selectAttackerSpirit("酷拉");
    await selectSkill("雷暴");
    const burstSummary = await selectOne(".condition-editor__burst-summary");
    assert.ok(burstSummary, "thunderstorm burst summary is missing");
    await burstSummary.tap();
    await wait(250);
    const burstTabs = await selectMany(".condition-editor__burst-tab");
    assert.equal(burstTabs.length, 3, "burst category tabs are incomplete");
    assert.equal((await selectMany(".condition-editor__burst-source")).length, 4, "trait burst sources are incomplete");
    const currentSource = await findByText(".condition-editor__burst-source", "电流刺激");
    assert.ok(currentSource, "burst source 电流刺激 is missing");
    await currentSource.tap();
    await wait(150);
    await burstTabs[1].tap();
    await wait(150);
    assert.equal((await selectMany(".condition-editor__burst-source")).length, 5, "skill burst sources are incomplete");
    const arcSource = await findByText(".condition-editor__burst-source", "电弧");
    assert.ok(arcSource, "burst source 电弧 is missing");
    await arcSource.tap();
    await wait(180);
    assert.equal((await selectMany(".condition-editor__burst-source--active")).length, 1, "active burst source is missing from the current category");
    assert.match(await burstSummary.text(), /2\/10/u, "burst source selections did not persist across categories");
    const burstOffset = await burstSummary.offset();
    await miniProgram.pageScrollTo(Math.max(0, Number(burstOffset?.top) - 210));
    await wait(220);
    await screenshot(miniProgram, "07-thunderstorm-burst-groups.png");
    await (await selectOne(".condition-editor__burst-summary")).tap();

    await page.scrollTop(10000);
    await wait(300);
    const teamEntry = await selectOne(".team-analysis-entry");
    assert.ok(teamEntry, "team analysis entry is missing after enabling it");
    await teamEntry.tap();
    await wait(350);
    assert.ok(await selectOne(".team-analysis"), "team analysis sheet did not open");
    const teamSlots = await selectMany(".team-analysis__slot");
    assert.equal(teamSlots.length, 6, "team analysis should expose six slots");
    await screenshot(miniProgram, "08-team-analysis-empty.png");

    await teamSlots[0].tap();
    await wait(180);
    const teamSearch = await selectOne(".team-analysis__search");
    assert.ok(teamSearch, "team member search is missing");
    await teamSearch.input("迪莫");
    await wait(400);
    const teamSearchRows = await selectMany(".team-analysis__search-result");
    assert.ok(teamSearchRows.length >= 5, "team member search results are incomplete");
    await teamSearchRows[0].tap();
    await wait(300);
    await screenshot(miniProgram, "09-team-analysis-configured.png");

    const evidence = {
      baronSettlementLineCount: baronLines.length,
      burstGroupCount: 3,
      burstSourceCount: 10,
      mobileFourSkillOverflowCount: 0,
      mobileFourSkillRowCount: fourSkillRows.length,
      negativeStatusRowCount: statusRows.length,
      passed: runtimeErrors.length === 0,
      runtimeErrors,
      systemInfo: await miniProgram.systemInfo(),
      toolInfo,
      teamAnalysisSlotCount: teamSlots.length,
      teamSearchResultCount: teamSearchRows.length,
    };
    await writeFile(
      path.join(outputDir, "native-capture-report.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    assert.deepEqual(runtimeErrors, [], "native runtime exceptions were reported");
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    miniProgram.disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
