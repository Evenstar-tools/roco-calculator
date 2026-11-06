import { expect, test } from "@playwright/test";
import { resetUiuxStorage, waitForAppReady } from "./helpers/uiux-helpers.js";

const toolPath = "/tools/s5-nature/index.html";

async function chooseTarget(page, name) {
  const picker = page.getByRole("combobox", { name: "选择野生目标", exact: true });
  await picker.fill(name);
  await page.getByRole("option").getByText(name, { exact: true }).click();
  await expect(picker).toHaveValue(name);
}

async function expectHp(page, values) {
  for (const [index, nature] of ["neutral", "up", "down"].entries()) {
    await expect(page.locator(`#target-hp-range [data-hp-nature="${nature}"] b`)).toHaveText(String(values[index]));
  }
}

test("S5 nature CN toolbox opens encounter HP with shiny and responsive assets", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/");
  await waitForAppReady(page);
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  const calculations = page.getByRole("navigation", { name: "工具箱", exact: true })
    .getByRole("region", { name: "计算", exact: true });
  const entry = calculations.getByRole("link", { name: "S5奇异性格检测", exact: true });
  await expect(entry).toHaveAttribute("href", toolPath);
  await expect(entry).toHaveClass("app-menu__nature-tool");
  expect(await entry.evaluate(node => getComputedStyle(node).gridColumn)).toBe("1 / -1");
  await entry.click();
  await expect(page).toHaveURL(/\/tools\/s5-nature\/index\.html$/);
  await expect(page.getByRole("heading", { name: "S5奇异性格检测", exact: true })).toBeVisible();
  await expect(page.locator("#target-hp-range [data-hp-nature=up] b")).toHaveText(/^\d+$/);

  const ownHp = await page.evaluate(() => window.pveNatureUi.getPreview().ownPanel.hp);
  await chooseTarget(page, "深蓝鲸");
  const shiny = page.getByRole("checkbox", { name: "异色 · 生命×1.5", exact: true });
  for (const [level, values] of [[41, [508, 554, 462]], [42, [516, 564, 468]], [43, [522, 570, 474]]]) {
    await page.getByRole("group", { name: "野怪等级", exact: true })
      .getByRole("button", { name: String(level), exact: true }).click();
    await expectHp(page, values);
    await shiny.check();
    await expectHp(page, values.map(value => value * 1.5));
    await shiny.uncheck();
    await expectHp(page, values);
  }
  expect(await page.evaluate(() => window.pveNatureUi.getPreview().ownPanel.hp)).toBe(ownHp);

  // Root-relative assets must survive the nested standalone-tool route.
  const portraits = page.locator("#own-image, #target-image");
  await expect(portraits).toHaveCount(2);
  for (const portrait of await portraits.all()) await expect(portrait).toHaveAttribute("src", /^\/assets\//);
  await expect.poll(() => page.locator('img[src^="/assets/"]').evaluateAll(images =>
    images.length >= 2 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);

  await chooseTarget(page, "可爱猿");
  await page.getByRole("group", { name: "野怪等级", exact: true })
    .getByRole("button", { name: "41", exact: true }).click();
  await expectHp(page, [410, 446, 374]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const heading of await page.locator(".preview-heading h2").all()) {
    expect(await heading.evaluate(node => node.scrollWidth <= node.clientWidth && getComputedStyle(node).whiteSpace === "nowrap")).toBe(true);
  }
});

test("S5 nature stays absent from the Global toolbox", async ({ page }) => {
  await resetUiuxStorage(page);
  await page.goto("/en/");
  await expect(page.locator("html")).toHaveAttribute("data-server", "global");
  await expect(page.locator(".toolbox-trigger")).toBeEnabled();
  await page.locator(".toolbox-trigger").click();
  const menu = page.locator("#toolbox-panel");
  await expect(menu).toBeVisible();
  await expect(menu.locator(`a[href="${toolPath}"]`)).toHaveCount(0);
  await expect(menu).not.toContainText("S5奇异性格检测");
});
