import { readFileSync, mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const output = "artifacts/web-speed-fusion-20260919";
mkdirSync(output, { recursive: true });
const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const spirit = snapshot.spirits.find(entry => entry.fullName === "音速犬");
const member = {
  spiritId: spirit.id, natureId: "neutral", skills: { four: [], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
};

for (const width of [320, 390, 1440, 3840]) for (const theme of ["light", "dark"]) {
  test(`融合速度轴与标题 ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: width >= 3840 ? 2160 : width >= 1440 ? 1000 : 844 });
    await page.addInitScript(m => {
      localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
      localStorage.setItem("rock-calculator.teams.v1", JSON.stringify({ schemaVersion: 1, activeTeamId: "fusion", teams: [{
        id: "fusion", name: "速度线验收", createdAt: "2026-09-19", updatedAt: "2026-09-19", members: [m, null, null, null, null, null],
      }] }));
    }, member);
    await page.goto("/");
    await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: "切换主题", exact: true }).click();
    if (width < 760) {
      const title = page.locator(".app-header__title-short");
      await expect(title).toHaveText("S4「月涌狂想」");
      expect(await title.evaluate(node => {
        const text = node.getBoundingClientRect(), host = node.closest("h1").getBoundingClientRect();
        return text.left >= host.left - 1 && text.right <= host.right + 1;
      })).toBe(true);
      await page.locator(".app-header").screenshot({ path: `${output}/header-${width}-${theme}.png` });
    }
    await page.getByRole("button", { name: "打开队伍", exact: true }).click();
    await page.getByRole("dialog", { name: "队伍", exact: true }).getByRole("button", { name: "能力分析", exact: true }).click();
    const rail = page.getByRole("region", { name: "速度排行榜横轴" });
    const speed = page.getByRole("region", { name: "速度目标", exact: true });
    await expect(rail).toBeVisible();
    const savedSummary = await page.getByRole("region", { name: "已保存配置摘要" }).textContent();
    await expect(rail.locator(".is-current img")).toHaveAttribute("src", spirit.asset.localUrl);
    expect(await rail.evaluate(node => {
      const self = getComputedStyle(node.querySelector(".is-current"), "::after");
      const target = getComputedStyle(node.querySelector(".is-target"), "::after");
      return self.backgroundColor !== target.backgroundColor && target.boxShadow !== "none";
    })).toBe(true);
    await expect(page.locator(".ability-manual")).not.toHaveAttribute("open");
    await expect(page.locator(".ability-speed__comparison")).toContainText("当前 192 / 目标 192 · 同速需拼速");
    await expect.poll(() => rail.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return [...node.querySelectorAll(".is-current, .is-target")].every(marker => {
        const rect = marker.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right;
      });
    })).toBe(true);
    const geometry = await page.locator(".ability-workbench[role=region]").evaluate(node => {
      const bounds = selector => node.querySelector(selector).getBoundingClientRect();
      const rail = bounds(".ability-speed__viewport");
      const card = bounds(".ability-speed");
      const cards = [...node.querySelectorAll(".ability-build-card")].map(n => n.getBoundingClientRect());
      return { railWidth: rail.width, cardWidth: card.width, cardsSameRow: cards.every(r => Math.abs(r.top - cards[0].top) < 1),
        sequence: bounds(".ability-current-summary").bottom <= card.top && card.bottom <= bounds(".ability-manual").top && bounds(".ability-manual").bottom <= bounds(".ability-builds").top };
    });
    expect(geometry.railWidth).toBeGreaterThan(geometry.cardWidth - 4);
    expect(geometry.sequence).toBe(true);
    expect(geometry.cardsSameRow).toBe(width >= 1440);
    if (width >= 1440) await page.screenshot({ path: `${output}/actual-${width}-${theme}.png`, fullPage: true });
    else {
      await speed.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/actual-${width}-${theme}.png`, fullPage: true });
    }
    await rail.getByRole("listitem", { name: "选择速度目标布克棱岩，速度194", exact: true }).click();
    await expect(page.locator(".ability-speed__comparison")).toContainText("目标 194 · 无法先手");
    const beforeDrag = await rail.evaluate(node => node.scrollLeft);
    const bounds = await rail.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 4);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + 4, { steps: 5 });
    await page.mouse.up();
    expect(await rail.evaluate(node => node.scrollLeft)).toBeLessThan(beforeDrag - 60);
    await expect(page.locator(".ability-speed__comparison")).toContainText("目标 194 · 无法先手");
    await rail.focus();
    const beforeKey = await rail.evaluate(node => node.scrollLeft);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => rail.evaluate(node => node.scrollLeft)).toBeLessThan(beforeKey - 100);
    const keyboardTarget = rail.getByRole("listitem", { name: "选择速度目标白发路路，速度198", exact: true });
    await keyboardTarget.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".ability-speed__comparison")).toContainText("目标 198 · 无法先手");
    await page.getByText("手动微调", { exact: true }).click();
    await expect(page.getByLabel("能力分析性格")).toBeVisible();
    await page.getByLabel("能力分析性格").selectOption("silent");
    await page.getByText("手动微调", { exact: true }).click();
    await expect(page.locator(".ability-manual")).not.toHaveAttribute("open");
    await expect(page.locator(".ability-manual > summary")).toContainText("沉默");
    await expect(page.locator(".ability-draft-status")).toHaveText("试算草稿 · 尚未应用到成员");
    await expect(rail.locator(".is-current")).toContainText("试算配置");
    await expect(page.locator(".ability-speed__comparison")).toContainText("试算 192");
    await expect(page.getByRole("region", { name: "已保存配置摘要" })).toHaveText(savedSummary);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rock-calculator.teams.v1")).teams[0].members[0].natureId)).toBe("neutral");
    const input = page.getByRole("combobox", { name: "速度目标精灵" });
    await input.fill("音速犬");
    await page.getByRole("option", { name: "选择音速犬 260 极速", exact: true }).click();
    await expect(page.locator(".ability-speed__comparison")).toContainText("无法先手");
    await input.fill("女王蜂");
    await page.getByRole("option", { name: "选择女王蜂 104 无速度", exact: true }).click();
    await expect(page.locator(".ability-speed__comparison")).toContainText("可以先手");
    await page.getByRole("button", { name: /速度一览/ }).click();
    await expect(page.getByRole("region", { name: "速度一览", exact: true })).toBeVisible();
    await expect(page.locator(".ability-speed-overview__selection")).toContainText("试算配置 192");
    await page.getByRole("button", { name: "返回能力分析", exact: true }).click();
    await expect(rail).toBeVisible();
    expect(await page.getByRole("dialog", { name: "队伍", exact: true }).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
