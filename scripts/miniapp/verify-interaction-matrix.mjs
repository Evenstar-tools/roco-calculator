import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4176/#/pages/index/index";
const artifactDir = resolve(
  process.argv[3] ?? "artifacts/interaction-matrix-20260810",
);

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function openPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  let activeStep = "startup";
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[${activeStep}] ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`[${activeStep}] ${error.message}`));
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.locator(".battle-workspace").waitFor({ state: "visible" });
  return {
    errors,
    page,
    setStep(step) {
      activeStep = step;
    },
  };
}

async function assertViewportSafe(page, label) {
  const geometry = await page.evaluate(() => ({
    documentWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    viewportWidth: window.innerWidth,
    visibleSvgImages: Array.from(document.images)
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .filter((image) => /\.svg(?:$|[?#])/iu.test(image.currentSrc || image.src))
      .map((image) => image.currentSrc || image.src),
  }));
  assert.ok(
    geometry.documentWidth - geometry.viewportWidth <= 0.5,
    `${label}: horizontal overflow ${geometry.documentWidth - geometry.viewportWidth}px`,
  );
  assert.deepEqual(geometry.visibleSvgImages, [], `${label}: visible SVG assets remain`);
}

async function assertSurfaceInsideViewport(page, selector, label) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${label}: surface is missing`);
  const viewport = page.viewportSize();
  assert.ok(box.x >= -0.5, `${label}: left edge overflows`);
  assert.ok(box.x + box.width <= viewport.width + 0.5, `${label}: right edge overflows`);
  assert.ok(box.width > 0 && box.height > 0, `${label}: surface is collapsed`);
  await assertViewportSafe(page, label);
}

async function assertCenteredButtonLabel(page, selector, label) {
  const geometry = await page.locator(selector).evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const textNode = Array.from(button.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    if (!textNode) return null;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();
    return {
      centerDelta: Math.abs(
        (buttonRect.top + buttonRect.height / 2) -
          (textRect.top + textRect.height / 2),
      ),
    };
  });
  assert.ok(geometry, `${label}: label geometry is unavailable`);
  assert.ok(
    geometry.centerDelta <= 1.5,
    `${label}: label is ${geometry.centerDelta}px off vertical center`,
  );
}

async function assertSpiritPickerGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const results = document.querySelector(".spirit-picker__results")
      ?.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll(".spirit-picker__result"));
    return {
      leftDelta: rows.length
        ? Math.max(...rows.map((row) =>
            Math.abs(row.getBoundingClientRect().left - (results?.left ?? 0) - 6)
          ))
        : Number.POSITIVE_INFINITY,
      rightDelta: rows.length
        ? Math.max(...rows.map((row) =>
            Math.abs((results?.right ?? 0) - 6 - row.getBoundingClientRect().right)
          ))
        : Number.POSITIVE_INFINITY,
      rowCount: rows.length,
    };
  });
  assert.ok(geometry.rowCount > 0, `${label}: no result rows found`);
  assert.ok(geometry.leftDelta <= 1, `${label}: result rows do not fill the left edge`);
  assert.ok(geometry.rightDelta <= 1, `${label}: result rows do not fill the right edge`);
}

async function assertQuickSummary(page, label) {
  const geometry = await page.locator(
    ".side-configuration--active .quick-controls__summary",
  ).evaluate((summary) => {
    const rect = summary.getBoundingClientRect();
    const up = summary.querySelector(".quick-controls__summary-arrow--up");
    const down = summary.querySelector(".quick-controls__summary-arrow--down");
    const stat = summary.querySelector(".quick-controls__summary-stat");
    const upRect = up?.getBoundingClientRect();
    const downRect = down?.getBoundingClientRect();
    const statRect = stat?.getBoundingClientRect();
    return {
      downColor: down ? getComputedStyle(down).color : null,
      downFontSize: down ? Number.parseFloat(getComputedStyle(down).fontSize) : 0,
      fitsWidth: summary.scrollWidth <= summary.clientWidth + 0.5,
      height: rect.height,
      statArrowCenterDelta: Math.max(
        Math.abs((statRect?.top ?? 0) + (statRect?.height ?? 0) / 2 -
          ((upRect?.top ?? 0) + (upRect?.height ?? 0) / 2)),
        Math.abs((statRect?.top ?? 0) + (statRect?.height ?? 0) / 2 -
          ((downRect?.top ?? 0) + (downRect?.height ?? 0) / 2)),
      ),
      upColor: up ? getComputedStyle(up).color : null,
      upFontSize: up ? Number.parseFloat(getComputedStyle(up).fontSize) : 0,
      whiteSpace: getComputedStyle(summary).whiteSpace,
    };
  });
  assert.equal(geometry.fitsWidth, true, `${label}: summary overflows its card`);
  assert.equal(geometry.whiteSpace, "nowrap", `${label}: summary wrapped`);
  assert.ok(geometry.height >= 28 && geometry.height <= 30, `${label}: compact summary footer height drifted`);
  assert.ok(geometry.upFontSize >= 14.5 && geometry.downFontSize >= 14.5, `${label}: arrows are undersized`);
  assert.notEqual(geometry.upColor, geometry.downColor, `${label}: arrows lost their state colors`);
  assert.ok(geometry.statArrowCenterDelta <= 2, `${label}: arrows are not aligned to the text baseline`);
}

async function assertSkillPickerGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const categories = document.querySelector(".skill-picker__categories");
    const categoryRows = Array.from(
      document.querySelectorAll(".skill-picker__category"),
    ).map((element) => element.getBoundingClientRect());
    const search = document.querySelector(".skill-picker__search-field")?.getBoundingClientRect();
    const options = document.querySelector(".skill-picker__options")?.getBoundingClientRect();
    const rowElement = document.querySelector(".skill-picker__option");
    const row = rowElement?.getBoundingClientRect();
    const categoryBottoms = categoryRows.map((rect) => rect.bottom);
    const categoryBounds = categories?.getBoundingClientRect();
    return {
      actionColumnCount: document.querySelectorAll(".skill-picker__choice-state").length,
      categoryCount: categoryRows.length,
      categoryHeightDelta: categoryRows.length
        ? Math.max(...categoryRows.map((rect) => Math.abs(rect.height - 44)))
        : Number.POSITIVE_INFINITY,
      categoryBottomDelta: categoryBottoms.length
        ? Math.max(...categoryBottoms) - Math.min(...categoryBottoms)
        : Number.POSITIVE_INFINITY,
      categoryRowFits:
        Boolean(categories) &&
        categories.scrollWidth <= categories.clientWidth + 0.5,
      categoryRightInset: categoryBounds && categoryRows.length
        ? categoryBounds.right - categoryRows.at(-1).right
        : Number.POSITIVE_INFINITY,
      categorySearchGap: categoryBottoms.length && search
        ? search.top - Math.max(...categoryBottoms)
        : Number.NEGATIVE_INFINITY,
      leftDelta: Math.abs((search?.left ?? 0) - (row?.left ?? 0)),
      rightDelta: Math.abs((search?.right ?? 0) - (row?.right ?? 0)),
      rowFitsOptions:
        (row?.left ?? -1) >= (options?.left ?? 0) - 0.5 &&
        (row?.right ?? window.innerWidth + 1) <= (options?.right ?? window.innerWidth) + 0.5,
      rowFitsViewport: (row?.left ?? -1) >= -0.5 && (row?.right ?? window.innerWidth + 1) <= window.innerWidth + 0.5,
      rowHasInternalOverflow: rowElement ? rowElement.scrollWidth > rowElement.clientWidth + 0.5 : true,
    };
  });
  assert.equal(geometry.actionColumnCount, 0, `${label}: redundant action column remains`);
  assert.equal(geometry.categoryCount, 5, `${label}: skill categories are incomplete`);
  assert.ok(geometry.categoryHeightDelta <= 0.5, `${label}: category controls do not share a 44px height`);
  assert.ok(geometry.categoryBottomDelta <= 0.5, `${label}: category controls are not baseline aligned`);
  assert.equal(geometry.categoryRowFits, true, `${label}: category row scrolls or overflows`);
  assert.ok(
    geometry.categoryRightInset >= 13.5 && geometry.categoryRightInset <= 14.5,
    `${label}: category row does not fill the available width (${geometry.categoryRightInset}px right inset)`,
  );
  assert.ok(
    geometry.categorySearchGap >= 9 && geometry.categorySearchGap <= 11,
    `${label}: category row and search field spacing drifted (${geometry.categorySearchGap}px)`,
  );
  assert.ok(geometry.leftDelta <= 1, `${label}: search and rows have different left edges`);
  assert.ok(geometry.rightDelta <= 1, `${label}: search and rows have different right edges`);
  assert.equal(geometry.rowFitsOptions, true, `${label}: a skill row overflows the results area`);
  assert.equal(geometry.rowFitsViewport, true, `${label}: a skill row overflows the viewport`);
  assert.equal(geometry.rowHasInternalOverflow, false, `${label}: a skill row clips its content`);
}

async function readSkillPickerAnchor(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector(".skill-picker__sheet")?.getBoundingClientRect();
    const header = document.querySelector(".skill-picker__sheet-header")?.getBoundingClientRect();
    const categories = document.querySelector(".skill-picker__categories")?.getBoundingClientRect();
    const search = document.querySelector(".skill-picker__search-wrap")?.getBoundingClientRect();
    const option = document.querySelector(".skill-picker__option")?.getBoundingClientRect();
    return {
      bottom: sheet?.bottom ?? -1,
      categoriesTop: categories?.top ?? -1,
      firstOptionTop: option?.top ?? -1,
      headerTop: header?.top ?? -1,
      searchTop: search?.top ?? -1,
      top: sheet?.top ?? -1,
    };
  });
}

function assertStableSkillPickerAnchor(actual, expected, label) {
  for (const key of ["top", "headerTop", "categoriesTop", "searchTop"]) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= 1,
      `${label}: ${key} moved by ${actual[key] - expected[key]}px`,
    );
  }
}

async function fillTaroInput(locator, value) {
  const nested = locator.locator("input, textarea").first();
  if (await nested.count()) {
    await nested.fill(String(value));
    return nested;
  }
  await locator.evaluate((element, nextValue) => {
    element.dispatchEvent(new CustomEvent("input", {
      bubbles: true,
      composed: true,
      detail: { value: nextValue },
    }));
  }, String(value));
  return locator;
}

async function screenshot(page, name) {
  await page.screenshot({
    path: resolve(artifactDir, `${name}.png`),
    fullPage: false,
  });
}

async function waitForVisibleImages(page, selector) {
  await page.locator(`${selector} img`).evaluateAll(async (images) => {
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      await new Promise((resolveImage) => {
        image.addEventListener("load", resolveImage, { once: true });
        image.addEventListener("error", resolveImage, { once: true });
      });
      if (typeof image.decode === "function") {
        await image.decode().catch(() => {});
      }
    }));
  });
}

async function verifyPhone() {
  const { errors, page, setStep } = await openPage({ width: 390, height: 844 });
  setStep("phone main");
  await assertViewportSafe(page, "phone main");
  await screenshot(page, "phone-main");

  const speedNature = page.getByLabel("攻击方速度正面性格");
  setStep("phone quick controls");
  await speedNature.click();
  assert.equal(await speedNature.getAttribute("aria-pressed"), "true");
  await assertQuickSummary(page, "phone quick controls");
  await screenshot(page, "phone-quick-controls-selected");
  await speedNature.click();
  assert.equal(await speedNature.getAttribute("aria-pressed"), "false");

  const hpIv = page.getByLabel("攻击方生命个体加点");
  await hpIv.click();
  assert.equal(await hpIv.getAttribute("aria-pressed"), "false");
  await hpIv.click();
  assert.equal(await hpIv.getAttribute("aria-pressed"), "true");

  await page.locator(".direction-switch__button").click();
  await page.locator(".direction-switch__button").click();

  setStep("phone spirit search");
  await page.getByLabel("攻击方宠物摘要").click();
  const attackerSearch = page.getByLabel("搜索攻击方宠物");
  await fillTaroInput(attackerSearch, "迪莫");
  await page.locator(".spirit-picker__results").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".spirit-picker__results", "phone attacker search");
  await assertSpiritPickerGeometry(page, "phone attacker search");
  await waitForVisibleImages(page, ".spirit-picker__results");
  await screenshot(page, "phone-attacker-search");
  await page.locator(".spirit-picker__result").first().click();
  await page.locator(".spirit-picker__results").waitFor({ state: "hidden" });

  await page.getByLabel("防守方宠物摘要").click();
  const defenderSearch = page.getByLabel("搜索防守方宠物");
  await fillTaroInput(defenderSearch, "迪莫");
  await page.locator(".spirit-picker__results").waitFor({ state: "visible" });
  await page.getByLabel("关闭防守方宠物搜索").click({ position: { x: 2, y: 2 } });
  await page.locator(".spirit-picker__results").waitFor({ state: "hidden" });

  await page.getByLabel("攻击方宠物摘要").click();
  await page.getByLabel("关闭攻击方宠物搜索").click({ position: { x: 2, y: 2 } });

  setStep("phone parameter sheet");
  await page.getByLabel("打开攻击方详细参数").click();
  await page.locator(".parameter-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".parameter-sheet", "phone parameter sheet");
  await screenshot(page, "phone-parameter-sheet");
  await page.getByLabel("攻击方性格", { exact: true }).click();
  await page.locator(".nature-picker__menu").waitFor({ state: "visible" });
  await fillTaroInput(page.getByLabel("搜索攻击方性格"), "速度");
  await assertSurfaceInsideViewport(page, ".parameter-sheet", "phone nature picker");
  await screenshot(page, "phone-nature-picker");
  await page.locator(".nature-picker__option").first().click();
  const ivInput = await fillTaroInput(page.getByLabel("攻击方生命个体值"), "59");
  await ivInput.blur();
  await page.getByLabel("完成攻击方参数设置").click();
  await page.locator(".parameter-sheet").waitFor({ state: "hidden" });

  setStep("phone settings");
  await assertCenteredButtonLabel(page, ".app-header__action", "phone settings button");
  await page.getByLabel("打开设置").click();
  await page.locator(".settings-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".settings-sheet", "phone settings");
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /配置\s*\d+|配置库|JSON/u,
  );
  await page.getByLabel("导入PVP热门配置").waitFor({ state: "visible" });
  await page.getByLabel("导入PVP热门配置").click();
  await page.getByText("已导入 193 只，选择时自动应用", { exact: true })
    .waitFor({ state: "visible" });
  const memorySwitch = page.getByRole("switch", { name: "配置记忆" });
  assert.equal(await memorySwitch.getAttribute("aria-checked"), "true");
  await memorySwitch.click();
  assert.equal(await memorySwitch.getAttribute("aria-checked"), "false");
  await memorySwitch.click();
  assert.equal(await memorySwitch.getAttribute("aria-checked"), "true");
  const teamAnalysisSwitch = page.getByRole("switch", {
    name: "队伍防守面分析",
  });
  assert.equal(await teamAnalysisSwitch.getAttribute("aria-checked"), "false");
  await teamAnalysisSwitch.click();
  assert.equal(await teamAnalysisSwitch.getAttribute("aria-checked"), "true");
  const negativeStatusSwitch = page.getByRole("switch", {
    name: "负面状态结算",
  });
  assert.equal(await negativeStatusSwitch.getAttribute("aria-checked"), "false");
  await negativeStatusSwitch.click();
  assert.equal(await negativeStatusSwitch.getAttribute("aria-checked"), "true");
  const quickUndoSwitch = page.getByRole("switch", { name: "快捷撤回" });
  assert.equal(await quickUndoSwitch.getAttribute("aria-checked"), "false");
  await quickUndoSwitch.click();
  assert.equal(await quickUndoSwitch.getAttribute("aria-checked"), "true");
  await page.getByLabel("重置本页").click();
  await page.getByText("确认重置", { exact: true }).waitFor();
  await page.getByText("取消", { exact: true }).click();
  await page.getByText("确认重置", { exact: true }).waitFor({ state: "hidden" });
  await screenshot(page, "phone-settings");
  await page.getByLabel("关闭设置", { exact: true }).click();
  await page.locator(".settings-sheet").waitFor({ state: "hidden" });

  setStep("phone team analysis");
  await page.getByLabel("手机打开队伍防守面分析", { exact: true }).click();
  await page.locator(".team-analysis").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".team-analysis", "phone team analysis");
  setStep("phone team analysis slot");
  await page.getByLabel("选择队伍成员 1").click();
  setStep("phone team analysis search");
  await fillTaroInput(page.getByLabel("搜索队伍精灵"), "迪莫");
  setStep("phone team analysis select");
  await page.locator(".team-analysis__search-result").first().click();
  assert.match(
    await page.locator(".team-analysis__subtitle").innerText(),
    /1\/6/u,
  );
  await screenshot(page, "phone-team-analysis");
  await page.getByLabel("关闭队伍防守面分析", { exact: true }).click();
  await page.locator(".team-analysis").waitFor({ state: "hidden" });

  setStep("phone four-skill mode");
  await page.getByLabel("四技能模式").click();
  assert.equal(await page.getByLabel("四技能模式").getAttribute("aria-pressed"), "true");
  await screenshot(page, "phone-four-skill-main");
  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".skill-picker__sheet", "phone skill picker");
  const allCategory = page.getByLabel(/筛选全部技能，共 \d+ 项/u);
  const physicalCategory = page.getByLabel(/筛选物理技能，共 \d+ 项/u);
  const magicalCategory = page.getByLabel(/筛选魔法技能，共 \d+ 项/u);
  assert.equal(await allCategory.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".skill-picker__category").count(), 5);
  const fullListAnchor = await readSkillPickerAnchor(page);
  await screenshot(page, "phone-skill-picker-all");
  await physicalCategory.click();
  assert.equal(await physicalCategory.getAttribute("aria-pressed"), "true");
  await physicalCategory.click();
  assert.equal(await allCategory.getAttribute("aria-pressed"), "true");
  await magicalCategory.click();
  await fillTaroInput(page.locator(".skill-picker__search"), "sg");
  assert.equal(await page.locator(".skill-picker__option").count(), 1);
  await assertSkillPickerGeometry(page, "phone skill picker");
  const singleResultAnchor = await readSkillPickerAnchor(page);
  assertStableSkillPickerAnchor(
    singleResultAnchor,
    fullListAnchor,
    "phone skill picker single result",
  );
  assert.ok(
    singleResultAnchor.firstOptionTop - singleResultAnchor.searchTop < 82,
    "phone skill picker single result drifted away from the search field",
  );
  await screenshot(page, "phone-skill-picker");

  await page.locator(".skill-picker__overlay").evaluate((overlay) => {
    overlay.style.setProperty("--skill-picker-keyboard-height", "280px");
  });
  await page.waitForTimeout(50);
  const keyboardAnchor = await readSkillPickerAnchor(page);
  assertStableSkillPickerAnchor(
    keyboardAnchor,
    singleResultAnchor,
    "phone skill picker keyboard",
  );
  assert.ok(
    Math.abs((singleResultAnchor.bottom - keyboardAnchor.bottom) - 280) <= 1,
    "phone skill picker did not stay above the keyboard inset",
  );
  await screenshot(page, "phone-skill-picker-keyboard");
  await page.locator(".skill-picker__overlay").evaluate((overlay) => {
    overlay.style.removeProperty("--skill-picker-keyboard-height");
  });
  await allCategory.click();
  await fillTaroInput(page.locator(".skill-picker__search"), "愿力冲击");
  assert.equal(await page.locator(".skill-picker__option").count(), 18);
  assert.equal(
    await page.locator(".skill-picker__option-name").allTextContents()
      .then((names) => names.every((name) => name === "愿力冲击")),
    true,
  );
  await screenshot(page, "phone-skill-picker-wish-power");
  await magicalCategory.click();
  await fillTaroInput(page.locator(".skill-picker__search"), "sg");
  await fillTaroInput(page.locator(".skill-picker__search"), "不存在");
  await page.getByText("当前筛选无结果", { exact: true }).waitFor();
  await page.getByText("清除筛选", { exact: true }).click();
  assert.equal(await allCategory.getAttribute("aria-pressed"), "true");
  await magicalCategory.click();
  await fillTaroInput(page.locator(".skill-picker__search"), "sg");
  await page.locator(".skill-picker__option").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });
  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await page.waitForTimeout(120);
  const selectedVisibility = await page.evaluate(() => {
    const options = document.querySelector(".skill-picker__options")?.getBoundingClientRect();
    const selectedRow = document.querySelector(
      '.skill-picker__option[aria-pressed="true"]',
    )?.getBoundingClientRect();
    return {
      count: document.querySelectorAll(
        '.skill-picker__option[aria-pressed="true"]',
      ).length,
      visible: Boolean(options && selectedRow) &&
        selectedRow.top >= options.top - 1 &&
        selectedRow.bottom <= options.bottom + 1,
    };
  });
  assert.equal(selectedVisibility.count, 1, "phone skill picker selected row count");
  assert.equal(selectedVisibility.visible, true, "phone skill picker selected row visibility");
  await screenshot(page, "phone-skill-picker-selected");
  await page.locator(".skill-picker__close").click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });

  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await page.getByLabel(/筛选全部技能，共 \d+ 项/u).click();
  await fillTaroInput(page.locator(".skill-picker__search"), "猛烈撞击");
  await page.locator(".skill-picker__option").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });

  setStep("phone battle conditions");
  await page.locator(".conditions-ribbon__main").click();
  await page.locator(".conditions-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".conditions-sheet", "phone conditions sheet");
  const stageButtonColors = await page.locator(".ability-stage__button")
    .evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).color));
  assert.ok(
    stageButtonColors.every((color) => !color.includes("255, 255, 255")),
    "phone ability-stage buttons lost visible foreground color",
  );
  await page.getByLabel("当前攻击等级提高一级").click();
  await page.getByLabel("当前攻击等级降低一级").click();
  setStep("phone battle conditions target HP");
  await fillTaroInput(page.getByLabel("目标当前生命"), "400");
  setStep("phone battle conditions weather");
  await page.getByLabel("雨天", { exact: true }).click();
  await fillTaroInput(page.getByLabel("雨天回合"), "2");
  for (const label of ["灼烧", "冻结", "寄生", "中毒"]) {
    await page.getByLabel(`防守方${label}层数增加`).click();
  }
  await page.getByLabel("防守方引电层数增加").click();
  await page.getByLabel("防守方引电层数增加").click();
  await screenshot(page, "phone-conditions-sheet");
  await page.getByLabel("关闭战斗条件").click();
  await page.locator(".conditions-sheet").waitFor({ state: "hidden" });

  setStep("phone result sheet");
  await page.locator(".result-bar__action").click();
  await page.locator(".result-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".result-sheet", "phone result sheet");
  const resultRows = page.locator(".result-sheet .result-row").filter({
    has: page.locator(
      ".result-row__damage:not(.result-row__damage--neutral)",
    ),
  });
  const resultRowCount = await resultRows.count();
  assert.ok(resultRowCount > 0, "phone result sheet has no exact skill rows");
  for (let index = 0; index < resultRowCount; index += 1) {
    const row = resultRows.nth(index);
    await row.click();
    assert.equal(await row.getAttribute("aria-pressed"), "true");
  }
  const statusSettlement = page.getByLabel("负面状态结算");
  await screenshot(page, "phone-negative-status-result");
  await statusSettlement.waitFor({ state: "visible" });
  await page.getByLabel("回合状态预估").waitFor({ state: "visible" });
  const statusColors = await statusSettlement
    .locator(".result-sheet__status-row[data-status]")
    .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).color));
  assert.equal(statusColors.length, 5, "phone negative status rows are incomplete");
  assert.equal(
    new Set(statusColors).size,
    5,
    "phone negative statuses lost their distinct colors",
  );
  await page.getByLabel("关闭伤害结果").click();
  await page.locator(".result-sheet").waitFor({ state: "hidden" });

  setStep("phone baron settlement");
  await page.getByLabel("单技能模式").click();
  await page.getByLabel("攻击方宠物摘要").click();
  await fillTaroInput(page.getByLabel("搜索攻击方宠物"), "恶魔男爵");
  await page.locator(".spirit-picker__results").waitFor({ state: "visible" });
  await page.getByLabel("选择恶魔男爵", { exact: true }).click();
  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await fillTaroInput(page.locator(".skill-picker__search"), "撕咬");
  await page.locator(".skill-picker__option").first().click();
  await page.locator(".result-bar__action").click();
  await page.locator(".result-sheet").waitFor({ state: "visible" });
  const baronSettlement = page.getByLabel("贪得无厌结算");
  await baronSettlement.waitFor({ state: "visible" });
  assert.ok(
    await baronSettlement.locator(".result-sheet__baron-line").count() >= 2,
    "phone Baron settlement did not render as separate lines",
  );
  await assertSurfaceInsideViewport(page, ".result-sheet", "phone Baron result");
  await screenshot(page, "phone-baron-settlement");
  await page.getByLabel("关闭伤害结果").click();

  setStep("phone quick undo");
  const hpNatureBeforeUndo = await page.getByLabel("攻击方生命正面性格")
    .getAttribute("aria-pressed");
  await page.getByLabel("攻击方生命正面性格").click();
  assert.notEqual(
    await page.getByLabel("攻击方生命正面性格").getAttribute("aria-pressed"),
    hpNatureBeforeUndo,
    "phone undo setup did not change the selected nature",
  );
  await page.getByLabel("撤回上一步").click();
  assert.equal(
    await page.getByLabel("攻击方生命正面性格").getAttribute("aria-pressed"),
    hpNatureBeforeUndo,
    "phone quick undo did not restore the previous nature",
  );
  await screenshot(page, "phone-quick-undo");

  setStep("phone thunderstorm burst sources");
  await page.getByLabel("攻击方宠物摘要").click();
  await fillTaroInput(page.getByLabel("搜索攻击方宠物"), "酷拉");
  await page.locator(".spirit-picker__results").waitFor({ state: "visible" });
  await page.getByLabel("选择酷拉", { exact: true }).click();
  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await fillTaroInput(page.locator(".skill-picker__search"), "雷暴");
  await page.locator(".skill-picker__option").first().click();
  const burstSummary = page.getByLabel("选择迸发来源");
  await burstSummary.click();
  const burstPanel = page.getByLabel("迸发来源", { exact: true });
  await burstPanel.waitFor({ state: "visible" });
  for (const group of ["特性", "技能", "印记"]) {
    await burstPanel.getByText(group, { exact: true }).waitFor({ state: "visible" });
  }
  assert.equal(
    await burstPanel.locator(".condition-editor__burst-source").count(),
    4,
    "phone thunderstorm trait source count is incorrect",
  );
  await burstPanel.getByLabel("电流刺激").click();
  await burstPanel.getByLabel("查看技能迸发来源", { exact: true }).click();
  assert.equal(
    await burstPanel.locator(".condition-editor__burst-source").count(),
    5,
    "phone thunderstorm skill source count is incorrect",
  );
  await burstPanel.getByLabel("电弧").click();
  assert.equal(
    await burstPanel.getByLabel("电弧").getAttribute("aria-pressed"),
    "true",
  );
  await burstPanel.getByLabel("查看特性迸发来源", { exact: true }).click();
  assert.equal(
    await burstPanel.getByLabel("电流刺激").getAttribute("aria-pressed"),
    "true",
  );
  await screenshot(page, "phone-thunderstorm-burst-sources");
  await burstSummary.click();
  assert.match(await burstSummary.innerText(), /已选\s*2\/10/u);

  setStep("phone return to single mode");
  assert.equal(await page.getByLabel("单技能模式").getAttribute("aria-pressed"), "true");
  setStep("phone reset current page");
  await page.getByLabel("四技能模式").click();
  await page.getByLabel("打开设置").click();
  await page.getByLabel("重置本页").click();
  await page.getByText("确认重置", { exact: true }).click();
  await page.locator(".settings-sheet").waitFor({ state: "hidden" });
  assert.equal(await page.getByLabel("单技能模式").getAttribute("aria-pressed"), "true");
  await assertViewportSafe(page, "phone final single mode");
  assert.deepEqual(errors, [], "phone browser console errors");
  await page.close();
}

async function verifyIpad() {
  const { errors, page, setStep } = await openPage({ width: 820, height: 1180 });
  setStep("iPad main");
  await assertViewportSafe(page, "iPad main");
  await screenshot(page, "ipad-main");

  setStep("iPad skill picker");
  await page.locator(".skill-picker__trigger").first().click();
  await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".skill-picker__sheet", "iPad skill picker");
  assert.equal(await page.locator(".skill-picker__category").count(), 5);
  await page.getByLabel(/筛选物理技能，共 \d+ 项/u).click();
  await assertSkillPickerGeometry(page, "iPad skill picker");
  await screenshot(page, "ipad-skill-picker");
  await page.locator(".skill-picker__close").click();

  setStep("iPad parameter sheet");
  await page.getByLabel("打开防守方详细参数").click();
  await page.locator(".parameter-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".parameter-sheet", "iPad parameter sheet");
  await screenshot(page, "ipad-parameter-sheet");
  await page.getByLabel("完成防守方参数设置").click();

  setStep("iPad battle conditions");
  await page.locator(".conditions-ribbon__main").click();
  await page.locator(".conditions-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".conditions-sheet", "iPad conditions sheet");
  await screenshot(page, "ipad-conditions-sheet");
  await page.getByLabel("关闭战斗条件").click();

  setStep("iPad result sheet");
  await page.locator(".result-bar__action").click();
  await page.locator(".result-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".result-sheet", "iPad result sheet");
  await screenshot(page, "ipad-result-sheet");
  await page.getByLabel("关闭伤害结果").click();

  setStep("iPad settings");
  await page.getByLabel("打开设置").click();
  await page.locator(".settings-sheet").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".settings-sheet", "iPad settings");
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /配置\s*\d+|配置库|JSON/u,
  );
  await page.getByLabel("导入PVP热门配置").waitFor({ state: "visible" });
  const teamAnalysisSwitch = page.getByRole("switch", {
    name: "队伍防守面分析",
  });
  await teamAnalysisSwitch.click();
  await screenshot(page, "ipad-settings");
  await page.getByLabel("关闭设置", { exact: true }).click();

  setStep("iPad team analysis");
  await page.getByLabel("打开队伍防守面分析", { exact: true }).click();
  await page.locator(".team-analysis").waitFor({ state: "visible" });
  await assertSurfaceInsideViewport(page, ".team-analysis", "iPad team analysis");
  await screenshot(page, "ipad-team-analysis");
  await page.getByLabel("关闭队伍防守面分析", { exact: true }).click();

  assert.deepEqual(errors, [], "iPad browser console errors");
  await page.close();
}

async function verifyResponsiveSmoke() {
  const viewports = [
    { height: 700, label: "phone-320", width: 320 },
    { height: 812, label: "phone-375", width: 375 },
    { height: 932, label: "phone-430", width: 430 },
    { height: 1024, label: "ipad-768", width: 768 },
    { height: 1194, label: "ipad-834", width: 834 },
    { height: 1366, label: "ipad-1024", width: 1024 },
  ];
  for (const viewport of viewports) {
    const { errors, page, setStep } = await openPage(viewport);
    setStep(`${viewport.label} main`);
    await assertViewportSafe(page, `${viewport.label} main`);
    await page.getByLabel("打开设置").click();
    await page.locator(".settings-sheet").waitFor({ state: "visible" });
    await assertSurfaceInsideViewport(
      page,
      ".settings-sheet",
      `${viewport.label} settings`,
    );
    await page.getByLabel("关闭设置", { exact: true }).click();
    await page.locator(".result-bar__action").click();
    await page.locator(".result-sheet").waitFor({ state: "visible" });
    await assertSurfaceInsideViewport(
      page,
      ".result-sheet",
      `${viewport.label} result`,
    );
    await screenshot(page, `${viewport.label}-result`);
    assert.deepEqual(errors, [], `${viewport.label} browser console errors`);
    await page.close();
  }
}

try {
  await verifyPhone();
  console.log("PASS phone interaction matrix");
  await verifyIpad();
  console.log("PASS iPad interaction matrix");
  await verifyResponsiveSmoke();
  console.log("PASS responsive interaction smoke");
} finally {
  await browser.close();
}
