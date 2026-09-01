import { expect, test } from "@playwright/test";
import {
  openDetailedMode,
  selectDefaultSpirits,
  selectSpirit,
  resetUiuxStorage,
} from "./helpers/uiux-helpers.js";

test.beforeEach(async ({ page }) => {
  await resetUiuxStorage(page);
});

test("keeps Dazzling's seven slots readable and exposes Refraction effects", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "彩虹独角兽");
  await selectSpirit(page, "防御方", "水灵");

  const compactSeventh = page.getByRole("combobox", { name: "攻击方技能7" });
  await expect(compactSeventh).toBeVisible();
  expect(
    await page.locator(".compact-skill-side--attacker .compact-skill__row")
      .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth)),
  ).toBe(true);

  await expect(page.locator(".compact-skill__effect-hint")).toContainText(
    "普·威力+10",
  );

  await page.getByRole("button", { name: "具体版" }).click();
  await expect(page.getByRole("combobox", { name: "攻击方技能7" })).toBeVisible();
  const hint = page.locator(".skill-slot__effect-hint");
  await expect(hint).toContainText("普·威力+10");
  expect(await hint.evaluate((node) => getComputedStyle(node).webkitLineClamp))
    .toBe("2");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  await page.setViewportSize({ height: 844, width: 390 });
  const mobileSeventh = page.getByRole("combobox", { name: "攻击方技能7" });
  await mobileSeventh.scrollIntoViewIfNeeded();
  await expect(mobileSeventh).toBeVisible();
  expect(
    await page.locator(".four-skill-side--attacker .skill-slot-group")
      .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth)),
  ).toBe(true);
  const lastSlotBox = await mobileSeventh.boundingBox();
  const resultBarBox = await page.getByRole("button", {
    name: "展开伤害结果",
  }).boundingBox();
  expect(lastSlotBox.y + lastSlotBox.height).toBeLessThanOrEqual(resultBarBox.y);
});

test("applies and explains Beast Flower bloodlines without retaining the battle trigger", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "兽花蕾");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("透射");
  await page.getByRole("option", { name: /透射/ }).click();
  const bloodline = page.getByRole("combobox", { name: "血脉" });
  await bloodline.selectOption("normal");
  await page.getByRole("checkbox", { name: "入场已触发" }).check();

  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "普通血脉｜技能威力 +40",
  );

  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "攻击方", "兽花蕾");
  await expect(page.getByRole("combobox", { name: "血脉" })).toHaveValue("normal");
  await expect(page.getByRole("checkbox", { name: "入场已触发" })).not.toBeChecked();
});

test("applies and remembers Meteor Bug contract ball effects", async ({ page }) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "陨星虫");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("啃咬");
  await page.getByRole("option", { name: /啃咬/ }).click();
  const ball = page.getByRole("combobox", { name: "咕噜球" });
  await ball.selectOption("beautiful");
  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "美妙球｜对方双攻 -30% · 威力 +20",
  );

  await ball.selectOption("prism");
  const prism = page.getByRole("combobox", { name: "棱镜效果" });
  await expect(prism).toBeVisible();
  await prism.selectOption("darkstar");
  await expect(page.getByRole("region", { name: "特性结算" })).toContainText(
    "棱镜球（暗星球半值）",
  );

  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "攻击方", "陨星虫");
  await expect(page.getByRole("combobox", { name: "咕噜球" })).toHaveValue("prism");
  await expect(page.getByRole("combobox", { name: "棱镜效果" })).toHaveValue("darkstar");
});

test("keeps Gal choice controls inside two-line four-skill rows at desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ height: 861, width: 1424 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "加尔");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const picker = page.getByRole("combobox", { name: "攻击方技能1" });
  await picker.fill("友谊满溢");
  await page
    .getByRole("option")
    .filter({ hasText: "友谊满溢" })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "攻击方技能1选择效果" })
    .selectOption("counter");
  await page.getByRole("checkbox", { name: "攻击方技能1触发应对" }).check();
  await page.getByRole("checkbox", { name: "攻击方技能1触发特性" }).check();

  const firstRow = page
    .locator(".four-skill-side")
    .first()
    .locator(".skill-slot-group")
    .first();
  const layout = await firstRow.evaluate((row) => {
    const context = row.querySelector(".skill-slot__context");
    const description = row.querySelector(".skill-slot__description");
    const styles = getComputedStyle(description);
    return {
      contextFits: context.scrollWidth <= context.clientWidth,
      descriptionHeight: description.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(styles.lineHeight),
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layout.contextFits).toBe(true);
  expect(layout.pageFits).toBe(true);
  expect(layout.descriptionHeight).toBeLessThanOrEqual(layout.lineHeight * 2 + 2);

  await expect(page.getByLabel("选择特性结算")).toContainText("仅第一段触发应对");
});

test("applies Wing Extension and combines Gale Turbine with one carried wing skill", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "凡鹰");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const first = page.getByRole("combobox", { name: "攻击方技能1" });
  await first.fill("先发制人");
  await page.getByRole("option").filter({ hasText: "先发制人" }).first().click();
  const turbine = page.getByRole("combobox", { name: "攻击方技能4" });
  await turbine.fill("疾风涡轮");
  await page.getByRole("option").filter({ hasText: "疾风涡轮" }).first().click();

  const firstRow = page.getByRole("group", { name: "攻击方技能1" });
  await expect(firstRow).toContainText("翼·物");
  const companion = page.getByRole("combobox", {
    name: "攻击方技能4前置翼技",
  });
  await companion.selectOption("1");
  await expect(page.getByLabel("选择特性结算")).toContainText("先发制人");
  await expect(page.getByLabel("选择特性结算")).toContainText("疾风涡轮");

  const turbineRow = page.getByRole("group", {
    name: "攻击方技能4，当前选中",
  });
  const layout = await turbineRow.evaluate((row) => ({
    pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    rowFits: row.scrollWidth <= row.clientWidth,
  }));
  expect(layout).toEqual({ pageFits: true, rowFits: true });
});

test("calculates Stone Lizard family's Skin Spikes as a selectable trait source", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  const attackerPicker = page.getByRole("combobox", { name: "攻击方精灵" });
  await attackerPicker.fill("石冠王蜥");
  await page.getByRole("option", { name: /^石冠王蜥\s/ }).click();
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const traitSource = page.getByRole("group", {
    name: "攻击方特性伤害刺肤",
  });
  await expect(traitSource).toBeVisible();
  await expect(traitSource).toContainText("无·特性");
  await expect(traitSource).toContainText("50");
  await expect(traitSource.getByTitle("固定特性伤害")).toContainText("刺肤");
  expect(await traitSource.evaluate((row) => row.scrollWidth <= row.clientWidth))
    .toBe(true);
  await traitSource.click();
  await expect(
    page.getByRole("group", {
      name: "攻击方特性伤害刺肤，当前选中",
    }),
  ).toBeVisible();

  const hitCount = page.getByRole("spinbutton", {
    name: "攻击方刺肤连击次数",
  });
  await hitCount.fill("3");
  await expect(hitCount).toHaveValue("3");
  await expect(page.getByText("特性", { exact: true })).toBeVisible();
  await expect(page.getByText("刺肤", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "精简版" }).click();
  const compactTraitSource = page.getByRole("group", {
    name: "攻击方特性伤害刺肤，当前选中",
  });
  await expect(compactTraitSource.getByTitle("固定特性伤害"))
    .toContainText("威力 50");
  expect(await compactTraitSource.evaluate((row) => row.scrollWidth <= row.clientWidth))
    .toBe(true);
});

test("keeps Dimo-family trait stacks synchronized in both damage directions", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "幻影荆棘");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const stackInputs = page.getByRole("spinbutton", { name: "触发层数" });
  await expect(stackInputs).toHaveCount(2);
  await expect(page.getByText("圣光迪莫 · 裁决", { exact: true })).toBeVisible();
  await stackInputs.first().fill("4");
  await expect(stackInputs.first()).toHaveValue("4");
  await expect(stackInputs.last()).toHaveValue("4");

  await page.reload();
  await selectSpirit(page, "攻击方", "幻影荆棘");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();
  const restoredInputs = page.getByRole("spinbutton", { name: "触发层数" });
  await expect(restoredInputs.first()).toHaveValue("4");
  await expect(restoredInputs.last()).toHaveValue("4");
});

test("derives Comet power from one shared, editable current-HP value", async ({
  page,
}) => {
  await page.setViewportSize({ height: 945, width: 1536 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "黑猫密探");
  await selectSpirit(page, "防御方", "圣光迪莫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const skill = page.getByRole("combobox", { name: "攻击方技能1" });
  await skill.fill("彗星");
  await page
    .getByRole("option")
    .filter({ hasText: "彗星" })
    .first()
    .click();

  const percent = page.getByRole("spinbutton", {
    name: "攻击方生命百分比",
  });
  await expect(percent).toHaveValue("100");
  await percent.fill("50");
  await expect(
    page.getByRole("spinbutton", { name: "攻击方技能1静态威力" }),
  ).toHaveValue("140");

  await page.getByRole("button", { name: "按当前值输入" }).click();
  const currentHp = page.getByRole("spinbutton", {
    name: "攻击方当前生命",
  });
  await expect(currentHp).toHaveValue("237");
  await expect(
    page.locator('output[aria-label^="攻击方彗星攻击圣光迪莫"]'),
  ).toHaveAttribute("data-status", "ready");
});

test("keeps a manual four-skill power value readable beside its restore control", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1424 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const power = page.getByRole("spinbutton", {
    name: "攻击方技能1静态威力",
  });
  await power.fill("123");
  await power.press("Enter");

  await expect(power).toHaveValue("123");
  const restore = page.getByRole("button", { name: "恢复自动威力" }).first();
  await expect(restore).toBeVisible();
  const [powerBox, restoreBox] = await Promise.all([
    power.boundingBox(),
    restore.boundingBox(),
  ]);
  expect(powerBox).not.toBeNull();
  expect(restoreBox).not.toBeNull();
  expect(powerBox.width).toBeGreaterThanOrEqual(32);
  expect(powerBox.x + powerBox.width).toBeLessThanOrEqual(restoreBox.x + 1);
});

test("recalculates current stacked and triggered traits without blocking results", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "徘徊爪爪");
  await selectSpirit(page, "防御方", "水灵");
  await openDetailedMode(page);

  const damage = page.getByTestId("primary-damage");
  const catBaseDamage = Number(await damage.textContent());
  await page.getByRole("spinbutton", { name: "完整选择次数" }).fill("2");
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeGreaterThan(catBaseDamage);
  await page.getByRole("spinbutton", { name: "每层物攻" }).fill("50");

  await selectSpirit(page, "攻击方", "烈火守护");
  const staticPower = page.getByRole("spinbutton", { name: "静态威力" });
  const guardianBasePower = Number(
    await staticPower.inputValue(),
  );
  const guardianBaseDamage = Number(await damage.textContent());
  await page
    .getByRole("spinbutton", { name: "己方火系技能次数" })
    .fill("3");
  await expect
    .poll(async () =>
      Number(await staticPower.inputValue()),
    )
    .toBe(guardianBasePower);
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeGreaterThan(guardianBaseDamage);

  await selectSpirit(page, "攻击方", "古卷执政官");
  const governorTrigger = page.getByRole("checkbox", {
    name: "入场时魔力为1",
  });
  const governorBaseDamage = Number(await damage.textContent());
  await governorTrigger.check();
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeGreaterThan(governorBaseDamage);

  await selectSpirit(page, "攻击方", "霜翼领主（春天的样子）");
  const skybreakerTrigger = page.getByRole("checkbox", {
    name: "先于敌方攻击",
  });
  await expect(skybreakerTrigger).not.toBeChecked();
  await skybreakerTrigger.check();
  await page.getByRole("spinbutton", { name: "触发加成" }).fill("90");
  await expect(page.getByTestId("primary-damage")).not.toHaveText("—");
});

test("applies editable Polarization reduction to matching carried skill types", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "音速犬");
  await selectSpirit(page, "防御方", "矿晶虫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const firstSkill = page.getByRole("combobox", { name: "攻击方技能1" });
  await firstSkill.fill("地刺");
  await page
    .getByRole("option", { name: /^地 地刺 / })
    .click();

  const reduction = page.getByRole("spinbutton", { name: "减伤比例" });
  const damage = page.getByTestId("primary-damage");
  await reduction.fill("20");
  const lightReductionDamage = Number(await damage.textContent());
  await reduction.fill("40");
  await expect
    .poll(async () => Number(await damage.textContent()))
    .toBeLessThan(lightReductionDamage);
});

test("persists single-skill state across reloads and isolates spirit switches", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto("/");
  await selectDefaultSpirits(page);
  await openDetailedMode(page);

  const skillPicker = page.getByRole("combobox", { name: "选择技能" });
  await skillPicker.fill("当头棒喝");
  await page.getByRole("option", { name: /当头棒喝/ }).click();
  await page
    .getByRole("checkbox", { name: "敌方本回合换精灵" })
    .check();
  await page
    .getByRole("spinbutton", { name: "静态威力" })
    .fill("137");
  await page.getByRole("spinbutton", { name: "静态威力" }).press("Enter");

  await page.reload();
  await selectDefaultSpirits(page);
  await openDetailedMode(page);
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "静态威力" }),
  ).toHaveValue("137");

  await selectSpirit(page, "攻击方", "水灵");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).not.toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "静态威力" }),
  ).not.toHaveValue("137");

  await selectSpirit(page, "攻击方", "音速犬");
  await expect(
    page.getByRole("combobox", { name: "选择技能" }),
  ).toHaveValue("当头棒喝");
  await expect(
    page.getByRole("checkbox", { name: "敌方本回合换精灵" }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "静态威力" }),
  ).toHaveValue("137");
});

test("uses negative-status skills once this turn, twice through next turn, and cancels on the third click", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "rock-calculator.settings.negative-status-settlement.v1",
      "1",
    );
  });
  await page.setViewportSize({ height: 900, width: 1424 });
  await page.goto("/");
  await selectSpirit(page, "攻击方", "燃薪虫");
  await selectSpirit(page, "防御方", "叶冕魔力猫");
  await openDetailedMode(page);
  await page.getByRole("tab", { name: "四技能" }).click();

  const picker = page.getByRole("combobox", { name: "攻击方技能2" });
  if ((await picker.inputValue()) !== "引燃") {
    await picker.fill("引燃");
    await page.getByRole("option", { name: /引燃/ }).click();
  }
  const row = picker.locator("xpath=ancestor::*[contains(@class,'skill-slot-group')]");
  const description = row.locator(".skill-slot__description");

  await description.click();
  let preview = page.getByRole("region", { name: "回合状态预估" });
  await expect(preview).toContainText("本回合");
  await expect(preview).toContainText("下回合");
  await expect(preview).toContainText("灼烧 ×10");
  await expect(preview.getByText("续用")).toHaveCount(0);

  await description.click();
  preview = page.getByRole("region", { name: "回合状态预估" });
  await expect(preview.getByText("续用")).toBeVisible();
  await expect(preview.locator(".result-rail__turn-row")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "负面状态结算" }))
    .not.toContainText("实际追加");
  await page.screenshot({
    fullPage: true,
    path: "artifacts/audit/negative-status-two-turn-1424.png",
  });

  await description.click();
  await expect(page.getByRole("region", { name: "回合状态预估" }))
    .toHaveCount(0);
});
