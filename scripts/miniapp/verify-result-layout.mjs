import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl =
  process.argv[2] ?? "http://127.0.0.1:4178/#/pages/index/index";
const artifactDir = resolve(
  process.argv[3] ?? "artifacts/2026-08-11-result-layout/h5",
);
const viewports = [
  { height: 568, name: "iphone-se-1", width: 320 },
  { height: 844, name: "iphone-14", width: 390 },
  { height: 1180, name: "ipad-air", width: 820 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

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
    await page.getByLabel("四技能模式").click();
    await page.locator(".result-bar__action").click();
    await page.locator(".result-sheet").waitFor({ state: "visible" });

    const geometry = await page.evaluate(() => {
      const sheet = document.querySelector(".result-sheet");
      const scroll = document.querySelector(".result-sheet__scroll");
      const summary = document.querySelector(".result-sheet__summary");
      const rows = Array.from(document.querySelectorAll(".result-row"));
      const formulaRows = Array.from(
        document.querySelectorAll(".result-formula__row"),
      );
      const share = document.querySelector(".result-sheet__share");
      const sheetRect = sheet.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const shareRect = share.getBoundingClientRect();
      return {
        formulaCount: formulaRows.length,
        formulaRowsFit: formulaRows.every(
          (row) => row.scrollWidth <= row.clientWidth + 0.5,
        ),
        rowCount: rows.length,
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        rowsFit: rows.every((row) => {
          const rect = row.getBoundingClientRect();
          return (
            rect.left >= scrollRect.left - 0.5 &&
            rect.right <= scrollRect.right + 0.5 &&
            row.scrollWidth <= row.clientWidth + 0.5
          );
        }),
        scrollHorizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
        shareVisible:
          shareRect.top >= sheetRect.top - 0.5 &&
          shareRect.bottom <= sheetRect.bottom + 0.5,
        sheetInsideViewport:
          sheetRect.left >= -0.5 &&
          sheetRect.right <= window.innerWidth + 0.5 &&
          sheetRect.top >= -0.5 &&
          sheetRect.bottom <= window.innerHeight + 0.5,
        summaryFits:
          summaryRect.left >= scrollRect.left - 0.5 &&
          summaryRect.right <= scrollRect.right + 0.5 &&
          summary.scrollWidth <= summary.clientWidth + 0.5,
      };
    });

    assert.equal(
      geometry.sheetInsideViewport,
      true,
      `${viewport.name}: result sheet overflows viewport`,
    );
    assert.ok(
      geometry.scrollHorizontalOverflow <= 0.5,
      `${viewport.name}: result content overflows horizontally`,
    );
    assert.equal(geometry.summaryFits, true, `${viewport.name}: summary clips`);
    assert.ok(geometry.rowCount >= 2, `${viewport.name}: skill rows missing`);
    assert.equal(geometry.rowsFit, true, `${viewport.name}: a skill row clips`);
    assert.ok(
      geometry.rowHeights.every((height) => height >= 43.5),
      `${viewport.name}: a skill row is below the touch target`,
    );
    assert.equal(
      geometry.formulaCount,
      4,
      `${viewport.name}: formula stages are incomplete`,
    );
    assert.equal(
      geometry.formulaRowsFit,
      true,
      `${viewport.name}: formula content clips`,
    );
    assert.equal(
      geometry.shareVisible,
      true,
      `${viewport.name}: share action is outside the sheet`,
    );

    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-top.png`),
    });

    const resultRows = page.locator(".result-row");
    for (let index = 0; index < await resultRows.count(); index += 1) {
      await resultRows.nth(index).click();
      assert.equal(
        await resultRows.nth(index).getAttribute("aria-pressed"),
        "true",
        `${viewport.name}: selected skill state did not move`,
      );
    }

    await page.locator(".result-sheet__scroll").evaluate((scroll) => {
      scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForTimeout(80);
    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-bottom.png`),
    });

    assert.deepEqual(errors, [], `${viewport.name}: browser console errors`);
    console.log(`PASS ${viewport.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
