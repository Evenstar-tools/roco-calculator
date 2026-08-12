import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4176/#/pages/index/index";
const outputRoot = resolve(process.argv[3] ?? "artifacts/wechat-review-v0.1.2");
const videoDir = resolve(outputRoot, "video-raw");

await mkdir(outputRoot, { recursive: true });
await mkdir(videoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: videoDir,
    size: { width: 390, height: 844 },
  },
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function shot(name) {
  await page.screenshot({ path: resolve(outputRoot, name), fullPage: false });
}

async function pause(milliseconds = 900) {
  await page.waitForTimeout(milliseconds);
}

await page.goto(targetUrl, { waitUntil: "networkidle" });
await page.locator(".battle-workspace").waitFor({ state: "visible" });
await page.getByLabel("攻击方宠物摘要").waitFor({ state: "visible" });
await pause(1200);
await shot("01-home-calculator.png");

await page.getByLabel("攻击方宠物摘要").click();
await page.getByLabel("搜索攻击方宠物").locator("input").fill("迪莫");
await page.locator(".spirit-picker__results").waitFor({ state: "visible" });
await pause();
await shot("02-spirit-search.png");
await page.locator(".spirit-picker__result").first().click();
await page.locator(".spirit-picker__results").waitFor({ state: "hidden" });

await page.getByLabel("攻击方魔攻正面性格").click();
await page.getByLabel("攻击方生命个体加点").click();
await pause();
await page.getByLabel("攻击方生命个体加点").click();
await pause();

await page.getByLabel("四技能模式").click();
await pause(800);
await page.locator(".skill-picker__trigger").first().click();
await page.locator(".skill-picker__sheet").waitFor({ state: "visible" });
await pause();
await page.getByLabel(/筛选全部技能，共 \d+ 项/u).click();
await pause(650);
await page.locator(".skill-picker__search input").fill("愿力冲击");
await page.locator(".skill-picker__option").first().waitFor({ state: "visible" });
await pause(900);
await shot("03-skill-selection.png");
await page.locator(".skill-picker__option").first().click();
await page.locator(".skill-picker__sheet").waitFor({ state: "hidden" });
await pause(900);

await page.locator(".conditions-ribbon__main").click();
await page.locator(".conditions-sheet").waitFor({ state: "visible" });
await pause(900);
await page.getByLabel("关闭战斗条件").click();
await page.locator(".conditions-sheet").waitFor({ state: "hidden" });
await pause(700);

await page.locator(".result-bar__action").click();
await page.locator(".result-sheet").waitFor({ state: "visible" });
await pause(1200);
await shot("04-damage-results.png");

await writeFile(
  resolve(outputRoot, "capture-report.json"),
  `${JSON.stringify({ consoleErrors: errors, targetUrl }, null, 2)}\n`,
  "utf8",
);

await context.close();
await browser.close();

if (errors.length > 0) {
  throw new Error(`录制过程中发现错误：${errors.join("; ")}`);
}

console.log(`审核截图与原始录屏已生成：${outputRoot}`);
