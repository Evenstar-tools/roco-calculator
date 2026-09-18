import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";

test.use({ serviceWorkers: "block" });
const runtime = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const bosses = runtime.spirits.filter(spirit => spirit.stage === "首领" && spirit.sourceCategory === "首领形态");
const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
const fixture = structuredClone(runtime);
for (const [index, name] of ["验收本体", "验收目标"].entries()) {
  const spirit = fixture.spirits.find(entry => entry.id === bosses[index].id);
  Object.assign(spirit, { fullName: name, baseName: name, traitIds: [], raceStats: { ...raceStats, speed: index ? 67 : 100 } });
}
const member = {
  spiritId: bosses[0].id, natureId: "timid", skills: { four: [null, null, null, null], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
};

for (const [width, theme] of [[1424, "light"], [390, "light"], [390, "dark"]]) {
  test(`final speed, explicit apply and ranking return ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/data/runtime.json", route => route.fulfill({ json: fixture }));
    await page.addInitScript(({ member }) => {
      localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
      localStorage.setItem("rock-calculator.teams.v1", JSON.stringify({
        schemaVersion: 1, activeTeamId: "phase1-e2e", teams: [{
          id: "phase1-e2e", name: "约束回归验收", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
          members: [member, null, null, null, null, null],
        }],
      }));
    }, { member });
    await page.goto("/");
    await page.getByRole("combobox", { name: "攻击方精灵", exact: true }).waitFor();
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.getByRole("button", { name: "打开队伍" }).click();
    const drawer = page.getByRole("dialog", { name: "队伍", exact: true });
    await drawer.getByRole("button", { name: "能力分析", exact: true }).click();
    const ability = drawer.getByRole("region", { name: "能力分析", exact: true });
    const builds = ability.getByRole("region", { name: "耐久方案对比" });
    await expect(ability.getByRole("region", { name: "当前配置摘要" })).toContainText("194");
    await expect(builds.getByRole("button", { name: "应用到成员" })).toHaveCount(0);
    await expect(builds.getByText("当前锁定条件下没有合法方案。", { exact: true })).toHaveCount(3);

    const input = ability.getByRole("combobox", { name: "速度目标精灵" });
    await input.fill("验收目标");
    await ability.locator(`[role="option"][data-target-id="positive-max:${bosses[1].id}"]`).click();
    await ability.getByLabel("推荐速度约束").selectOption("at-least");
    await expect(builds.getByRole("button", { name: "应用到成员" })).toHaveCount(3);
    for (const card of await builds.getByRole("article").all()) await expect(card.locator("dd").first()).toHaveText("203");
    const readMember = () => page.evaluate(() => JSON.parse(localStorage.getItem("rock-calculator.teams.v1")).teams[0].members[0]);
    expect((await readMember()).natureId).toBe("timid");
    await builds.getByRole("button", { name: "应用到成员" }).first().click();
    await expect(ability.getByRole("status")).toContainText("方案已应用到成员");
    const saved = await readMember();
    expect(saved.natureId).toBe("silent");
    expect(saved.displayIvs.speed).toBe(60);
    expect(Object.values(saved.displayIvs).filter(Boolean)).toHaveLength(3);
    const actual = calculateAllPanelStats({ raceStats, displayIvs: saved.displayIvs, natureMultipliers: getNatureMultipliers(saved.natureId) });
    expect(actual.speed).toBe(203);
    await builds.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/analysis-phase1/acceptance-${width}-${theme}.png`, fullPage: false });
    await ability.getByRole("button", { name: "查看完整耐久榜" }).click();
    const ranking = drawer.getByRole("region", { name: "完整耐久榜" });
    await expect(ranking).toBeVisible();
    await ranking.getByLabel("搜索耐久榜精灵").fill("验收本体");
    await expect(ranking.locator("tbody tr")).toHaveCount(1);
    await ranking.getByRole("button", { name: "返回能力分析" }).click();
    await expect(ability).toBeVisible();
    expect(await drawer.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
