const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const Connection = require("miniprogram-automator/out/Connection").default;
const MiniProgram = require("miniprogram-automator/out/MiniProgram").default;

const outputDir = path.resolve(
  process.argv[2] ?? "artifacts/wechat-review-package-v0.1.2",
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
    assert.ok(await selectOne(".battle-workspace"), "workspace did not load");
    process.stdout.write("native: workspace ready\n");
    await screenshot(miniProgram, "01-home-calculator.png");

    const attackerCard = await selectOne(
      ".combatant-card--attacker .combatant-card__summary",
    );
    assert.ok(attackerCard, "attacker card is missing");
    await attackerCard.tap();
    await wait(180);
    const spiritInput = await selectOne(
      ".combatant-card--attacker .spirit-picker__input",
    );
    assert.ok(spiritInput, "spirit search is missing");
    await spiritInput.input("迪莫");
    await wait(450);
    const spiritRows = await selectMany(
      ".combatant-card--attacker .spirit-picker__result",
    );
    assert.ok(spiritRows.length >= 5, "spirit results are incomplete");
    await screenshot(miniProgram, "02-spirit-search.png");
    await spiritRows[0].tap();
    await wait(300);

    const modeButtons = await selectMany(".mode-switch__button");
    assert.equal(modeButtons.length, 2, "mode switch is incomplete");
    await modeButtons[1].tap();
    await wait(300);
    const skillTrigger = await selectOne(".skill-picker__trigger");
    assert.ok(skillTrigger, "skill trigger is missing");
    await skillTrigger.tap();
    await wait(250);
    const skillSearch = await selectOne(".skill-picker__search");
    assert.ok(skillSearch, "skill search is missing");
    await skillSearch.input("愿力冲击");
    await wait(500);
    const skillRows = await selectMany(".skill-picker__option");
    assert.equal(skillRows.length, 18, "Wish Power should expose 18 types");
    await screenshot(miniProgram, "03-skill-selection.png");
    await skillRows[0].tap();
    await wait(500);

    const resultAction = await selectOne(".result-bar__action");
    assert.ok(resultAction, "result action is missing");
    await resultAction.tap();
    await wait(700);
    assert.ok(await selectOne(".result-sheet"), "result sheet did not open");
    await screenshot(miniProgram, "04-damage-results.png");

    const resultClose = await selectOne(".result-sheet__close");
    assert.ok(resultClose, "result close action is missing");
    await resultClose.tap();
    await wait(250);

    const settingsAction = await selectOne(".app-header__action");
    assert.ok(settingsAction, "settings action is missing");
    await settingsAction.tap();
    await wait(250);
    const settingsSwitches = await selectMany(".settings-sheet__switch");
    assert.ok(settingsSwitches.length >= 3, "team analysis setting is missing");
    const teamSwitchClass = await settingsSwitches[1].attribute("class");
    if (!String(teamSwitchClass).includes("settings-sheet__switch--on")) {
      await settingsSwitches[1].tap();
      await wait(180);
    }
    const settingsClose = await selectOne(".settings-sheet__close");
    assert.ok(settingsClose, "settings close action is missing");
    await settingsClose.tap();
    await wait(250);

    await page.scrollTop(10000);
    await wait(300);
    const teamEntry = await selectOne(".team-analysis-entry");
    assert.ok(teamEntry, "team analysis entry is missing after enabling it");
    await teamEntry.tap();
    await wait(350);
    assert.ok(await selectOne(".team-analysis"), "team analysis sheet did not open");
    const teamSlots = await selectMany(".team-analysis__slot");
    assert.equal(teamSlots.length, 6, "team analysis should expose six slots");
    await screenshot(miniProgram, "05-team-analysis-empty.png");

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
    await screenshot(miniProgram, "06-team-analysis-configured.png");

    const evidence = {
      passed: runtimeErrors.length === 0,
      runtimeErrors,
      spiritResultCount: spiritRows.length,
      systemInfo: await miniProgram.systemInfo(),
      toolInfo,
      teamAnalysisSlotCount: teamSlots.length,
      teamSearchResultCount: teamSearchRows.length,
      wishPowerResultCount: skillRows.length,
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
