import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4177/#/pages/index/index";
const artifactDir = resolve(process.argv[3] ?? "artifacts/condition-layout");
const viewports = [
  { height: 568, name: "iphone-se-1", width: 320 },
  { height: 844, name: "iphone-14", width: 390 },
  { height: 932, name: "iphone-15-pro-max", width: 430 },
  { height: 1180, name: "ipad-air", width: 820 },
  { height: 1366, name: "ipad-pro", width: 1024 },
  { height: 820, name: "ipad-air-landscape", width: 1180 },
  { height: 1024, name: "ipad-pro-landscape", width: 1366 },
];

function inside(inner, outer) {
  return inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5;
}

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.locator(".battle-workspace").waitFor({ state: "visible" });
    await page.locator(".conditions-ribbon__main").click();
    await page.locator(".conditions-sheet").waitFor({ state: "visible" });

    assert.equal(await page.locator(".ability-stage").count(), 0);
    assert.equal(await page.locator(".battle-environment__field").count(), 1);
    assert.equal(await page.locator(".battle-advanced").count(), 0);
    assert.equal(await page.locator(".battle-marks").count(), 0);
    assert.equal(await page.locator(".condition-section--traits .condition-editor").count(), 0);

    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-default.png`),
    });

    const defaultGeometry = await page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value ? {
          bottom: value.bottom,
          height: value.height,
          left: value.left,
          right: value.right,
          top: value.top,
          width: value.width,
        } : null;
      };
      const content = document.querySelector(".conditions-sheet__content");
      return {
        common: rect(".battle-environment"),
        content: rect(".conditions-sheet__content"),
        contentHorizontalOverflow: content.scrollWidth - content.clientWidth,
        sheet: rect(".conditions-sheet"),
        trait: rect(".condition-section--traits"),
      };
    });
    assert.ok(defaultGeometry.sheet && defaultGeometry.content && defaultGeometry.common);
    assert.ok(defaultGeometry.sheet.left >= -0.5);
    assert.ok(defaultGeometry.sheet.right <= viewport.width + 0.5);
    assert.ok(defaultGeometry.contentHorizontalOverflow <= 0.5);
    assert.ok(inside(defaultGeometry.common, defaultGeometry.content));

    await page.locator(".battle-environment__weather-button").nth(1).click();
    assert.equal(await page.locator(".battle-environment__field").count(), 2);

    const traitSection = page.locator(".condition-section--traits");
    if (await traitSection.count()) {
      await traitSection.locator(".condition-section__toggle").click();
      assert.ok(await traitSection.locator(".condition-editor").count());
    }

    await page.locator(".condition-section--marks .condition-section__toggle").click();
    const visibleMarkEditorCount = await page.locator(
      ".battle-marks__editor",
    ).evaluateAll((editors) => editors.filter((editor) => {
      const box = editor.getBoundingClientRect();
      return getComputedStyle(editor).display !== "none" && box.width > 0;
    }).length);
    assert.equal(visibleMarkEditorCount, viewport.width >= 768 ? 2 : 1);

    await page.locator(".condition-section--advanced .condition-section__toggle").click();
    assert.equal(await page.locator(".battle-advanced__input").count(), 2);

    const expandedGeometry = await page.evaluate(() => {
      const content = document.querySelector(".conditions-sheet__content");
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && box.width > 0 && box.height > 0;
      };
      const widthDeltas = Array.from(
        document.querySelectorAll(".mark-editor__choices"),
      ).filter(visible).map((row) => {
        const widths = Array.from(row.children).map(
          (child) => child.getBoundingClientRect().width,
        );
        return widths.length ? Math.max(...widths) - Math.min(...widths) : 0;
      });
      const trait = document.querySelector(".condition-section--traits")
        ?.getBoundingClientRect();
      const marks = document.querySelector(".condition-section--marks")
        ?.getBoundingClientRect();
      return {
        contentHorizontalOverflow: content.scrollWidth - content.clientWidth,
        tabletColumnsAligned: !trait || !marks ||
          (Math.abs(trait.top - marks.top) <= 0.5 && trait.right <= marks.left + 0.5),
        widthDeltas,
      };
    });
    assert.ok(expandedGeometry.contentHorizontalOverflow <= 0.5);
    assert.ok(expandedGeometry.widthDeltas.every((delta) => delta <= 0.5));
    if (viewport.width >= 768) {
      assert.equal(expandedGeometry.tabletColumnsAligned, true);
    }
    assert.deepEqual(errors, []);

    await page.locator(".conditions-sheet__content").evaluate((content) => {
      content.scrollTop = 0;
    });

    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-expanded.png`),
    });

    await page.locator(".conditions-sheet__close").click();
    await page.locator(".mode-switch__button").nth(1).click();
    assert.equal(await page.locator(".active-skill-conditions").count(), 0);
    await page.locator(
      ".skill-panel--attacker .skill-result-row__result",
    ).first().click();
    await page.locator(".result-sheet").waitFor({ state: "visible" });
    const skillParameters = page.locator(".condition-section--skill-parameters");
    assert.equal(await skillParameters.count(), 1);
    assert.equal(await skillParameters.locator(".condition-editor").count(), 0);
    await skillParameters.locator(".condition-section__toggle").click();
    assert.equal(await skillParameters.locator(".condition-editor").count(), 1);
    const resultOverflow = await page.locator(".result-sheet__scroll").evaluate(
      (scroll) => scroll.scrollWidth - scroll.clientWidth,
    );
    assert.ok(resultOverflow <= 0.5);
    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-four-skill-parameters.png`),
    });

    report.push({
      defaultGeometry,
      expandedGeometry,
      name: viewport.name,
      passed: true,
      resultOverflow,
      viewport,
    });
    console.log(`PASS ${viewport.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  resolve(artifactDir, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
