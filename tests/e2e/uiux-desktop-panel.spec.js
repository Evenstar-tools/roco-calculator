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

test("season header keeps desktop geometry and persists the lunar dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
  await expect(page.locator(".app-header__season")).toHaveAttribute("aria-hidden", "true");
  const wolf = page.locator(".app-header__season-wolf");
  await expect.poll(() => wolf.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  const scene = await page.request.get("/assets/season/s4-moon-night.webp");
  expect(scene.ok()).toBe(true);
  expect(scene.headers()["content-type"]).toContain("image/webp");

  for (const width of [801, 900, 1100, 1101, 1280, 1299, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator(".app-header").evaluate((header) => {
      const actions = header.querySelector(".app-header__actions").getBoundingClientRect();
      const title = header.querySelector("h1").getBoundingClientRect();
      return {
        fits: document.documentElement.scrollWidth <= innerWidth,
        height: header.getBoundingClientRect().height,
        noOverlap: title.right <= actions.left,
        decorationIgnoresClicks: getComputedStyle(header.querySelector(".app-header__season")).pointerEvents === "none",
      };
    });
    expect(geometry).toEqual({ fits: true, height: width <= 1080 ? 52 : 50, noOverlap: true, decorationIgnoresClicks: true });
    const lightWolf = await wolf.boundingBox();
    await page.getByRole("button", { name: "切换主题" }).click();
    const darkWolf = await page.locator("body").evaluate((body) => {
      const style = getComputedStyle(body, "::before");
      const bodyRect = body.getBoundingClientRect();
      const imageWidth = parseFloat(style.backgroundSize.split(", ")[1]);
      // 背景百分比以容器减去图片后的剩余空间为基准，用浏览器解析实际绘制位置。
      const ruler = document.createElement("div");
      ruler.style.cssText = `position:fixed;left:0;top:0;width:${bodyRect.width - imageWidth}px;visibility:hidden;pointer-events:none`;
      const marker = document.createElement("span");
      marker.style.position = "absolute";
      marker.style.left = style.backgroundPositionX.split(", ")[1];
      ruler.append(marker);
      body.append(ruler);
      const x = bodyRect.left + marker.getBoundingClientRect().left;
      ruler.remove();
      return { x, y: bodyRect.top + parseFloat(style.backgroundPositionY.split(", ")[1]), width: imageWidth };
    });
    expect(Math.abs(darkWolf.x - lightWolf.x), `wolf x at ${width}px`).toBeLessThan(0.1);
    expect(darkWolf.y, `wolf y at ${width}px`).toBe(lightWolf.y);
    expect(darkWolf.width, `wolf width at ${width}px`).toBe(lightWolf.width);
    await page.getByRole("button", { name: "切换主题" }).click();
    expect(await wolf.boundingBox()).toEqual(lightWolf);
  }
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(16, 23, 34)");
  await expect(page.locator(".app-header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".app-header")).toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
  const sky = await page.locator("body").evaluate((body) => {
    const style = getComputedStyle(body, "::before");
    return { height: style.height, pointerEvents: style.pointerEvents, background: style.backgroundImage };
  });
  expect(sky.height).toBe("240px");
  expect(sky.pointerEvents).toBe("none");
  expect(sky.background).toContain("s4-moon-night.webp");
  expect(await page.locator("body").innerText()).not.toMatch(/S3[\s-]*季中|前瞻/u);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".app-header h1")).toHaveCSS("color", "rgb(244, 242, 229)");
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
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

test("keeps the calculation process inside Advanced options without a duplicate result entry", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const advancedToggle = page.getByRole("button", { name: "高级选项" });
  const formulaAudit = page.locator(".formula-audit");
  await expect(page.getByRole("button", { name: "查看当前技能计算过程" }))
    .toHaveCount(0);
  await advancedToggle.click();
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true");
  await expect(formulaAudit).toBeVisible();
});
