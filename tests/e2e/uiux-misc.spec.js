import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("keeps Hai Zhizhi portraits centered in fixed avatar boxes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto("/");

  const picker = page.getByRole("combobox", { name: "攻击方精灵" });
  await picker.fill("海枝枝");
  const option = page.getByRole("option", {
    name: /^海枝枝（碧蓝珊瑚）/,
  });
  await expect(option).toBeVisible();

  const optionPortrait = option.locator("img");
  const optionLayout = await optionPortrait.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      flexBasis: style.flexBasis,
      flexShrink: style.flexShrink,
      height: node.getBoundingClientRect().height,
      objectPosition: style.objectPosition,
      width: node.getBoundingClientRect().width,
    };
  });
  expect(optionLayout).toEqual({
    display: "block",
    flexBasis: "36px",
    flexShrink: "0",
    height: 36,
    objectPosition: "50% 50%",
    width: 36,
  });

  await option.click();
  const cardPortrait = page.locator(".spirit-picker--attack .spirit-card__image");
  await expect(cardPortrait).toBeVisible();
  await expect(cardPortrait).toHaveCSS("display", "block");
  await expect(cardPortrait).toHaveCSS("object-position", "50% 50%");
  await expect(cardPortrait).toHaveCSS("justify-self", "center");
});

test("finds S4 preview bosses through their inherited evolution chains", async ({
  page,
}) => {
  await page.goto("/");

  const picker = page.getByRole("combobox", { name: "攻击方精灵" });
  for (const { bossName, query } of [
    { bossName: "烈焰狂战士", query: "烈火守护" },
    { bossName: "满月砣", query: "月亮砣" },
  ]) {
    await picker.fill(query);
    await expect(
      page.getByRole("option", { name: new RegExp(`^${bossName}`, "u") }),
    ).toBeVisible();
  }
});
