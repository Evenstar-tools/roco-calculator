import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  });
});

test("keeps the concise about summary centered in a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1424, height: 861 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "关于与来源" }).click();

  const dialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - 1424 / 2)).toBeLessThanOrEqual(1);

  await expect(
    dialog.getByText("修复Windows桌面版外链无响应。"),
  ).toBeVisible();
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

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "获取应用" }).click();
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

  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "关于与来源" }).click();
  const aboutDialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(aboutDialog).toBeVisible();
  expect(await aboutDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
