import { expect, test } from "@playwright/test";
import { USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

const [latestRelease] = USER_RELEASE_NOTES;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  });
});

// 并行负载下首屏数据就绪会触发头部重渲染,单次点击可能落在被替换的旧节点上,
// 菜单因此不开;重试直到目标菜单项可见,断言本身不变。
async function openMenuItem(page, name) {
  await expect(async () => {
    await page.getByRole("button", { name: "打开菜单" }).click();
    await expect(page.getByRole("button", { name })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name }).click();
}

test("keeps the concise about summary centered in a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1424, height: 861 });
  await page.goto("/");
  await openMenuItem(page, "关于与来源");

  const dialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - 1424 / 2)).toBeLessThanOrEqual(1);

  await expect(dialog.getByText(latestRelease.version)).toBeVisible();
  await expect(dialog.getByText(latestRelease.title)).toBeVisible();
  for (const highlight of latestRelease.summaryHighlights) {
    await expect(dialog.getByText(highlight)).toBeVisible();
  }
  await expect(dialog.getByText("QQ 1215583051")).toBeVisible();
  await expect(dialog.getByText("规则校验")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "诛仙剑下伤心花" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "查看问题反馈" }).click();
  const feedbackDialog = page.getByRole("dialog", { name: "问题反馈" });
  await expect(feedbackDialog.getByRole("link", { name: "诛仙剑下伤心花" })).toHaveAttribute(
    "href",
    "https://space.bilibili.com/9281359?spm_id_from=333.1007.0.0",
  );
  await expect(feedbackDialog.getByRole("link", { name: "1215583051@qq.com" })).toHaveAttribute(
    "href",
    "mailto:1215583051@qq.com",
  );
});

test("keeps application access and about dialogs inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await openMenuItem(page, "获取应用");
  const accessDialog = page.getByRole("dialog", { name: "获取应用" });
  await expect(accessDialog).toBeVisible();
  await expect(accessDialog.getByRole("link", { name: "GitHub 发布页" }))
    .toHaveAttribute(
      "href",
      "https://github.com/Evenstar-tools/roco-calculator",
    );
  await expect(accessDialog.getByRole("link", { name: "获取 Windows 电脑版" }))
    .toHaveAttribute(
      "href",
      "https://github.com/Evenstar-tools/roco-calculator/releases/latest",
    );
  expect(await accessDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await accessDialog.getByRole("button", { name: "关闭获取应用" }).click();

  await openMenuItem(page, "关于与来源");
  const aboutDialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(aboutDialog).toBeVisible();
  expect(await aboutDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
