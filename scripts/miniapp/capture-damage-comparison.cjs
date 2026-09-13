// 本地原生验收：不上传，不修改收藏；只操作模拟器当前对局。
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const Connection = require("miniprogram-automator/out/Connection").default;
const MiniProgram = require("miniprogram-automator/out/MiniProgram").default;
const output = path.resolve(__dirname, "../../output/ux-incoming-damage/native-minimal-20260913");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timer = setTimeout(() => { process.stderr.write("原生验收超时\n"); process.exit(1); }, 55000);
(async () => {
  await mkdir(output, { recursive: true });
  const connection = await Connection.create(process.argv[2] ?? "ws://127.0.0.1:9420");
  const mini = new MiniProgram(connection);
  const errors = [];
  mini.on("exception", (error) => errors.push(error));
  try {
    await mini.reLaunch("/pages/index/index");
    await wait(1500);
    let page = await mini.currentPage();
    let root = await page.$("comp") ?? page;
    const clickText = async (selector, text) => {
      for (const element of await root.$$(selector)) {
        if ((await element.text()).includes(text)) { await element.tap(); return; }
      }
      throw new Error(`未找到 ${text}`);
    };
    const openComparisonSetting = async () => {
      await mini.pageScrollTo(0);
      await wait(250);
      await (await root.$(".app-header__action")).tap();
      await wait(250);
      await (await root.$(".settings-sheet__body")).scrollTo(0, 350);
      await wait(250);
      for (const row of await root.$$(".settings-sheet__row")) {
        if ((await row.text()).includes("承伤对比")) return row.$(".settings-sheet__switch");
      }
      throw new Error("未找到承伤对比设置");
    };
    let toggle = await openComparisonSetting();
    const originallyEnabled = (await toggle.attribute("class")).includes("--on");
    if (originallyEnabled) { await toggle.tap(); await wait(250); }
    await mini.screenshot({ path: path.join(output, "04-settings-off.png") });
    await (await root.$(".settings-sheet__close")).tap();
    await wait(250);
    assert.equal(await root.$(".dc-entry"), null);
    toggle = await openComparisonSetting();
    await toggle.tap();
    await wait(250);
    await (await root.$(".settings-sheet__close")).tap();
    await mini.reLaunch("/pages/index/index");
    await wait(1500);
    page = await mini.currentPage();
    root = await page.$("comp") ?? page;
    toggle = await openComparisonSetting();
    assert.ok((await toggle.attribute("class")).includes("--on"));
    await mini.screenshot({ path: path.join(output, "05-settings-persisted.png") });
    await (await root.$(".settings-sheet__close")).tap();
    await wait(250);
    for (const [side, name] of [["attacker", "燃薪虫"], ["defender", "圣草迪莫"]]) {
      await (await root.$(`.combatant-card--${side} .combatant-card__summary`)).tap();
      await wait(150);
      await (await root.$(`.combatant-card--${side} .spirit-picker__input`)).input(name);
      await wait(350);
      await clickText(`.combatant-card--${side} .spirit-picker__result`, name);
      await wait(300);
    }
    await mini.screenshot({ path: path.join(output, "01-entry.png") });
    await mini.pageScrollTo(10000);
    await wait(300);
    await clickText(".dc-entry", "承伤对比");
    await wait(3000);
    await mini.screenshot({ path: path.join(output, "02-open.png") });
    assert.ok(await root.$(".dc-sheet"));
    assert.ok((await root.$$(".dc-row")).length > 0);
    await clickText(".dc-search button", "筛选");
    await wait(300);
    const templatePicker = (await root.$$(".dc-options picker"))[0];
    const templateOptions = await templatePicker.property("range");
    assert.match(String(templateOptions), /生命性格.*中性性格.*物防性格.*魔防性格.*当前防守方配点/u);
    await templatePicker.trigger("change", { value: 4 });
    await (await root.$(".dc-inherit")).tap();
    await clickText(".dc-filters button", "未击倒");
    await wait(1800);
    await (await root.$(".dc-search input")).input("皇家狮鹫");
    await wait(250);
    await mini.screenshot({ path: path.join(output, "06-minimal-filters.png") });
    await clickText(".dc-heading button", "关闭");
    await clickText(".dc-entry", "承伤对比");
    await wait(1800);
    assert.equal(await (await root.$(".dc-search input")).value(), "皇家狮鹫");
    assert.match(await (await root.$(".dc-options")).text(), /当前防守方配点/u);
    assert.match(await (await root.$(".dc-inherit .settings-sheet__switch")).attribute("class"), /--on/u);
    assert.match(await (await root.$(".dc-filters .is-selected")).text(), /未击倒/u);
    await (await root.$(".dc-row")).tap();
    await mini.screenshot({ path: path.join(output, "02-ranking.png") });
    await (await root.$(".dc-search input")).input("皇家狮鹫");
    await wait(250);
    await mini.screenshot({ path: path.join(output, "03-long-name.png") });
    const rows = await root.$$(".dc-row");
    assert.ok(rows.length > 0);
    if (!await root.$(".dc-primary")) await rows[0].tap();
    await wait(300);
    await clickText(".dc-primary", "代入防守方复算");
    await wait(350);
    assert.equal(await root.$(".dc-sheet"), null);
    await clickText(".dc-notice button", "撤回代入");
    await wait(350);
    assert.match(await (await root.$(".combatant-card--defender")).text(), /圣草迪莫/u);
    assert.match(await (await root.$(".combatant-card--attacker")).text(), /燃薪虫/u);
    toggle = await openComparisonSetting();
    await toggle.tap();
    await wait(250);
    await (await root.$(".settings-sheet__close")).tap();
    await wait(250);
    assert.equal(await root.$(".dc-entry"), null);
    if (originallyEnabled) {
      toggle = await openComparisonSetting();
      await toggle.tap();
      await wait(250);
      await (await root.$(".settings-sheet__close")).tap();
    }
    assert.deepEqual(errors, []);
    const evidence = { passed: true, settingsToggleAndPersistence: true, fiveTemplates: true, rememberSelections: true, inheritToggle: true, importAndUndo: true, systemInfo: await mini.systemInfo(), errors };
    await writeFile(path.join(output, "report.json"), JSON.stringify(evidence, null, 2), "utf8");
    process.stdout.write("原生承伤对比：设置开关、持久化、入口、搜索、展开、代入和撤回通过\n");
  } finally { mini.disconnect(); clearTimeout(timer); }
})().catch((error) => { clearTimeout(timer); process.stderr.write(`${error.stack}\n`); process.exit(1); });
