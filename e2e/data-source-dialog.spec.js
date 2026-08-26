import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  });
});

test("keeps the concise data-source summary centered in a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1424, height: 861 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "数据来源" }).click();

  const dialog = page.getByRole("dialog", { name: "数据来源" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - 1424 / 2)).toBeLessThanOrEqual(1);

  await expect(
    dialog.getByText("队伍升级为成员、分析、对位三页，六人矩阵首屏完整展示。"),
  ).toBeVisible();
});
