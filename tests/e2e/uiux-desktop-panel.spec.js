import { expect, test } from "@playwright/test";
import {
  openDetailedMode,
  resetUiuxStorage,
  selectDefaultSpirits,
  selectSpirit,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("keeps detailed attack and defense skill rows fitting at desktop boundaries", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();
  await selectSpirit(page, "攻击方", "风暴酷拉");

  const skillPicker = page.getByRole("combobox", { name: "攻击方技能1" });
  await skillPicker.fill("雷暴");
  await page.getByRole("option").filter({
    has: page.getByText("雷暴", { exact: true }),
  }).click();

  const layout = await page.locator(".four-skill-editor").evaluate((editor) => {
    const sides = [...editor.querySelectorAll(".four-skill-side")];
    const rows = [...editor.querySelectorAll(".skill-slot-group")];
    return {
      columnsAligned: sides.length === 2 &&
        Math.abs(sides[0].getBoundingClientRect().top - sides[1].getBoundingClientRect().top) <= 2,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
      rowsFit: rows.every((row) => row.scrollWidth <= row.clientWidth),
      sidesFit: sides.every((side) => side.scrollWidth <= side.clientWidth),
    };
  });

  expect(layout).toEqual({
    columnsAligned: true,
    pageFits: true,
    rowsFit: true,
    sidesFit: true,
  });

  await page.setViewportSize({ height: 800, width: 1201 });
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  await attackerPicker.fill("石冠王蜥");
  await page.getByRole("option", { name: /^石冠王蜥\s/ }).click();
  const traitRow = page.getByRole("group", { name: "攻击方特性伤害刺肤" });
  await expect(traitRow).toBeVisible();
  expect(await traitRow.locator(".skill-slot").evaluate(
    (slot) => slot.scrollWidth <= slot.clientWidth,
  )).toBe(true);
});

test("opens the calculation process by keyboard without hijacking later manual Advanced toggles", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const processEntry = page.getByRole("button", { name: "查看当前技能计算过程" });
  await processEntry.focus();
  await processEntry.press("Enter");

  const advancedToggle = page.getByRole("button", { name: "高级选项" });
  const formulaAudit = page.locator(".formula-audit");
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(formulaAudit).toBeFocused();
  await expect.poll(async () => formulaAudit.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return box.top < innerHeight && box.bottom > 0;
  })).toBe(true);

  await advancedToggle.click();
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "false");
  await advancedToggle.click();
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(advancedToggle).toBeFocused();
  await expect(formulaAudit).not.toBeFocused();
});
