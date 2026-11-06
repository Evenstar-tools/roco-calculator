import { expect, test } from "@playwright/test";
import { USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";
import { resetUiuxStorage, selectSpirit, waitForAppReady } from "./helpers/uiux-helpers.js";

const [latestRelease] = USER_RELEASE_NOTES;

test("CN web plugin opens releases download in a new tab and preserves calculator at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await resetUiuxStorage(page);
  await page.goto("/cn/");
  await waitForAppReady(page);
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "水灵");
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  const menu = page.getByRole("navigation", { name: "工具箱", exact: true });
  await expect(menu.getByRole("region", { name: "插件工具", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const search = page.getByRole("combobox", { name: "攻击方精灵", exact: true });
  await search.fill("龙骑士");
  await expect(page.getByText("某处的大门已开启", { exact: true })).toHaveCount(0);
  await search.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "某处的大门已开启" })).toBeVisible();
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  const plugin = menu.getByRole("region", { name: "插件工具", exact: true })
    .getByRole("link", { name: "野生精灵检测器", exact: true });
  await expect(plugin).toBeInViewport();
  await expect(plugin).toHaveAttribute("href", "/plugins/wild-spirit-detector/");
  await expect(plugin).toHaveAttribute("target", "_blank");
  await expect(plugin).toHaveAttribute("rel", "noopener noreferrer");
  const [intro] = await Promise.all([page.waitForEvent("popup"), plugin.click()]);
  await intro.waitForLoadState("domcontentloaded");
  await expect(intro).toHaveURL(/\/plugins\/wild-spirit-detector\/$/);
  await expect(intro.getByRole("heading", { name: "野生精灵检测器", exact: true })).toBeVisible();
  await expect(intro.locator(".actions").getByRole("link")).toHaveCount(1);
  const download = intro.locator(".actions").getByRole("link", { name: "下载工具", exact: true });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("href", "https://github.com/Evenstar-tools/roco-pve-viewer/releases");
  await expect(download).toHaveAttribute("target", "_blank");
  await expect(download).toHaveAttribute("rel", "noopener noreferrer");
  await expect(intro.locator(".availability")).toHaveCount(0);
  await expect(intro.locator("body")).not.toContainText("源码预览版");
  await expect(intro.locator("body")).not.toContainText("尚未提供可直接安装的完整程序包");
  await expect(intro.getByText("无偿分享", { exact: false })).toBeVisible();
  await expect(intro.getByRole("heading", { name: "免责声明", exact: true })).toBeVisible();
  await expect(intro.locator(".disclaimer")).toContainText("使用风险由使用者自行承担");
  await expect(intro.getByRole("link", { name: /返回国服计算器/ })).toHaveAttribute("href", "/cn/");
  expect(await intro.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const copied = await page.context().newPage();
  await copied.goto(intro.url());
  await expect(copied).toHaveURL(/\/cn\/$/);
  await expect(copied.getByRole("heading", { name: "野生精灵检测器", exact: true })).toHaveCount(0);
  await copied.close();
  await expect(menu).not.toBeVisible();
  await expect(page).toHaveURL(/\/cn\/$/);
  await expect(page.getByRole("combobox", { name: "攻击方精灵", exact: true })).toHaveValue("音速犬");
  await expect(page.getByRole("combobox", { name: "防御方精灵", exact: true })).toHaveValue("水灵");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await intro.reload();
  await expect(intro).toHaveURL(/\/cn\/$/);
  await intro.close();
  await page.reload();
  await waitForAppReady(page);
  await page.getByRole("button", { name: "工具箱", exact: true }).click();
  await expect(menu.getByRole("region", { name: "插件工具", exact: true })).toHaveCount(0);
});

test("CN web plugin rejects independent URLs including index and query variants", async ({ page }) => {
  for (const suffix of ["", "/", "/index.html", "/?unlocked=1#龙骑士"]) {
    await page.goto(`/plugins/wild-spirit-detector${suffix}`);
    // Vite serves the calculator fallback for extensionless paths without a slash.
    // EdgeOne may normalize the slash first; both must land on the calculator.
    if (suffix === "") await waitForAppReady(page);
    else await expect(page).toHaveURL(/\/cn\/$/);
    await expect(page.getByRole("heading", { name: "野生精灵检测器", exact: true })).toHaveCount(0);
  }
});

for (const path of ["/global/zh-CN/", "/en/"]) {
  test(`CN web plugin stays absent from Global toolbox ${path}`, async ({ page }) => {
    await resetUiuxStorage(page);
    await page.goto(path);
    await expect(page.locator(".loading-state")).toHaveCount(0);
    const toolbox = page.locator(".toolbox-trigger");
    await expect(toolbox).toBeEnabled();
    await toolbox.click();
    const menu = page.locator("#toolbox-panel");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("region", { name: "插件工具", exact: true })).toHaveCount(0);
    await expect(menu.locator('a[href="/plugins/wild-spirit-detector/"]')).toHaveCount(0);
  });
}

test("utility dialogs keep keyboard focus 320", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  for (const [entry, name] of [["获取应用", "获取应用"], ["导入导出", "配置库导入导出"]]) {
    await openMenuItem(page, entry);
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    if (name === "获取应用") {
      const close = dialog.getByRole("button", { name: "关闭获取应用", exact: true });
      await expect(close).toBeInViewport();
      const label = dialog.getByText("微信小程序", { exact: true });
      const lineCount = await label.evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      });
      expect(lineCount).toBe(1);
    }
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "打开菜单", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  }
});

test("application access bottom close stays reachable in a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/");
  await openMenuItem(page, "获取应用");
  const dialog = page.getByRole("dialog", { name: "获取应用", exact: true });
  const bottomClose = dialog.getByRole("button", { name: "关闭", exact: true });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 800);
  await expect(bottomClose).toBeInViewport({ ratio: 1 });
  await bottomClose.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "打开菜单", exact: true })).toBeFocused();

  await openMenuItem(page, "获取应用");
  await expect(dialog.getByRole("button", { name: "关闭获取应用", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(bottomClose).toBeFocused();
  await expect(bottomClose).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "打开菜单", exact: true })).toBeFocused();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  });
});

// 并行负载下首屏数据就绪会触发头部重渲染,单次点击可能落在被替换的旧节点上,
// 菜单因此不开;重试直到目标菜单项可见,断言本身不变。
async function openMenuItem(page, name) {
  await expect(async () => {
    await page.getByRole("button", { name: "打开菜单" }).click();
    await expect(page.getByRole("button", { name })).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name }).click();
}

test("keeps the concise about summary centered in a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1424, height: 861 });
  await page.goto("/");
  await openMenuItem(page, "关于与来源");

  const dialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - 1424 / 2)).toBeLessThanOrEqual(1);

  await expect(dialog.getByText(latestRelease.version)).toBeVisible();
  await expect(dialog.getByText(latestRelease.title)).toBeVisible();
  for (const highlight of latestRelease.summaryHighlights ?? latestRelease.highlights.slice(0, 3)) {
    await expect(dialog.getByText(highlight)).toBeVisible();
  }
  await expect(dialog.getByText("QQ 1215583051")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "BWIKI 署名与许可" }))
    .toContainText("资料授权");
  await expect(dialog.getByText("来源数据经结构化、校验及补充", { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "CC BY-NC-SA 4.0" }))
    .toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans",
    );
  await expect(dialog.getByText("规则校验")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "诛仙剑下伤心花" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "查看完整许可" }).click();
  const licenseDialog = page.getByRole("dialog", { name: "署名与许可" });
  await expect(licenseDialog).toContainText("来源数据经结构化、校验及补充");
  await expect(licenseDialog).toContainText("代码适用 MIT");
  await expect(licenseDialog.getByRole("link", { name: "洛克王国：世界 BWIKI" }))
    .toHaveAttribute("href", "https://wiki.biligame.com/nrc/");
  await licenseDialog.getByRole("button", { name: "返回关于与来源" }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "查看问题反馈" }).click();
  const feedbackDialog = page.getByRole("dialog", { name: "问题反馈" });
  await expect(feedbackDialog.getByRole("link", { name: "诛仙剑下伤心花" })).toHaveAttribute(
    "href",
    "https://space.bilibili.com/9281359?spm_id_from=333.1007.0.0",
  );
  await expect(feedbackDialog.getByRole("link", { name: "1215583051@qq.com" })).toHaveAttribute(
    "href",
    "mailto:1215583051@qq.com",
  );
});

test("keeps application access and about dialogs inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await openMenuItem(page, "获取应用");
  const accessDialog = page.getByRole("dialog", { name: "获取应用" });
  await expect(accessDialog).toBeVisible();
  await expect(accessDialog.getByRole("link", { name: "GitHub 项目主页" })).toHaveCount(0);
  await expect(accessDialog.getByRole("link", { name: "获取 Windows 电脑版" }))
    .toHaveAttribute(
      "href",
      "https://github.com/Evenstar-tools/roco-calculator/releases/latest",
    );
  expect(await accessDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await accessDialog.getByRole("button", { name: "关闭获取应用" }).click();

  await openMenuItem(page, "关于与来源");
  const aboutDialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(aboutDialog).toBeVisible();
  expect(await aboutDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("opens acknowledgements without overflowing a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openMenuItem(page, "关于与来源");

  const aboutDialog = page.getByRole("dialog", { name: "关于与来源" });
  const acknowledgementsButton = aboutDialog.getByRole("button", { name: "查看鸣谢" });
  const disclaimerButton = aboutDialog.getByRole("button", { name: "查看免责声明" });
  const [acknowledgementsBox, disclaimerBox] = await Promise.all([
    acknowledgementsButton.boundingBox(),
    disclaimerButton.boundingBox(),
  ]);
  expect(acknowledgementsBox).not.toBeNull();
  expect(disclaimerBox).not.toBeNull();
  expect(Math.abs(acknowledgementsBox.width - disclaimerBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(acknowledgementsBox.height - disclaimerBox.height)).toBeLessThanOrEqual(1);

  await acknowledgementsButton.click();

  const acknowledgementsDialog = page.getByRole("dialog", { name: "鸣谢" });
  await expect(acknowledgementsDialog).toBeVisible();
  await expect(acknowledgementsDialog.getByRole("link", { name: "夜降__" }))
    .toHaveAttribute("href", "https://space.bilibili.com/80872");
  await expect(acknowledgementsDialog.getByRole("link", { name: "洛克王国 PVP 伤害计算器" }))
    .toHaveAttribute("href", "https://lovepvp.top/");
  expect(await acknowledgementsDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("keeps the three about actions usable at 320px wide", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await openMenuItem(page, "关于与来源");

  const aboutDialog = page.getByRole("dialog", { name: "关于与来源" });
  await expect(aboutDialog.getByRole("button", { name: "查看鸣谢" })).toBeVisible();
  expect(await aboutDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await aboutDialog.getByRole("button", { name: "查看鸣谢" }).click();
  const acknowledgementsDialog = page.getByRole("dialog", { name: "鸣谢" });
  await expect(acknowledgementsDialog.getByRole("button", { name: "关闭鸣谢" }))
    .toBeVisible();
  expect(await acknowledgementsDialog.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
});
