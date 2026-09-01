import { expect, test } from "@playwright/test";
import {
  selectSpirit,
  resetUiuxStorage,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("first-run guide appears once, can be replayed, and imports popular configs", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("first-run-guide-e2e")) return;
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
    sessionStorage.setItem("first-run-guide-e2e", "1");
  });
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 2/6" })).toBeVisible();
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("button", { name: "具体版" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("以后修改性格、个体和技能，都会继续记住"))
    .toBeVisible();
  await page.getByRole("button", { name: "导入并完成" }).click();
  await expect(page.getByText(/已导入 \d+ 只常用配置/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: /新手引导/ })).toHaveCount(0);
  expect(await page.evaluate(() =>
    localStorage.getItem("rock-calculator.first-run-guide.v1"),
  )).toBe("1");

  await page.reload();
  await expect(page.getByRole("dialog", { name: /新手引导/ })).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "新手引导" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
});

test("captures the selected onboarding design at the desktop viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-step-1.png",
  });
  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 6/6" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-step-6.png",
  });
});

test("resizes the picker spotlight without blocking dropdown or page wheel scrolling", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const spotlight = page.locator(".first-run-guide__spotlight");
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  const attackerRoot = page.locator('[data-guide-root="attacker"]');
  const attackerSearch = attackerRoot.locator('[data-guide-target="attacker"]');
  const initialSpotlight = await spotlight.boundingBox();
  const searchBox = await attackerSearch.boundingBox();
  expect(initialSpotlight.height).toBeLessThan(60);
  expect(initialSpotlight.y).toBeLessThanOrEqual(searchBox.y);

  await attackerPicker.click();
  const options = attackerRoot.locator('[data-guide-part="options"]');
  await expect(options).toBeVisible();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(250);
  const beforeListScroll = await options.evaluate((node) => node.scrollTop);
  await options.hover();
  await page.mouse.wheel(0, 520);
  await expect.poll(async () => options.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(beforeListScroll);

  await attackerPicker.fill("音速犬");
  await page.getByRole("option", { name: /^音速犬/ }).click();
  const selection = attackerRoot.locator('[data-guide-part="selection"]');
  const selectionBox = await selection.boundingBox();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(selectionBox.height);
  const selectedSpotlight = await spotlight.boundingBox();
  expect(selectedSpotlight.y).toBeLessThanOrEqual(searchBox.y);
  expect(selectedSpotlight.y + selectedSpotlight.height)
    .toBeGreaterThanOrEqual(selectionBox.y + selectionBox.height);

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.testScrollSpacer = "true";
    spacer.style.height = "900px";
    document.querySelector("main")?.append(spacer);
  });
  const beforePageScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1100, 700);
  await page.mouse.wheel(0, 520);
  await expect.poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(beforePageScroll);

  await page.getByRole("button", { name: "下一步" }).click();
  const defenderPicker = page.getByRole("combobox", { name: "防御方精灵" });
  await defenderPicker.click();
  const defenderRoot = page.locator('[data-guide-root="defender"]');
  await expect(defenderRoot.locator('[data-guide-part="options"]')).toBeVisible();
  await expect.poll(async () => (await spotlight.boundingBox()).height)
    .toBeGreaterThan(250);
  await defenderPicker.fill("水灵");
  await page.getByRole("option", { name: /^水灵/ }).click();
  const defenderSelection = defenderRoot.locator('[data-guide-part="selection"]');
  const defenderSelectionBox = await defenderSelection.boundingBox();
  const defenderSpotlight = await spotlight.boundingBox();
  expect(defenderSpotlight.y + defenderSpotlight.height)
    .toBeGreaterThanOrEqual(defenderSelectionBox.y + defenderSelectionBox.height);
});

test("keeps the six-step guide aligned in a narrow viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("rock-calculator.first-run-guide.v1");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("dialog", { name: /新手引导/ })).toHaveCount(0);
  expect(await page.evaluate(() =>
    localStorage.getItem("rock-calculator.first-run-guide.v1"),
  )).toBeNull();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "新手引导" }).click();

  const card = page.locator(".first-run-guide__card");
  const spotlight = page.locator(".first-run-guide__spotlight");
  const expectInsideViewport = async (locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
  };
  const expectSeparated = async (first, second) => {
    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    const overlaps = !(
      firstBox.x + firstBox.width <= secondBox.x ||
      secondBox.x + secondBox.width <= firstBox.x ||
      firstBox.y + firstBox.height <= secondBox.y ||
      secondBox.y + secondBox.height <= firstBox.y
    );
    expect(overlaps).toBe(false);
  };

  await expect(page.getByRole("dialog", { name: "新手引导 1/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);

  await selectSpirit(page, "攻击方", "音速犬");
  await page.getByRole("button", { name: "下一步" }).click();

  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 3/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 4/6" })).toBeVisible();
  await expectInsideViewport(card);
  await expectInsideViewport(spotlight);
  await expectSeparated(card, spotlight);
  const skillSpotlight = await spotlight.boundingBox();
  expect(skillSpotlight.height).toBeLessThan(90);
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/first-run-guide-mobile-step-4.png",
  });

  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "前往具体版" }).click();
  await expect(page.getByRole("dialog", { name: "新手引导 6/6" })).toBeVisible();
  await expectInsideViewport(card);
});
