import { expect, test } from "@playwright/test";
import {
  openDetailedMode,
  resetUiuxStorage,
  selectDefaultSpirits,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "rock-calculator.settings.negative-status-settlement.v1",
      "1",
    );
  });
});

async function openAdvancedOptions(page, width) {
  await page.setViewportSize({ height: 900, width });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("button", { name: "高级选项" }).click();
  await expect(page.locator(".advanced-options__content")).toBeVisible();
}

async function measureAdvancedLayout(page) {
  return page.locator(".advanced-options__content").evaluate((content) => {
    const common = content.querySelector(".advanced-options__common");
    const markConfig = content.querySelector(".mark-config");
    const markFields = [...content.querySelectorAll(".mark-side__fields")];
    const columnCount = (node) =>
      getComputedStyle(node).gridTemplateColumns.split(/\s+/).length;
    const childrenShareTop = (node) => {
      const tops = [...node.children].map((child) => child.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops) <= 2;
    };
    const nodesFit = [...content.querySelectorAll("input, select, fieldset, label")]
      .every((node) => node.scrollWidth <= node.clientWidth + 1);
    return {
      baseControlCount: [...content.querySelectorAll("input, select")]
        .filter((node) => !node.closest(".negative-status-config")).length,
      commonChildren: common.children.length,
      commonColumns: columnCount(common),
      commonSharesTop: childrenShareTop(common),
      contentColumns: columnCount(content),
      formulaVisible: content.querySelector(".formula-audit")
        ?.getBoundingClientRect().height > 0,
      markConfigColumns: columnCount(markConfig),
      markFieldColumns: markFields.map(columnCount),
      markPairsShareTop: markFields.map(childrenShareTop),
      nodesFit,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
}

test("reflows every advanced condition without losing controls or interactions", async ({ page }) => {
  await openAdvancedOptions(page, 1203);

  const desktop = await measureAdvancedLayout(page);
  expect(desktop).toMatchObject({
    baseControlCount: 13,
    commonChildren: 4,
    commonColumns: 4,
    commonSharesTop: true,
    contentColumns: 4,
    formulaVisible: true,
    markConfigColumns: 2,
    markFieldColumns: [2, 2],
    markPairsShareTop: [true, true],
    nodesFit: true,
    pageFits: true,
  });

  await page.getByRole("combobox", { name: "天气" }).selectOption("rain");
  await page.getByRole("spinbutton", { name: "防御技能减伤" }).fill("20");
  await page.getByRole("spinbutton", { name: "最终伤害倍率" }).fill("1.25");
  await page.getByRole("combobox", { name: "血脉魔法" })
    .selectOption("photosynthetic-healing");
  const bloodlineTrigger = page.getByRole("checkbox", { name: "使用光合治愈" });
  await expect(bloodlineTrigger).toBeEnabled();
  await bloodlineTrigger.check();

  const markSlots = page.locator(".mark-slot");
  await expect(markSlots).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const slot = markSlots.nth(index);
    const select = slot.locator("select");
    const value = await select.locator("option").nth(1).getAttribute("value");
    await select.selectOption(value);
    const stacks = slot.locator("input");
    await expect(stacks).toBeEnabled();
    await stacks.fill("2");
    await expect(stacks).toHaveValue("2");
  }

  await expect(page.getByRole("combobox", { name: "天气" })).toHaveValue("rain");
  await expect(page.getByRole("spinbutton", { name: "防御技能减伤" }))
    .toHaveValue("20");
  await expect(page.getByRole("spinbutton", { name: "最终伤害倍率" }))
    .toHaveValue("1.25");
  await expect(bloodlineTrigger).toBeChecked();
  await page.getByRole("button", { name: "进攻方灼烧加一层" }).click();
  await expect(page.getByRole("spinbutton", { name: "进攻方灼烧层数" }))
    .toHaveValue("1");

  await page.setViewportSize({ height: 900, width: 1202 });
  const fallback = await measureAdvancedLayout(page);
  expect(fallback).toMatchObject({
    baseControlCount: 13,
    commonChildren: 4,
    commonColumns: 2,
    contentColumns: 4,
    formulaVisible: true,
    markConfigColumns: 2,
    markFieldColumns: [1, 1],
    nodesFit: true,
    pageFits: true,
  });

  for (const [width, contentColumns, commonColumns, markConfigColumns] of [
    [761, 4, 2, 2],
    [760, 2, 2, 2],
    [621, 2, 2, 2],
    [620, 1, 1, 1],
  ]) {
    await page.setViewportSize({ height: 900, width });
    const boundary = await measureAdvancedLayout(page);
    expect(boundary).toMatchObject({
      baseControlCount: 13,
      commonChildren: 4,
      commonColumns,
      contentColumns,
      formulaVisible: true,
      markConfigColumns,
      markFieldColumns: [1, 1],
      nodesFit: true,
      pageFits: true,
    });
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ height: 844, width });
    const mobile = await measureAdvancedLayout(page);
    expect(mobile).toMatchObject({
      baseControlCount: 13,
      commonChildren: 4,
      commonColumns: 1,
      contentColumns: 1,
      formulaVisible: true,
      markConfigColumns: 1,
      markFieldColumns: [1, 1],
      nodesFit: true,
      pageFits: true,
    });
  }
});
