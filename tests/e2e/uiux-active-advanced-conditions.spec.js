import { expect, test } from "@playwright/test";
import {
  resetUiuxStorage,
  selectDefaultSpirits,
} from "./helpers/uiux-helpers.js";

async function configureConditions(page) {
  await page.getByRole("button", { name: "具体版" }).click();
  await page.getByRole("button", { name: "高级选项" }).click();
  await page.getByRole("combobox", { name: "天气" }).selectOption("rain");
  await page.getByRole("spinbutton", { name: "防御技能减伤" }).fill("20");
  await page.getByRole("spinbutton", { name: "最终伤害倍率" }).fill("1.25");
  await page.getByRole("button", { name: "高级选项" }).click();
}

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/");
  await selectDefaultSpirits(page);
});

test("shows only active conditions and keeps adjust separate from formula focus", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.getByRole("button", { name: "具体版" }).click();
  await expect(page.getByRole("region", {
    name: "当前非默认高级条件",
  })).toHaveCount(0);

  await configureConditions(page);
  const summary = page.getByRole("region", { name: "当前非默认高级条件" });
  await expect(summary).toContainText("雨天 · 减伤 20% · 最终倍率 ×1.25");
  await expect(summary).not.toContainText("印记");
  const layout = await page.locator(".result-rail").evaluate((rail) => {
    const list = rail.querySelector(".skill-result-list");
    const conditions = rail.querySelector(".result-rail__active-conditions");
    const process = rail.querySelector(".result-rail__process-link");
    return {
      conditionsFollowList: Boolean(
        list && conditions &&
        list.compareDocumentPosition(conditions) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      hasProcessEntry: Boolean(process),
    };
  });
  expect(layout).toEqual({ conditionsFollowList: true, hasProcessEntry: false });

  await summary.getByRole("button", { name: "调整" }).focus();
  await page.keyboard.press("Enter");
  const advancedToggle = page.getByRole("button", { name: "高级选项" });
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(advancedToggle).toBeFocused();
  await expect(page.locator(".formula-audit")).not.toBeFocused();

  await page.getByRole("button", { name: "切换计算方向" }).click();
  await expect(summary).toHaveText("计算条件调整雨天");
});

test("mobile result drawer closes before adjust and stays within 320 and 390", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await configureConditions(page);

  for (const width of [390, 320]) {
    await page.setViewportSize({ height: 844, width });
    await page.getByRole("button", { name: "精简版" }).click();
    await expect(page.getByRole("button", { name: "高级选项" })).toHaveCount(0);
    await page.getByRole("button", { name: "展开伤害结果" }).click();
    const drawer = page.getByRole("dialog", { name: "完整伤害结果" });
    const summary = drawer.getByRole("region", {
      name: "当前非默认高级条件",
    });
    await expect(summary).toBeVisible();
    const geometry = await summary.evaluate((node) => ({
      documentFits: document.documentElement.scrollWidth <= innerWidth,
      summaryFits: node.scrollWidth <= node.clientWidth,
    }));
    expect(geometry).toEqual({ documentFits: true, summaryFits: true });

    await summary.getByRole("button", { name: "调整" }).click();
    await expect(drawer).toHaveCount(0);
    const advancedToggle = page.getByRole("button", { name: "高级选项" });
    await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
    await expect(advancedToggle).toBeFocused();
    await advancedToggle.click();
  }
});
