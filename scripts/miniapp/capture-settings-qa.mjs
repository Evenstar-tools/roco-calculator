import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ??
  "http://127.0.0.1:4177/#/pages/index/index";
const outputDir = resolve(
  process.argv[3] ?? "artifacts/settings-v0.1.2-qa",
);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  deviceScaleFactor: 1,
  viewport: { height: 844, width: 390 },
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto(targetUrl, { waitUntil: "networkidle" });
await page.locator(".battle-workspace").waitFor({ state: "visible" });
await page.locator(".app-header__action").click();
await page.locator(".settings-sheet").waitFor({ state: "visible" });
await page.screenshot({
  path: resolve(outputDir, "01-settings-before-import.png"),
});

await page.locator(".settings-sheet__action-row").click();
const importedDescription = page.locator(".settings-sheet__description", {
  hasText: "已导入 193 只",
});
await importedDescription.waitFor({ state: "visible" });
await page.screenshot({
  path: resolve(outputDir, "02-settings-after-import.png"),
});

const metrics = await page.evaluate(() => {
  const sheet = document.querySelector(".settings-sheet");
  const body = document.querySelector(".settings-sheet__body");
  const sheetBox = sheet?.getBoundingClientRect();
  const rows = [...document.querySelectorAll(
    ".settings-sheet__row, .settings-sheet__action-row, .settings-sheet__reset, .settings-sheet__source",
  )].map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  });
  return {
    bodyClientHeight: body?.clientHeight ?? 0,
    bodyScrollHeight: body?.scrollHeight ?? 0,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    rows,
    sheet: sheetBox ? {
      bottom: sheetBox.bottom,
      height: sheetBox.height,
      left: sheetBox.left,
      right: sheetBox.right,
      top: sheetBox.top,
      width: sheetBox.width,
    } : null,
  };
});

const report = {
  consoleErrors,
  importedText: await importedDescription.textContent(),
  metrics,
  targetUrl,
};
await writeFile(
  resolve(outputDir, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

await context.close();
await browser.close();

if (consoleErrors.length > 0) {
  throw new Error(consoleErrors.join("; "));
}
if (
  metrics.documentScrollWidth > metrics.documentClientWidth ||
  !metrics.sheet ||
  metrics.sheet.left < 0 ||
  metrics.sheet.right > metrics.documentClientWidth
) {
  throw new Error("设置页存在横向溢出");
}
console.log(JSON.stringify(report, null, 2));
