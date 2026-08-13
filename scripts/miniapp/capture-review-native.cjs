const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const automator = require("miniprogram-automator");

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

async function screenshot(miniProgram, name) {
  await deadline(
    miniProgram.screenshot({ path: path.join(outputDir, name) }),
    `screenshot ${name}`,
    30000,
  );
}

(async () => {
  await mkdir(outputDir, { recursive: true });
  process.stdout.write(`native: connecting ${wsEndpoint}\n`);
  const runtimeErrors = [];
  const miniProgram = await deadline(
    automator.connect({ wsEndpoint }),
    "connect",
  );
  miniProgram.on("exception", (entry) => runtimeErrors.push(entry));
  process.stdout.write("native: connected\n");

  try {
    const page = await deadline(miniProgram.currentPage(), "current page", 30000);
    process.stdout.write("native: page ready\n");
    await wait(1800);
    if (runtimeOnly) {
      await screenshot(miniProgram, "native-runtime.png");
      const evidence = {
        passed: runtimeErrors.length === 0,
        runtimeErrors,
        systemInfo: await miniProgram.systemInfo(),
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
    const root = await deadline(page.$("comp"), "root component", 30000);
    assert.ok(root, "root component did not load");
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

    const evidence = {
      passed: runtimeErrors.length === 0,
      runtimeErrors,
      spiritResultCount: spiritRows.length,
      systemInfo: await miniProgram.systemInfo(),
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
