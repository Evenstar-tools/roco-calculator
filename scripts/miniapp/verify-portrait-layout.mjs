import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4176/#/pages/index/index";
const artifactDir = resolve(
  process.argv[3] ?? "artifacts/device-matrix-20260810",
);
const viewports = [
  { width: 320, height: 568, name: "iphone-se-1" },
  { width: 320, height: 844, name: "phone-320-tall" },
  { width: 344, height: 882, name: "fold-narrow", safeBottom: 24 },
  { width: 360, height: 640, name: "android-compact" },
  { width: 360, height: 780, name: "android-narrow", safeBottom: 24 },
  { width: 375, height: 667, name: "iphone-se" },
  { width: 375, height: 812, name: "iphone-x", safeBottom: 34 },
  { width: 390, height: 844, name: "iphone-14", safeBottom: 34 },
  { width: 393, height: 852, name: "iphone-15-pro", safeBottom: 34 },
  { width: 412, height: 915, name: "android-large", safeBottom: 24 },
  { width: 430, height: 932, name: "iphone-pro-max", safeBottom: 34 },
  { width: 768, height: 1024, name: "ipad-mini-portrait", safeBottom: 20 },
  { width: 810, height: 1080, name: "ipad-10-portrait", safeBottom: 20 },
  { width: 820, height: 1180, name: "ipad-air-portrait", safeBottom: 20 },
  { width: 1024, height: 768, name: "ipad-landscape", safeBottom: 20 },
  { width: 1180, height: 820, name: "ipad-air-landscape", safeBottom: 20 },
  { width: 1366, height: 1024, name: "ipad-pro-landscape", safeBottom: 20 },
];
const primaryControls = [
  ".app-header__action",
  ".combatant-card__summary",
  ".direction-switch__button",
  ".side-configuration > .quick-controls .quick-controls__option",
  ".side-configuration__heading",
  ".mode-switch__button",
  ".skill-picker__trigger",
  ".skill-result-row__result",
  ".conditions-ribbon__main",
  ".conditions-ribbon__health-input",
  ".result-bar__action",
].join(",");

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      }).length,
  );
}

async function assertTouchTargets(page, selector, label, minimumWidth = 43.5) {
  const controls = await page.locator(selector).evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          className: element.className,
          height: rect.height,
          width: rect.width,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
        };
      })
      .filter((item) => item.visible),
  );
  assert.ok(controls.length > 0, `${label}: no visible controls found`);
  const undersized = controls.filter(
    (item) => item.height < 43.5 || item.width < minimumWidth,
  );
  assert.deepEqual(undersized, [], `${label}: undersized touch targets`);
}

async function assertSurfaceInsideViewport(page, selector, label) {
  const box = await page.locator(selector).evaluateAll((elements) => {
    const visible = elements.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    });
    if (!visible) return null;
    const rect = visible.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const viewport = page.viewportSize();
  assert.ok(box && viewport, `${label}: surface geometry is unavailable`);
  assert.ok(box.x >= -0.5 && box.y >= -0.5, `${label}: surface starts outside viewport`);
  assert.ok(
    box.x + box.width <= viewport.width + 0.5 &&
      box.y + box.height <= viewport.height + 0.5,
    `${label}: surface overflows viewport`,
  );
}

async function assertSheetCloseAlignment(page, sheetSelector, label) {
  const prefix = sheetSelector.replace(/^\./u, "");
  const geometry = await page.locator(sheetSelector).evaluate((sheet, classPrefix) => {
    const header = sheet.querySelector(`.${classPrefix}__header`)?.getBoundingClientRect();
    const close = sheet.querySelector(`.${classPrefix}__close`)?.getBoundingClientRect();
    if (!header || !close) return null;
    return {
      centerDelta: Math.abs(
        (header.top + header.height / 2) - (close.top + close.height / 2),
      ),
      rightInset: header.right - close.right,
    };
  }, prefix);
  assert.ok(geometry, `${label}: close-button geometry is unavailable`);
  assert.ok(
    geometry.rightInset >= 13 && geometry.rightInset <= 15,
    `${label}: close button is not anchored to the right padding`,
  );
  assert.ok(
    geometry.centerDelta <= 1,
    `${label}: close button is not vertically centered`,
  );
}

async function assertSkillPickerGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const search = document.querySelector(".skill-picker__search-field")?.getBoundingClientRect();
    const options = document.querySelector(".skill-picker__options")?.getBoundingClientRect();
    const rowElement = document.querySelector(".skill-picker__option");
    const row = rowElement?.getBoundingClientRect();
    return {
      actionColumnCount: document.querySelectorAll(".skill-picker__choice-state").length,
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
  assert.ok(geometry.leftDelta <= 1, `${label}: search and rows have different left edges`);
  assert.ok(geometry.rightDelta <= 1, `${label}: search and rows have different right edges`);
  assert.equal(geometry.rowFitsOptions, true, `${label}: a row overflows the result area`);
  assert.equal(geometry.rowFitsViewport, true, `${label}: a row overflows the viewport`);
  assert.equal(geometry.rowHasInternalOverflow, false, `${label}: a row clips its content`);
}

async function assertFourSkillCardDividers(page, label) {
  const cards = await page.locator(".skill-slots--matrix .skill-result-row").evaluateAll(
    (rows) => rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      const style = getComputedStyle(row);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    }).map((row) => {
      const picker = row.querySelector(".skill-picker");
      const result = row.querySelector(".skill-result-row__result");
      const pickerRect = picker?.getBoundingClientRect();
      const resultRect = result?.getBoundingClientRect();
      const resultStyle = result ? getComputedStyle(result) : null;
      return {
        dividerWidth: Number.parseFloat(resultStyle?.borderLeftWidth ?? "0"),
        gap: pickerRect && resultRect ? resultRect.left - pickerRect.right : Number.NaN,
        radius: Number.parseFloat(resultStyle?.borderTopLeftRadius ?? "0"),
        topBorder: Number.parseFloat(resultStyle?.borderTopWidth ?? "0"),
        rightBorder: Number.parseFloat(resultStyle?.borderRightWidth ?? "0"),
        bottomBorder: Number.parseFloat(resultStyle?.borderBottomWidth ?? "0"),
      };
    }),
  );
  assert.equal(cards.length, 4, `${label}: four-skill card count is incorrect`);
  assert.deepEqual(
    cards.filter((card) =>
      card.dividerWidth < 1 ||
      Math.abs(card.gap) > 0.5 ||
      card.radius > 0 ||
      card.topBorder > 0 ||
      card.rightBorder > 0 ||
      card.bottomBorder > 0
    ),
    [],
    `${label}: result cells must use only one flush vertical divider`,
  );
}

async function assertFourSkillMetricFit(page, label) {
  const metrics = await page.locator(
    ".skill-slots--matrix .skill-result-row",
  ).evaluateAll((rows) => rows.filter((row) => {
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    return rect.width > 0 && rect.height > 0 && style.display !== "none";
  }).map((row) => {
    const result = row.querySelector(".skill-result-row__result");
    const damage = row.querySelector(".skill-result-row__damage");
    const percent = row.querySelector(".skill-result-row__percent");
    if (!result || !damage || !percent) return null;

    const previous = {
      damageClass: damage.className,
      damageText: damage.textContent,
      percentClass: percent.className,
      percentText: percent.textContent,
      resultClass: result.className,
    };
    result.classList.add("skill-result-row__result--long");
    damage.classList.add(
      "skill-result-row__damage--compact",
      "skill-result-row__damage--tight",
    );
    percent.classList.add("skill-result-row__percent--compact");
    damage.textContent = "1234567";
    percent.textContent = "999.9% HP";

    const resultRect = result.getBoundingClientRect();
    const damageRect = damage.getBoundingClientRect();
    const percentRect = percent.getBoundingClientRect();
    const measurement = {
      damageCenterDelta: Math.abs(
        damageRect.left + damageRect.width / 2 -
          (resultRect.left + resultRect.width / 2),
      ),
      damageFits:
        damage.scrollWidth <= damage.clientWidth + 0.5 &&
        damageRect.left >= resultRect.left - 0.5 &&
        damageRect.right <= resultRect.right + 0.5,
      percentCenterDelta: Math.abs(
        percentRect.left + percentRect.width / 2 -
          (resultRect.left + resultRect.width / 2),
      ),
      percentFits:
        percent.scrollWidth <= percent.clientWidth + 0.5 &&
        percentRect.left >= resultRect.left - 0.5 &&
        percentRect.right <= resultRect.right + 0.5,
    };

    result.className = previous.resultClass;
    damage.className = previous.damageClass;
    damage.textContent = previous.damageText;
    percent.className = previous.percentClass;
    percent.textContent = previous.percentText;
    return measurement;
  }));

  assert.equal(metrics.length, 4, `${label}: four metric cells are missing`);
  assert.deepEqual(
    metrics.filter((metric) =>
      !metric ||
      !metric.damageFits ||
      !metric.percentFits ||
      metric.damageCenterDelta > 1 ||
      metric.percentCenterDelta > 1
    ),
    [],
    `${label}: a long damage metric is off-center or overflows`,
  );
}

async function assertModeSwitchState(page, label) {
  const readState = () => page.locator(".mode-switch").evaluate((switcher) => {
    const buttons = Array.from(switcher.querySelectorAll(".mode-switch__button"));
    const boxes = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const visibleLabel = Array.from(button.children).find(
        (child) => getComputedStyle(child).display !== "none",
      );
      const labelRect = visibleLabel?.getBoundingClientRect();
      return {
        active: button.classList.contains("mode-switch__button--active"),
        background: getComputedStyle(button).backgroundColor,
        centerDelta: labelRect
          ? Math.max(
            Math.abs((rect.left + rect.width / 2) - (labelRect.left + labelRect.width / 2)),
            Math.abs((rect.top + rect.height / 2) - (labelRect.top + labelRect.height / 2)),
          )
          : Number.POSITIVE_INFINITY,
        height: rect.height,
        pressed: button.getAttribute("aria-pressed"),
        width: rect.width,
      };
    });
    return boxes;
  });

  let state = await readState();
  assert.equal(state.length, 2, `${label}: mode switch does not have two cells`);
  assert.ok(Math.abs(state[0].width - state[1].width) <= 0.5, `${label}: mode cells have unequal widths`);
  assert.ok(Math.abs(state[0].height - state[1].height) <= 0.5, `${label}: mode cells have unequal heights`);
  assert.ok(state.every((cell) => cell.centerDelta <= 1), `${label}: a mode label is not centered`);
  assert.equal(state.filter((cell) => cell.active).length, 1, `${label}: selected mode is not unique`);
  assert.deepEqual(state.map((cell) => cell.active), state.map((cell) => cell.pressed === "true"), `${label}: selected class and aria state disagree`);
  assert.notEqual(state[0].background, state[1].background, `${label}: selected mode has no visible fill`);

  await page.getByLabel("四技能模式").click();
  state = await readState();
  assert.deepEqual(state.map((cell) => cell.active), [false, true], `${label}: four-skill selected state did not move`);
  await page.getByLabel("单技能模式").click();
  state = await readState();
  assert.deepEqual(state.map((cell) => cell.active), [true, false], `${label}: single-skill selected state did not restore`);
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.locator(".battle-workspace").waitFor({ state: "visible" });
    if (viewport.safeBottom) {
      await page.addStyleTag({
        content: `.page { --safe-area-bottom: ${viewport.safeBottom}px !important; }`,
      });
    }

    const geometry = await page.evaluate(() => {
      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
      const images = Array.from(
        document.querySelectorAll(
          ".combatant-card__image, .element-icon, .stat-icon, .direction-switch__icon",
        ),
      )
        .filter((image) => image.getBoundingClientRect().width > 0)
        .map((image) => {
          const rect = image.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            objectFit: getComputedStyle(image).objectFit,
          };
        });
      const quickRows = Array.from(document.querySelectorAll(".quick-controls__row"))
        .filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((row) => {
          const widths = Array.from(
            row.querySelectorAll(".quick-controls__option--stat"),
          ).map((button) => button.getBoundingClientRect().width);
          return {
            captionFontSizes: Array.from(
              row.querySelectorAll(".quick-controls__stat-label"),
            ).map((caption) => Number.parseFloat(getComputedStyle(caption).fontSize)),
            label: row.querySelector(".quick-controls__row-label")?.textContent?.trim(),
            maxWidthDelta: Math.max(...widths) - Math.min(...widths),
            optionCount: widths.length,
            text: row.textContent,
          };
        });
      return {
        horizontalOverflow: documentWidth - window.innerWidth,
        images,
        quickRows,
      };
    });

    assert.ok(
      geometry.horizontalOverflow <= 0.5,
      `${viewport.name}: horizontal overflow ${geometry.horizontalOverflow}px`,
    );
    assert.ok(geometry.images.length >= 12, `${viewport.name}: icon assets missing`);
    assert.ok(
      geometry.images.every(
        (image) =>
          image.width > 0 && image.height > 0 && image.objectFit === "contain",
      ),
      `${viewport.name}: an image is cropped or lacks contain scaling`,
    );
    assert.ok(geometry.quickRows.length >= 2, `${viewport.name}: quick rows missing`);
    assert.ok(
      geometry.quickRows.every(
        (row) =>
          row.optionCount === 6 &&
          row.maxWidthDelta <= 0.5 &&
          row.captionFontSizes.every((fontSize) => fontSize >= 10) &&
          ["性格", "个体"].includes(row.label) &&
          !row.text.includes("普通"),
      ),
      `${viewport.name}: quick rows are not six equal frameless choices`,
    );
    await page.getByLabel("攻击方速度正面性格").click();
    const summaryGeometry = await page.locator(
      ".side-configuration--active .quick-controls__summary",
    ).evaluate((summary) => {
      const rect = summary.getBoundingClientRect();
      const up = summary.querySelector(".quick-controls__summary-arrow--up");
      const down = summary.querySelector(".quick-controls__summary-arrow--down");
      return {
        downColor: down ? getComputedStyle(down).color : null,
        fitsWidth: summary.scrollWidth <= summary.clientWidth + 0.5,
        height: rect.height,
        upColor: up ? getComputedStyle(up).color : null,
        whiteSpace: getComputedStyle(summary).whiteSpace,
      };
    });
    assert.equal(summaryGeometry.fitsWidth, true, `${viewport.name}: summary overflows`);
    assert.equal(summaryGeometry.whiteSpace, "nowrap", `${viewport.name}: summary wraps`);
    const expectedSummaryHeight = viewport.width < 768
      ? summaryGeometry.height >= 28 && summaryGeometry.height <= 30
      : summaryGeometry.height >= 33 && summaryGeometry.height <= 36;
    assert.ok(expectedSummaryHeight, `${viewport.name}: summary height drifted`);
    assert.notEqual(summaryGeometry.upColor, summaryGeometry.downColor, `${viewport.name}: summary arrows lost their colors`);
    await assertTouchTargets(
      page,
      primaryControls,
      viewport.name,
      viewport.width < 360 ? 39 : 43.5,
    );
    await assertModeSwitchState(page, viewport.name);

    const visibleConfigurations = await visibleCount(page, ".side-configuration");
    const visibleQuickControls = await visibleCount(
      page,
      ".side-configuration > .quick-controls",
    );
    const visibleSkillPanels = await visibleCount(page, ".skill-panel");
    const visibleResultBars = await visibleCount(page, ".result-bar");
    if (viewport.width < 768) {
      assert.equal(visibleConfigurations, 1, `${viewport.name}: expected one active configuration`);
      assert.equal(visibleQuickControls, 1, `${viewport.name}: expected one active two-row shortcut panel`);
      assert.equal(visibleSkillPanels, 1, `${viewport.name}: expected one active skill panel`);
      assert.equal(visibleResultBars, 1, `${viewport.name}: bottom result dock must remain visible`);

      const phoneDock = await page.locator(".result-bar").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const pageStyle = getComputedStyle(document.querySelector(".page"));
        return {
          bottomGap: window.innerHeight - rect.bottom,
          height: rect.height,
          pagePaddingBottom: Number.parseFloat(pageStyle.paddingBottom),
          position: getComputedStyle(element).position,
        };
      });
      assert.equal(phoneDock.position, "fixed", `${viewport.name}: result dock is not fixed`);
      assert.ok(Math.abs(phoneDock.bottomGap) <= 0.5, `${viewport.name}: result dock is not flush to viewport bottom`);
      const contentHeight = phoneDock.height - (viewport.safeBottom ?? 0);
      assert.ok(
        contentHeight >= 132 && contentHeight <= 140,
        `${viewport.name}: result dock content height ${contentHeight}px does not match the selected compact layout`,
      );
      assert.ok(phoneDock.pagePaddingBottom >= phoneDock.height, `${viewport.name}: result dock obscures page content`);

      const compactResult = await page.locator(".result-bar").evaluate((dock) => {
        const visible = (selector) => {
          const element = dock.querySelector(selector);
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none";
        };
        const rect = (selector) => dock.querySelector(selector).getBoundingClientRect();
        const action = rect(".result-bar__action");
        const actionIcon = rect(".result-bar__action-icon");
        const namesStyle = getComputedStyle(dock.querySelector(".result-bar__names"));
        const skillStyle = getComputedStyle(dock.querySelector(".result-bar__skill"));
        const damage = rect(".result-bar__damage");
        const percent = rect(".result-bar__percent");
        const remaining = rect(".result-bar__mobile-remaining");
        const track = rect(".result-bar__track-line");
        const percentElement = dock.querySelector(".result-bar__percent");
        const fillElement = dock.querySelector(".result-bar__track-fill");
        const hpPercent = Number.parseFloat(percentElement.textContent);
        const expectedTone = hpPercent < 20
          ? "success"
          : hpPercent < 50
            ? "warning"
            : "danger";
        return {
          actionHeight: action.height,
          actionWidth: action.width,
          actionIconCenterDelta: Math.max(
            Math.abs((action.left + action.width / 2) - (actionIcon.left + actionIcon.width / 2)),
            Math.abs((action.top + action.height / 2) - (actionIcon.top + actionIcon.height / 2)),
          ),
          actionIconHeight: actionIcon.height,
          actionIconWidth: actionIcon.width,
          metricBottomDelta: Math.max(
            Math.abs(damage.bottom - percent.bottom),
            Math.abs(damage.bottom - remaining.bottom),
          ),
          damageFontSize: Number.parseFloat(getComputedStyle(dock.querySelector(".result-bar__damage")).fontSize),
          nameFontSize: Number.parseFloat(namesStyle.fontSize),
          percentToneMatches:
            percentElement.classList.contains(`result-bar__percent--${expectedTone}`) &&
            fillElement.classList.contains(`result-bar__track-fill--${expectedTone}`),
          skillFontSize: Number.parseFloat(skillStyle.fontSize),
          trackWidthRatio: track.width / dock.getBoundingClientRect().width,
          targetHpVisible: visible(".result-bar__target-hp"),
          trackVisible: visible(".result-bar__track-line"),
          actionIconVisible: visible(".result-bar__action-icon"),
          actionLabelVisible: visible(".result-bar__action-label"),
        };
      });
      assert.equal(compactResult.targetHpVisible, false, `${viewport.name}: target HP editor must not appear in the compact dock`);
      assert.equal(compactResult.trackVisible, true, `${viewport.name}: damage bar is missing from the compact dock`);
      assert.equal(compactResult.actionIconVisible, true, `${viewport.name}: result chevron is missing`);
      assert.equal(compactResult.actionLabelVisible, false, `${viewport.name}: result action still shows the redundant details label`);
      assert.ok(compactResult.actionWidth >= 43.5 && compactResult.actionHeight >= 43.5, `${viewport.name}: result chevron tap target is undersized`);
      assert.ok(compactResult.actionIconCenterDelta <= 1, `${viewport.name}: result chevron is not centered`);
      assert.ok(compactResult.actionIconWidth >= 23.5 && compactResult.actionIconHeight >= 23.5, `${viewport.name}: result chevron is visually undersized`);
      assert.ok(compactResult.nameFontSize >= 17.5, `${viewport.name}: matchup names are too small`);
      assert.ok(compactResult.skillFontSize >= 14.5, `${viewport.name}: skill name is too small`);
      assert.ok(compactResult.damageFontSize >= 47.5, `${viewport.name}: damage value is too small`);
      assert.ok(compactResult.trackWidthRatio >= 0.72, `${viewport.name}: damage track is visually too short`);
      assert.equal(compactResult.percentToneMatches, true, `${viewport.name}: damage percent and track do not share the 20/50 severity state`);
      assert.ok(compactResult.metricBottomDelta <= 5, `${viewport.name}: damage metrics do not share a baseline`);
    } else {
      assert.equal(visibleConfigurations, 2, `${viewport.name}: both configurations must remain visible`);
      assert.equal(visibleQuickControls, 2, `${viewport.name}: both two-row shortcut panels must remain visible`);
      assert.equal(visibleSkillPanels, 2, `${viewport.name}: both skill panels must remain visible`);
      assert.equal(visibleResultBars, 1, `${viewport.name}: result rail must remain visible`);
    }

    const conditionGeometry = await page.locator(".conditions-ribbon").evaluate((ribbon) => {
      const main = ribbon.querySelector(".conditions-ribbon__main").getBoundingClientRect();
      const healthElement = ribbon.querySelector(".conditions-ribbon__health");
      const health = healthElement.getBoundingClientRect();
      const healthInput = ribbon.querySelector(".conditions-ribbon__health-input").getBoundingClientRect();
      const healthMaxElement = ribbon.querySelector(".conditions-ribbon__health-max");
      const healthMax = healthMaxElement.getBoundingClientRect();
      const ribbonRect = ribbon.getBoundingClientRect();
      return {
        healthContentFits: healthElement.scrollWidth <= healthElement.clientWidth + 1,
        healthInputWidth: healthInput.width,
        healthMaxVisible: getComputedStyle(healthMaxElement).display !== "none",
        healthRightInset: ribbonRect.right - healthMax.right,
        inputToMaxGap: healthMax.left - healthInput.right,
        leftInset: main.left - ribbonRect.left,
        verticalCenterDelta: Math.abs(
          (main.top + main.height / 2) - (health.top + health.height / 2),
        ),
      };
    });
    assert.equal(conditionGeometry.healthContentFits, true, `${viewport.name}: target HP content overflows its grid`);
    assert.ok(conditionGeometry.healthInputWidth <= 62.5, `${viewport.name}: target HP input exceeds its declared column`);
    if (conditionGeometry.healthMaxVisible) {
      assert.ok(conditionGeometry.healthRightInset >= 5, `${viewport.name}: target HP maximum crosses the ribbon safe edge`);
      assert.ok(conditionGeometry.inputToMaxGap >= 4, `${viewport.name}: target HP input overlaps the maximum HP label`);
    }
    assert.ok(conditionGeometry.leftInset <= 12, `${viewport.name}: battle condition content shifted right`);
    assert.ok(conditionGeometry.verticalCenterDelta <= 1, `${viewport.name}: battle condition controls are not vertically aligned`);

    await page.screenshot({
      path: resolve(artifactDir, `${viewport.name}-main.png`),
      fullPage: false,
    });

    await page.getByLabel("打开设置").click();
    await page.locator(".settings-sheet").waitFor({ state: "visible" });
    await assertSurfaceInsideViewport(
      page,
      ".settings-sheet",
      `${viewport.name} settings`,
    );
    const settingsGeometry = await page.locator(".settings-sheet")
      .evaluate((sheet) => {
        const sheetRect = sheet.getBoundingClientRect();
        const rows = Array.from(sheet.querySelectorAll(
          ".settings-sheet__row, .settings-sheet__action-row, .settings-sheet__reset",
        ));
        const controls = Array.from(sheet.querySelectorAll(
          ".settings-sheet__switch, .settings-sheet__action-text, .settings-sheet__chevron",
        ));
        return {
          controlsFit: controls.every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left >= sheetRect.left - 0.5 &&
              rect.right <= sheetRect.right + 0.5;
          }),
          height: sheetRect.height,
          rowsFit: rows.every((row) => {
            const rect = row.getBoundingClientRect();
            return rect.left >= sheetRect.left - 0.5 &&
              rect.right <= sheetRect.right + 0.5 &&
              row.scrollWidth <= row.clientWidth + 0.5;
          }),
          sheetFits: sheet.scrollWidth <= sheet.clientWidth + 0.5,
        };
      });
    assert.equal(settingsGeometry.sheetFits, true, `${viewport.name}: settings sheet scrolls horizontally`);
    assert.equal(settingsGeometry.rowsFit, true, `${viewport.name}: a settings row overflows`);
    assert.equal(settingsGeometry.controlsFit, true, `${viewport.name}: a settings action crosses the right edge`);
    if (viewport.width < 768) {
      assert.ok(
        settingsGeometry.height >= viewport.height * 0.77,
        `${viewport.name}: settings sheet is not tall enough for the primary actions`,
      );
    }
    await assertTouchTargets(
      page,
      ".settings-sheet__close, .settings-sheet__switch, .settings-sheet__reset",
      `${viewport.name} settings`,
      viewport.width < 360 ? 39 : 43.5,
    );
    const settingsText = await page.locator(".settings-sheet").textContent();
    assert.doesNotMatch(
      settingsText ?? "",
      /配置库|JSON|导入常用|配置\s*\d+/,
      `${viewport.name}: removed configuration import copy is visible`,
    );
    assert.match(
      settingsText ?? "",
      /常用精灵配置[\s\S]*重置本页[\s\S]*配置记忆/u,
      `${viewport.name}: settings primary action order is incorrect`,
    );
    for (const [name, expected] of [
      ["配置记忆", "true"],
      ["快捷撤回", "true"],
      ["队伍防守面分析", "false"],
      ["属性克制与打击面", "false"],
      ["负面状态结算", "false"],
    ]) {
      assert.equal(
        await page.getByRole("switch", { name }).getAttribute("aria-checked"),
        expected,
        `${viewport.name}: ${name} default is incorrect`,
      );
    }
    if (["iphone-se-1", "iphone-14", "ipad-air-portrait"].includes(viewport.name)) {
      await page.screenshot({
        path: resolve(artifactDir, `${viewport.name}-settings.png`),
        fullPage: false,
      });
    }
    await page.getByLabel("关闭设置", { exact: true }).click();
    await page.locator(".settings-sheet").waitFor({ state: "hidden" });

    if (viewport.name === "iphone-se-1") {
      console.log("CHECK iphone-se-1 compact overlays");
      await page.getByLabel("攻击方宠物摘要").click();
      await page.getByLabel("搜索攻击方宠物").waitFor({ state: "visible" });
      await page.getByLabel("搜索攻击方宠物").locator("input").fill("迪莫");
      await assertSurfaceInsideViewport(page, ".spirit-picker__input", "iphone-se-1 pet search");
      await assertSurfaceInsideViewport(page, ".spirit-picker__results", "iphone-se-1 pet results");
      await page.screenshot({
        path: resolve(artifactDir, "iphone-se-1-search.png"),
        fullPage: false,
      });
      await page.locator(".spirit-picker__backdrop").click({ position: { x: 2, y: 2 } });

      await page.getByLabel("打开攻击方详细参数").click();
      await page.locator(".parameter-sheet").waitFor({ state: "visible" });
      await assertSurfaceInsideViewport(page, ".parameter-sheet", "iphone-se-1 parameter sheet");
      await assertTouchTargets(
        page,
        ".quick-controls__option, .nature-picker__trigger, .iv-editor__input, .parameter-sheet__done",
        "iphone-se-1 parameter sheet",
        39,
      );
      await page.screenshot({
        path: resolve(artifactDir, "iphone-se-1-parameters.png"),
        fullPage: false,
      });
      await page.getByLabel("完成攻击方参数设置").click();

      await page.getByLabel("四技能模式").click();
      await page.locator(".skill-picker__trigger").first().click();
      await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
      await assertSurfaceInsideViewport(page, ".skill-picker__sheet", "iphone-se-1 skill picker");
      await assertSkillPickerGeometry(page, "iphone-se-1 skill picker");
      await page.screenshot({
        path: resolve(artifactDir, "iphone-se-1-skill-picker.png"),
        fullPage: false,
      });
      await page.locator(".skill-picker__close").click();
      await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });

      await page.locator(".conditions-ribbon__main").click();
      await page.locator(".conditions-sheet").waitFor({ state: "visible" });
      await assertSurfaceInsideViewport(page, ".conditions-sheet", "iphone-se-1 condition sheet");
      await assertSheetCloseAlignment(page, ".conditions-sheet", "iphone-se-1 condition sheet");
      await page.screenshot({
        path: resolve(artifactDir, "iphone-se-1-conditions.png"),
        fullPage: false,
      });
      await page.getByLabel("关闭战斗条件").click();

      await page.locator(".result-bar__action").click();
      await page.locator(".result-sheet").waitFor({ state: "visible" });
      await assertSurfaceInsideViewport(page, ".result-sheet", "iphone-se-1 result sheet");
      await page.screenshot({
        path: resolve(artifactDir, "iphone-se-1-result.png"),
        fullPage: false,
      });
      await page.getByLabel("关闭伤害结果").click();
    }

    if (viewport.name === "iphone-14") {
      await page.locator(".result-bar").screenshot({
        path: resolve(artifactDir, "iphone-14-result-dock-single.png"),
      });

      console.log("CHECK iphone-14 pet search");
      await page.getByLabel("攻击方宠物摘要").click();
      await page.getByLabel("搜索攻击方宠物").waitFor({ state: "visible" });
      await page.getByLabel("搜索攻击方宠物").locator("input").fill("迪莫");
      assert.ok(
        (await visibleCount(page, ".spirit-picker__result")) >= 4,
        "iphone-14: pet search did not expose the preset roster",
      );
      await page.locator(".spirit-picker__backdrop").click({ position: { x: 2, y: 2 } });
      await page.getByLabel("搜索攻击方宠物").waitFor({ state: "hidden" });

      await page.getByLabel("打开攻击方详细参数").click();
      await page.locator(".parameter-sheet").waitFor({ state: "visible" });
      await assertTouchTargets(
        page,
        ".quick-controls__option, .nature-picker__trigger, .iv-editor__input, .parameter-sheet__done",
        "iphone-14 parameter sheet",
      );
      await page.screenshot({
        path: resolve(artifactDir, "iphone-14-parameters.png"),
        fullPage: false,
      });
      await page.getByLabel("完成攻击方参数设置").click();

      console.log("CHECK iphone-14 four-skill picker");
      await page.getByLabel("四技能模式").click();
      const skillPosition = page.locator(".result-bar__skill-position");
      await skillPosition.waitFor({ state: "visible" });
      assert.match(await skillPosition.textContent(), /^[1-4]\/4$/, "iphone-14: four-skill result position is missing");
      await page.locator(".result-bar").screenshot({
        path: resolve(artifactDir, "iphone-14-result-dock-four.png"),
      });
      assert.equal(
        await visibleCount(page, ".skill-result-row"),
        4,
        "iphone-14: four-skill mode must show four editable rows",
      );
      await assertFourSkillCardDividers(page, "iphone-14 four-skill cards");
      await assertFourSkillMetricFit(page, "iphone-14 four-skill metrics");
      await page.screenshot({
        path: resolve(artifactDir, "iphone-14-four-skill-main.png"),
        fullPage: false,
      });
      await page.locator(".skill-picker__trigger").first().click();
      await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
      await assertSkillPickerGeometry(page, "iphone-14 skill picker");
      await page.locator(".skill-picker__close").click();
      await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });

      console.log("CHECK iphone-14 conditions");
      await page.locator(".conditions-ribbon__main").click();
      await page.locator(".conditions-sheet").waitFor({ state: "visible" });
      await assertSheetCloseAlignment(page, ".conditions-sheet", "iphone-14 condition sheet");
      await assertTouchTargets(
        page,
        ".trait-editor__control, .mark-editor__control, .conditions-sheet__close",
        "iphone-14 condition sheet",
      );
      await page.screenshot({
        path: resolve(artifactDir, "iphone-14-conditions.png"),
        fullPage: false,
      });
      await page.getByLabel("关闭战斗条件").click();

      console.log("CHECK iphone-14 result sheet");
      await page.locator(".result-bar__action").click();
      await page.locator(".result-sheet").waitFor({ state: "visible" });
      await page.screenshot({
        path: resolve(artifactDir, "iphone-14-result.png"),
        fullPage: false,
      });
      await page.getByLabel("关闭伤害结果").click();
    }

    assert.deepEqual(consoleErrors, [], `${viewport.name}: browser console errors`);
    console.log(
      `PASS ${viewport.name} overflow=${geometry.horizontalOverflow.toFixed(1)} icons=${geometry.images.length}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
