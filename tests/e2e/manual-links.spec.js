import { expect, test } from "@playwright/test";
import { resetUiuxStorage } from "./helpers/uiux-helpers.js";
import { FEATURED_USER_RELEASE } from "../../src/data/user-release-notes.js";

const manualUrl = "https://my.feishu.cn/docx/SGXddHIWgoZLd4xeouScumb3ngb?from=from_copylink";

for (const width of [1440, 390, 320]) for (const theme of ["light", "dark"]) {
  test(`manual links preserve the workspace at ${width}px ${theme}`, async ({ page, context }) => {
    await resetUiuxStorage(page);
    await page.setViewportSize({ width, height: 900 });
    // 仅验证应用的外链跳转契约，不依赖飞书登录或共享权限。
    await context.route("https://my.feishu.cn/**", route => route.fulfill({ body: "manual destination" }));
    for (const [entry, title] of [["关于与来源", "关于与来源"], [`新功能 ${FEATURED_USER_RELEASE.version}`, "新功能介绍"]]) {
      await page.goto("/");
      await expect(page.getByRole("combobox", { name: "攻击方精灵" })).toBeVisible();
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: "切换主题" }).click();
      await page.getByRole("button", { name: "打开菜单" }).click();
      await page.getByRole("button", { name: entry, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      const link = dialog.getByRole("link", { name: "查看使用说明书（飞书文档，新窗口打开）" });
      await expect(link).toHaveAttribute("href", manualUrl);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await link.scrollIntoViewIfNeeded();
      const bounds = await link.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const state = await page.evaluate(() => JSON.stringify(localStorage));
      await link.focus();
      const popupReady = page.waitForEvent("popup");
      await page.keyboard.press("Enter");
      const popup = await popupReady;
      await expect(popup).toHaveURL(manualUrl);
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      await popup.close();
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(state);
      if (title === "新功能介绍") {
        await expect(dialog.getByRole("button", { name: "知道了" })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "打开队伍" })).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });
}
