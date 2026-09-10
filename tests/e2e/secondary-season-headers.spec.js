import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";

const surfaces = [
  ["获取应用", ".product-access-dialog__header"],
  ["常用精灵配置", ".config-library-dialog > h2"],
  ["显示设置", ".display-settings-dialog > h2"],
  ["技能检索", ".skill-query__header"],
  ["关于与来源", ".data-source-dialog > h2"],
  ["完整版本记录", ".release-notes-dialog__header"],
  ["队伍", ".team-drawer__header"],
];

for (const width of [1440, 390, 320]) {
  for (const theme of ["light", "dark"]) {
    test(`secondary empty-state art has no rectangular edges at ${width}px ${theme}`, async ({ page }) => {
      await resetUiuxStorage(page);
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ["spirit", "skill", "team"]) {
        // 手机未选技能时隐藏结果区，避免占用技能库的可视空间。
        if (mode === "skill" && width < 720) continue;
        await page.goto("/");
        await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
        if (await page.locator("html").getAttribute("data-theme") !== theme) {
          await page.getByRole("button", { name: "切换主题" }).click();
        }
        if (mode === "team") {
          await page.getByRole("button", { name: "打开队伍" }).click();
        } else {
          await page.getByRole("button", { name: "打开菜单" }).click();
          await page.getByRole("button", { name: "技能检索", exact: true }).click();
          if (mode === "spirit") await page.getByRole("button", { name: "查精灵技能", exact: true }).click();
        }
        const area = page.locator(mode === "team" ? ".team-drawer__zero" : ".sq-results");
        await expect(area).toBeVisible();
        const style = await area.evaluate(el => {
          const decoration = getComputedStyle(el, "::before");
          return {
            mask: decoration.maskImage,
            width: parseFloat(decoration.width),
            height: parseFloat(decoration.height),
            opacity: decoration.opacity,
            pointerEvents: decoration.pointerEvents,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(style.mask, mode).toContain("radial-gradient");
        expect(style.mask, mode).toContain("rgba(0, 0, 0, 0) 100%");
        expect(style.width, mode).toBeLessThanOrEqual(380);
        expect(style.height, mode).toBeLessThanOrEqual(180);
        expect(style.opacity, mode).toBe(theme === "dark" ? "0.16" : "0.09");
        expect(style.pointerEvents, mode).toBe("none");
        expect(style.overflow, mode).toBe(false);
      }
    });

    test(`secondary season headers blend into their surface at ${width}px ${theme}`, async ({ page }) => {
      await resetUiuxStorage(page);
      await page.setViewportSize({ width, height: 900 });
      for (const [name, selector] of surfaces) {
        await page.goto("/");
        await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
        if (await page.locator("html").getAttribute("data-theme") !== theme) {
          await page.getByRole("button", { name: "切换主题" }).click();
        }
        if (name === "队伍") {
          await page.getByRole("button", { name: "打开队伍" }).click();
        } else {
          await page.getByRole("button", { name: "打开菜单" }).click();
          await page.getByRole("button", { name: name === "完整版本记录" ? "关于与来源" : name, exact: true }).click();
          if (name === "完整版本记录") await page.getByRole("button", { name: "查看完整版本记录" }).click();
        }
        const header = page.locator(selector);
        await expect(header).toBeVisible();
        const style = await header.evaluate((el) => {
          const base = getComputedStyle(el);
          const decoration = getComputedStyle(el, "::before");
          return {
            background: base.backgroundImage,
            fill: base.backgroundColor,
            shadow: base.boxShadow,
            mask: decoration.maskImage,
            opacity: decoration.opacity,
            pointerEvents: decoration.pointerEvents,
            width: parseFloat(decoration.width),
            height: decoration.height,
          };
        });
        expect(style.background, name).toBe("none");
        expect(style.fill, name).toBe("rgba(0, 0, 0, 0)");
        expect(style.shadow, name).toBe("none");
        expect(style.mask, name).toContain("radial-gradient");
        expect(style.opacity, name).toBe(theme === "dark" ? "0.2" : "0.14");
        expect(style.pointerEvents, name).toBe("none");
        expect(style.width, name).toBeLessThanOrEqual(220);
        expect(style.height, name).toBe("64px");
      }
    });
  }
}
