import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4177/#/pages/index/index";
const artifactDir = resolve(
  process.argv[3] ?? "artifacts/condition-layout",
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
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport,
    });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.locator(".battle-workspace").waitFor({ state: "visible" });
    await page.locator(".conditions-ribbon__main").click();
    await page.locator(".conditions-sheet").waitFor({ state: "visible" });

    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-top.png`),
    });

    const geometry = await page.evaluate(async () => {
      const content = document.querySelector(".conditions-sheet__content");
      const sheet = document.querySelector(".conditions-sheet");
      const environmentFields = Array.from(
        document.querySelectorAll(".battle-environment__field"),
      );
      const inputGroups = environmentFields.map((field) => {
        const wrap = field.querySelector(".battle-environment__input-wrap");
        const input = field.querySelector(".battle-environment__input");
        const suffix = field.querySelector(".battle-environment__suffix");
        const wrapRect = wrap.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const suffixRect = suffix?.getBoundingClientRect();
        return {
          fits: wrap.scrollWidth <= wrap.clientWidth + 0.5,
          inputInside:
            inputRect.left >= wrapRect.left - 0.5 &&
            inputRect.right <= wrapRect.right + 0.5,
          inputToSuffixGap: suffixRect ? suffixRect.left - inputRect.right : 99,
          suffixHeight: suffixRect?.height ?? 0,
          suffixWhiteSpace: suffix ? getComputedStyle(suffix).whiteSpace : null,
        };
      });
      const environmentWidths = environmentFields.map(
        (field) => field.getBoundingClientRect().width,
      );
      const traitGroups = Array.from(
        document.querySelectorAll(".condition-editor__group"),
      );
      const firstTraitControls = Array.from(
        document.querySelector(".trait-editor__controls")?.children ?? [],
      ).map((control) => control.getBoundingClientRect());
      const markEditors = Array.from(document.querySelectorAll(".mark-editor"));
      const markWidths = markEditors.map(
        (editor) => editor.getBoundingClientRect().width,
      );
      const markRows = Array.from(
        document.querySelectorAll(".mark-editor__choices"),
      ).map((row) => {
        const controls = Array.from(row.children).map(
          (control) => control.getBoundingClientRect().width,
        );
        return controls.length
          ? Math.max(...controls) - Math.min(...controls)
          : Number.POSITIVE_INFINITY;
      });

      content.scrollTop = content.scrollHeight;
      await new Promise((done) => requestAnimationFrame(done));
      const contentRect = content.getBoundingClientRect();
      const visibleMarkControls = Array.from(
        content.querySelectorAll(".mark-editor__control"),
      ).map((control) => control.getBoundingClientRect()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const lastControlBottom = visibleMarkControls.length
        ? Math.max(...visibleMarkControls.map((rect) => rect.bottom))
        : null;
      const sheetRect = sheet.getBoundingClientRect();

      return {
        contentHorizontalOverflow: content.scrollWidth - content.clientWidth,
        environmentColumnDelta: environmentWidths.length
          ? Math.max(...environmentWidths) - Math.min(...environmentWidths)
          : Number.POSITIVE_INFINITY,
        inputGroups,
        lastControlBottomGap: lastControlBottom !== null
          ? contentRect.bottom - lastControlBottom
          : Number.NEGATIVE_INFINITY,
        markColumnDelta: markWidths.length
          ? Math.max(...markWidths) - Math.min(...markWidths)
          : Number.POSITIVE_INFINITY,
        markCount: markEditors.length,
        markRowWidthDeltas: markRows,
        sheetInsideViewport:
          sheetRect.left >= -0.5 && sheetRect.right <= window.innerWidth + 0.5,
        traitDescriptionCount: document.querySelectorAll(
          ".trait-editor__description",
        ).length,
        traitControlCount: firstTraitControls.length,
        traitControlLeftDelta: firstTraitControls.length >= 2
          ? Math.abs(firstTraitControls[0].left - firstTraitControls[1].left)
          : 0,
        traitControlTopDelta: firstTraitControls.length >= 2
          ? Math.abs(firstTraitControls[0].top - firstTraitControls[1].top)
          : 0,
        traitGroupCount: traitGroups.length,
        traitHeadingCount: document.querySelectorAll(
          ".trait-editor__heading",
        ).length,
      };
    });

    assert.equal(geometry.sheetInsideViewport, true, `${viewport.name}: sheet overflows viewport`);
    assert.ok(geometry.contentHorizontalOverflow <= 0.5, `${viewport.name}: sheet content overflows horizontally`);
    assert.ok(geometry.environmentColumnDelta <= 0.5, `${viewport.name}: environment columns are uneven`);
    assert.ok(
      geometry.inputGroups.every(
        (group) =>
          group.fits &&
          group.inputInside &&
          group.inputToSuffixGap >= 5.5 &&
          group.suffixHeight <= 18 &&
          group.suffixWhiteSpace === "nowrap",
      ),
      `${viewport.name}: an environment unit wraps, overlaps, or escapes its field`,
    );
    assert.ok(geometry.traitGroupCount > 0, `${viewport.name}: trait groups are missing`);
    assert.equal(geometry.traitHeadingCount, geometry.traitGroupCount, `${viewport.name}: trait headings lack a stable row`);
    assert.equal(geometry.traitDescriptionCount, geometry.traitGroupCount, `${viewport.name}: trait descriptions lack a readable text block`);
    if (geometry.traitControlCount >= 2) {
      if (viewport.width >= 768) {
        assert.ok(geometry.traitControlTopDelta <= 0.5, `${viewport.name}: trait parameters should use the available tablet width`);
      } else {
        assert.ok(geometry.traitControlLeftDelta <= 0.5, `${viewport.name}: trait parameters should remain one readable phone column`);
      }
    }
    assert.equal(geometry.markCount, 2, `${viewport.name}: attacker/defender marks are incomplete`);
    assert.ok(geometry.markColumnDelta <= 0.5, `${viewport.name}: mark columns are uneven`);
    assert.ok(
      geometry.markRowWidthDeltas.every((delta) => delta <= 0.5),
      `${viewport.name}: mark controls have random widths`,
    );
    assert.ok(geometry.lastControlBottomGap >= 23.5, `${viewport.name}: final mark row is too close to the safe edge`);
    assert.deepEqual(errors, [], `${viewport.name}: browser console errors`);

    await page.screenshot({
      fullPage: false,
      path: resolve(artifactDir, `${viewport.name}-bottom.png`),
    });
    console.log(`PASS ${viewport.name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
