import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Jimp } from "jimp";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { HTML_CONTENT_SECURITY_POLICY } from "../../desktop/offline-paths.mjs";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

const fixture = path.resolve("tests/fixtures/lineup-images/real-qiandao-lineup.jpg");
const evidence = path.resolve("output/playwright/lineup-image-import");
const samples = {};
test.beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  prepareZXingModule({ overrides: { wasmBinary: readFileSync(fileURLToPath(import.meta.resolve("zxing-wasm/writer/zxing_writer.wasm"))) } });
  for (const [name, text] of Object.entries({ unknown: "qiandao:unknown-short-code", url: "https://example.invalid/short/abc", broken: "B~invalid" })) {
    const result = await writeBarcode(text, { format: "QRCode", scale: 6 });
    samples[name] = Buffer.from(await result.image.arrayBuffer());
  }
  samples.blank = await new Jimp({ width: 640, height: 360, color: 0xffffffff }).getBuffer("image/png");
  samples.blur = await (await Jimp.read(samples.unknown)).blur(30).getBuffer("image/png");
  const a = await Jimp.read(samples.unknown);
  const b = await Jimp.read(samples.url);
  samples.multiple = await new Jimp({ width: a.width + b.width + 40, height: Math.max(a.height, b.height) + 40, color: 0xffffffff })
    .composite(a, 10, 10).composite(b, a.width + 30, 10).getBuffer("image/png");
});

async function openImport(page) {
  await resetUiuxStorage(page);
  const external = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // 正式构建使用与桌面端相同的 CSP；外网请求一律阻断并断言未发生。
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).hostname !== "127.0.0.1") {
      external.push(request.url());
      return route.abort();
    }
    if (request.resourceType() === "document") {
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": HTML_CONTENT_SECURITY_POLICY } });
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
  await page.getByRole("button", { name: "打开队伍" }).click();
  await page.getByRole("button", { name: "导入阵容", exact: true }).click();
  await expect(page.getByRole("button", { name: "上传配队图", exact: true })).toBeVisible();
  return { external, errors };
}

test("real user image imports six members and roundtrips the original code", async ({ page }) => {
  const { external, errors } = await openImport(page);
  await page.getByLabel("上传配队图", { exact: true }).setInputFiles(fixture);
  await expect(page.getByText("已解析 6 位精灵 · 24 个技能")).toBeVisible();
  for (const name of ["爵士鹿", "幻影灵菇", "飞飞钥", "小皮球", "荆棘电环", "寂灭骨龙"]) {
    await expect(page.locator(".team-exchange__members strong").filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
  }
  await expect(page.getByLabel("新队伍名称")).toHaveValue("雨中小故事");
  const raw = await page.getByLabel("二维码原始内容").inputValue();
  expect(raw).toContain("https://rocom.qq.com/act/a20250703array/index.html?shareData=");
  await page.screenshot({ path: path.join(evidence, "desktop-preview.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator(".team-exchange").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "mobile-preview.png"), fullPage: true });
  await page.getByRole("checkbox", { name: /已确认个体处理/ }).check();
  await page.getByRole("button", { name: "保存并调整个体" }).click();
  await page.getByRole("button", { name: "导出阵容", exact: true }).click();
  await expect(page.getByLabel("阵容代码")).toHaveValue(new URL(raw).searchParams.get("shareData"));
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [sample, message] of [
  ["blank", "未识别到清晰二维码"], ["blur", "未识别到清晰二维码"],
  ["unknown", "不是已支持的阵容格式"], ["url", "不是已支持的阵容格式"],
  ["multiple", "检测到多个不同二维码"], ["broken", "阵容"],
]) {
  test(`${sample} image does not create an import preview`, async ({ page }) => {
    const { external, errors } = await openImport(page);
    await page.getByLabel("上传配队图", { exact: true }).setInputFiles({ name: `${sample}.png`, mimeType: "image/png", buffer: samples[sample] });
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByRole("button", { name: "保存并调整个体" })).toHaveCount(0);
    if (["unknown", "url", "broken"].includes(sample)) await expect(page.getByLabel("二维码原始内容")).toHaveCount(1);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
