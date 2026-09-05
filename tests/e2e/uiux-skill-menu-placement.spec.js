import { expect, test } from "@playwright/test";
import {
  openDetailedMode,
  resetUiuxStorage,
  selectDefaultSpirits,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("switches the single-skill menu toward available space and keeps the last option selectable", async ({ page }) => {
  await page.setViewportSize({ height: 1200, width: 1440 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.locator("#single-skill-panel").scrollIntoViewIfNeeded();

  const picker = page.getByRole("combobox", { name: "选择技能" });
  await picker.click();
  const listbox = picker.locator("xpath=..").getByRole("listbox");
  await expect(listbox).toHaveAttribute("data-placement", "down");
  let box = await listbox.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(1200);

  await page.setViewportSize({ height: 900, width: 1440 });
  await expect(listbox).toHaveAttribute("data-placement", "up");
  box = await listbox.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);

  await listbox.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const lastOption = listbox.getByRole("option").last();
  await expect.poll(async () => lastOption.getAttribute("aria-posinset"))
    .toBe(await lastOption.getAttribute("aria-setsize"));
  const lastName = await lastOption
    .locator(".skill-picker__option-name strong")
    .textContent();
  await lastOption.click();
  await expect(picker).toHaveValue(lastName.trim());
  await expect(listbox).toHaveCount(0);
});
