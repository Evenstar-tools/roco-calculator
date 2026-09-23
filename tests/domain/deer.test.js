import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { calculateNegativeStatusSettlement } from "../../src/domain/negative-status.js";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { canonicalTraitControlKey } from "../../src/state/trait-values.js";
import { DEER_VARIANTS, DEFENSE_TEMPLATES, applyDeerPreset, buildDeerInput, calculateDeerRow, calculateDeerRows, calculateDeerSummaryRows, createDeerSetup, evaluateDeerAttack, findDeerThresholds, getDeerSpeedComparison, hasDeerDefenseTrait } from "../../src/features/deer/deer-model.js";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const variant = (id) => DEER_VARIANTS.find((row) => row.id === id);
const evaluate = (setup, id, stacks = 1) => evaluateDeerAttack(snapshot, setup, variant(id), stacks);

describe("电鹿斩杀线", () => {
  test("逐层阈值必须找首次命中，不能依赖伤害单调或扫描到99层后才停止", () => {
    const checks = [];
    const states = [
      { lethal: false, comboLethal: false },
      { lethal: false, comboLethal: true },
      { lethal: true, comboLethal: false },
      { lethal: false, comboLethal: false },
      { lethal: true, comboLethal: true },
    ];
    const found = findDeerThresholds(99, (stacks) => {
      checks.push(stacks);
      return { stacks, ...states[stacks] };
    }, true);
    expect(found).toEqual({ minimum: 2, comboMinimum: 1 });
    expect(checks).toEqual([0, 1, 2]);
  });

  test("折叠表格的当前结果和两个最低层数与完整逐层计算一致，展开时才需要完整明细", () => {
    const cases = [
      createDeerSetup(snapshot),
      { ...createDeerSetup(snapshot), showFollowup: false },
      { ...createDeerSetup(snapshot), showFollowup: true, stacks: 120 },
      { ...createDeerSetup(snapshot), showFollowup: true },
    ];
    cases[3].state.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === "圣草迪莫").id;
    for (const setup of cases) {
      const before = JSON.stringify(setup);
      const full = calculateDeerRows(snapshot, setup);
      const summary = calculateDeerSummaryRows(snapshot, setup);
      expect(summary).toHaveLength(full.length);
      for (let i = 0; i < full.length; i++) {
        expect(summary[i]).toMatchObject({
          id: full[i].id,
          label: full[i].label,
          minimum: full[i].minimum,
          comboMinimum: full[i].comboMinimum,
          current: full[i].current,
        });
        expect(summary[i]).not.toHaveProperty("byStack");
      }
      expect(calculateDeerRow(snapshot, setup, summary[0]).byStack).toEqual(full[0].byStack);
      expect(JSON.stringify(setup)).toBe(before);
    }
  }, 60_000);
  test.each(["银月狼王", "圣水迪莫", "蹦床松鼠", "波普鹿"])("通电对%s只追加一次两层引电，遵循克制与电系免疫", (name) => {
    const setup = createDeerSetup(snapshot);
    const defender = snapshot.spirits.find((entry) => entry.fullName === name);
    setup.state.sides.defender.spiritId = defender.id;
    setup.dischargeElectrified = true;
    const before = JSON.stringify(setup);
    const entry = evaluate(setup, "discharge", 1);
    const status = calculateNegativeStatusSettlement({ enabled: true, statuses: { electrified: 2 }, defender: { maxHp: entry.maxHp, currentHp: entry.maxHp, types: defender.types }, typeChart: snapshot.typeChart }).breakdown.find((item) => item.id === "electrified");
    expect(entry.electrified).toEqual(status);
    expect(entry.damage).toBe(entry.first.totalDamage + status.damage);
    expect(entry.percent).toBeCloseTo(entry.damage / entry.maxHp * 100);
    expect(entry.electrified.triggerCount).toBe(name === "波普鹿" ? 0 : 1);
    expect(evaluate(setup, "discharge", 10).electrified.damage).toBe(status.damage);
    expect(evaluate(setup, "arc", 1).electrified).toBeNull();
    expect(JSON.stringify(setup)).toBe(before);
    setup.dischargeElectrified = false;
    expect(evaluate(setup, "discharge", 1).damage).toBe(entry.first.totalDamage);
  });

  test("通电勾选不累加带入异常和雷暴，补刀前扣除合计伤害且不再次触发引电", () => {
    const setup = createDeerSetup(snapshot);
    setup.dischargeElectrified = true;
    const clean = evaluate(setup, "discharge", 0);
    setup.state.negativeStatuses.defender = { burn: 8, poison: 8, parasitism: 8, electrified: 2, freeze: 0 };
    setup.weather = "thunder";
    const entry = evaluate(setup, "discharge", 0);
    expect(entry.electrified.damage).toBe(clean.electrified.damage);
    expect(entry.electrified.triggerCount).toBe(1);
    expect(entry.nextState.negativeStatuses.defender.electrified).toBe(0);
    expect(entry.nextState.directions.forward.currentHp).toBe(entry.targetHp - entry.damage);
    expect(entry.comboDamage).toBe(entry.damage + entry.followup.totalDamage);
    expect(entry.followup.totalDamage).toBe(calculateMatchup(snapshot, entry.nextState).forward.results[0].totalDamage);
  });

  test("通电合计参与冻结斩杀、逐层推荐，保命未支持仍待确认", () => {
    const setup = createDeerSetup(snapshot);
    const base = evaluate(setup, "discharge", 0);
    setup.dischargeElectrified = true;
    setup.freeze = 4;
    const entry = evaluate(setup, "discharge", 0);
    expect(entry.damage).toBe(base.damage + entry.electrified.damage);
    expect(entry.lethal).toBe(entry.damage + entry.freeze.thresholdHp >= entry.targetHp);
    const row = calculateDeerRows(snapshot, setup).find((item) => item.id === "discharge");
    expect(row.condition).toBe("含一次引电");
    expect(row.minimum).toBe(row.byStack.find((item) => item.damage + item.freeze.thresholdHp >= item.targetHp)?.stacks ?? null);
    setup.state.sides.defender.spiritId = snapshot.spirits.find((item) => item.fullName === "火羽").id;
    const protectedEntry = evaluate(setup, "discharge", 10);
    expect(protectedEntry.damage).toBeGreaterThan(0);
    expect(protectedEntry.lethalKnown).toBe(false);
    expect(protectedEntry.comboLethal).toBe(false);
  });

  test.each([["满月砣（下弦的样子）", false], ["满月砣（上弦的样子）", false], ["波普鹿", false], ["秩序鱿墨", true], ["圣草迪莫", true], ["蹦床松鼠", true], ["火羽", true], ["化蝶（平常的样子）", true], ["银月狼王", true]])("%s防守特性显隐不依赖当前开关或零层", (name, visible) => {
    const side = createDeerSetup(snapshot).state.sides.defender;
    side.spiritId = snapshot.spirits.find((entry) => entry.fullName === name).id;
    expect(hasDeerDefenseTrait(snapshot, side)).toBe(visible);
    side.ignoreTraits = true;
    expect(hasDeerDefenseTrait(snapshot, side)).toBe(visible);
  });

  test("绝对秩序仅削减非攻击方系别伤害，八候选与先发逐击沿用内核", () => {
    const setup = createDeerSetup(snapshot);
    setup.state.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === "秩序鱿墨").id;
    setup.stacks = 1;
    const enabled = calculateDeerRows(snapshot, setup);
    setup.state.sides.defender.ignoreTraits = true;
    const disabled = calculateDeerRows(snapshot, setup);
    for (let i = 0; i < enabled.length; i++) {
      const reduced = enabled[i].current;
      const normal = disabled[i].current;
      if (["arc", "burst", "discharge"].includes(enabled[i].id)) expect(reduced.damage).toBe(normal.damage);
      else expect(Math.abs(reduced.damage - normal.damage * 0.5)).toBeLessThanOrEqual(1);
      if (enabled[i].id !== "first") {
        expect(reduced.followup).not.toBeNull();
        expect(reduced.followup.formulaSteps.some((step) => String(step.label).includes("绝对秩序"))).toBe(true);
      }
    }
  });

  test.each(["火羽", "化蝶（平常的样子）"])("%s保命未支持时不输出确定斩杀，关闭特性恢复理论结论", (name) => {
    const setup = createDeerSetup(snapshot);
    setup.state.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === name).id;
    setup.freeze = 4;
    const before = JSON.stringify(setup);
    const rows = calculateDeerRows(snapshot, setup);
    for (const row of rows) {
      expect(row.minimum).toBeNull();
      expect(row.comboMinimum).toBeNull();
      expect(row.byStack.every((entry) => !entry.lethalKnown && !entry.lethal && !entry.comboLethal && entry.remainingHp === null)).toBe(true);
      expect(row.byStack.every((entry) => entry.followup === null)).toBe(true);
    }
    expect(JSON.stringify(setup)).toBe(before);
    setup.state.sides.defender.ignoreTraits = true;
    expect(evaluate(setup, "bet-light", 10).lethalKnown).toBe(true);
    expect(evaluate(setup, "bet-light", 10).lethal).toBe(true);
  });

  test("银月狼王吞噬保命特性也阻止确定斩杀推荐", () => {
    const setup = createDeerSetup(snapshot);
    setup.state.sides.defender.acquiredTraitIds = [snapshot.traits.find((entry) => entry.name === "不死鸟").id];
    expect(evaluate(setup, "bet-light", 10).lethalKnown).toBe(false);
    setup.state.sides.defender.acquiredTraitIds = [];
    expect(evaluate(setup, "bet-light", 10).lethalKnown).toBe(true);
  });

  test("耐久模板保留原特性参数，完整预设按指定参数更新", () => {
    const side = createDeerSetup(snapshot).state.sides.defender;
    side.traitValues = { custom: 5 };
    for (const template of DEFENSE_TEMPLATES) expect(applyDeerPreset(side, template).traitValues).toEqual({ custom: 5 });
    expect(applyDeerPreset(side, { ...DEFENSE_TEMPLATES[0], traitValues: {} }).traitValues).toEqual({});
  });

  test("只覆盖查询层数，保留自定义加成和方向覆盖优先级", () => {
    const setup = createDeerSetup(snapshot);
    const spirit = snapshot.spirits.find((entry) => entry.id === setup.state.sides.attacker.spiritId);
    const control = getTraitView(snapshot, spirit, "attacker").inputs.find((entry) => entry.contextKey === "attackerTraitEffect");
    const baseline = evaluate(setup, "arc", 3).damage;
    setup.state.sides.attacker.traitValues[canonicalTraitControlKey(control)] = 55;
    const input = buildDeerInput(snapshot, setup, variant("arc"), 3);
    expect(input.directions.forward.context[control.id]).toBe(55);
    expect(evaluate(setup, "arc", 3).damage).toBeGreaterThan(baseline);
    setup.state.directions.forward.context[control.id] = 65;
    expect(buildDeerInput(snapshot, setup, variant("arc"), 3).directions.forward.context[control.id]).toBe(65);
    setup.state.marks.defender.negative = { id: "slow", stacks: 3 };
    expect(buildDeerInput(snapshot, setup, variant("arc"), 3).marks.defender.negative).toEqual({ id: "slow", stacks: 3 });
    setup.starfall = 2;
    expect(buildDeerInput(snapshot, setup, variant("arc"), 3).marks.defender.negative).toEqual({ id: "starfall", stacks: 2 });
    setup.state.marks.defender.negative = { id: "starfall", stacks: 2 };
    setup.starfall = 0;
    expect(buildDeerInput(snapshot, setup, variant("arc"), 3).marks.defender.negative).toEqual({ id: "none", stacks: 0 });
  });

  test.each([[201, 200, "可以先手"], [200, 200, "需要拼速"], [199, 200, "无法先手"]])("速度%s对%s提示%s", (attacker, defender, label) => {
    const calculation = {
      forward: { results: [{ combatPanel: { attacker: { speed: attacker }, defender: { speed: 999 } } }] },
      reverse: { results: [{ combatPanel: { attacker: { speed: defender } } }] },
    };
    expect(getDeerSpeedComparison(calculation)).toMatchObject({ attacker, defender, label });
  });

  test("缺少速度数据不能误判为同速", () => {
    expect(getDeerSpeedComparison({}).label).toBe("速度待确认");
  });

  test("速度复用双方内核战斗面板，包含特性、开关和减速印记", () => {
    const setup = createDeerSetup(snapshot);
    const spirit = snapshot.spirits.find((entry) => entry.fullName === "圣草迪莫");
    setup.state.sides.defender.spiritId = spirit.id;
    const control = getTraitView(snapshot, spirit, "defender").inputs.find((input) => input.contextKey.includes("Stacks"));
    setup.state.sides.defender.traitValues[canonicalTraitControlKey(control)] = 4;
    const boosted = evaluate(setup, "arc").speed;
    setup.state.sides.defender.ignoreTraits = true;
    const plain = evaluate(setup, "arc").speed;
    expect(boosted.defender).toBeGreaterThan(plain.defender);
    setup.state.marks.defender.negative = { id: "slow", stacks: 3 };
    expect(evaluate(setup, "arc").speed.defender).toBe(plain.defender - 30);
    setup.state.directions.reverse.overrides.attackerSpeedFlat = 15;
    expect(evaluate(setup, "arc").speed.defender).toBe(plain.defender - 15);
  });

  test("主页当前配置带入电鹿页，不套模板或修改来源", () => {
    const source = createDeerSetup(snapshot).state;
    source.sides.defender.nature = "neutral";
    source.sides.defender.displayIvs.hp = 42;
    source.sides.defender.ignoreTraits = true;
    source.directions.forward.currentHp = 123;
    source.directions.forward.context.weatherBlizzard = true;
    source.directions.forward.overrides.defenseLevelStage = 3;
    source.negativeStatuses.defender.freeze = 4;
    source.marks.defender.negative = { id: "starfall", stacks: 2 };
    source.directions.forward.reduction = .7;
    const before = JSON.stringify(source);
    const setup = createDeerSetup(snapshot, source);
    expect(setup.state.sides).toEqual(source.sides);
    expect(setup.defenseTemplate).toBe("current");
    expect(setup.weather).toBe("blizzard");
    expect(setup.freeze).toBe(4);
    expect(setup.starfall).toBe(2);
    expect(setup.reduction).toBeCloseTo(30);
    const input = buildDeerInput(snapshot, setup, variant("arc"), 0);
    expect(input.directions.forward.currentHp).toBe(123);
    expect(input.directions.forward.overrides.defenseLevelStage).toBe(3);
    expect(JSON.stringify(source)).toBe(before);
  });
  test("九行与逐层结果直接使用主计算内核，不修改输入", () => {
    const setup = createDeerSetup(snapshot);
    const before = JSON.stringify(setup);
    const rows = calculateDeerRows(snapshot, setup);
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(row.byStack.length).toBeGreaterThan(setup.stacks);
      expect(row.byStack[setup.stacks]).toBeTruthy();
      for (const result of row.byStack) {
        const direct = calculateMatchup(snapshot, buildDeerInput(snapshot, setup, row, result.stacks)).forward.results[0];
        expect(result.damage).toBe(direct.totalDamage);
      }
      if (row.minimum !== null) {
        expect(row.byStack[row.minimum].lethal).toBe(true);
        expect(row.byStack.slice(0, row.minimum).every((entry) => !entry.lethal)).toBe(true);
      }
    }
    expect(JSON.stringify(setup)).toBe(before);
  });

  test("首领与非首领使用各自种族值及40%/30%特性", () => {
    const boss = createDeerSetup(snapshot);
    const regular = structuredClone(boss);
    regular.state.sides.attacker.spiritId = snapshot.spirits.find((spirit) => spirit.fullName === "爵士鹿").id;
    expect(evaluate(boss, "light", 5).damage).toBeGreaterThan(evaluate(regular, "light", 5).damage);
    expect(evaluate(boss, "light", 1).damage).toBeGreaterThan(evaluate(boss, "light", 0).damage);
  });

  test("入口携带首领与非首领手填的特性层数", () => {
    for (const name of ["波普鹿", "爵士鹿"]) {
      const source = createDeerSetup(snapshot).state;
      const spirit = snapshot.spirits.find((entry) => entry.fullName === name);
      source.sides.attacker.spiritId = spirit.id;
      const control = getTraitView(snapshot, spirit).inputs.find((entry) => entry.contextKey === "attackerTraitStacks");
      source.sides.attacker.traitValues[canonicalTraitControlKey(control)] = 6;
      expect(createDeerSetup(snapshot, source).stacks).toBe(6);
      source.directions.forward.context[control.id] = 3;
      expect(createDeerSetup(snapshot, source).stacks).toBe(3);
    }
  });

  test("已存预设的旧入场次数不能盖掉逐层查询", () => {
    const setup = createDeerSetup(snapshot);
    const spirit = snapshot.spirits.find((entry) => entry.fullName === "波普鹿");
    const control = getTraitView(snapshot, spirit).inputs.find((entry) => entry.contextKey === "attackerTraitStacks");
    setup.state.sides.attacker.traitValues[canonicalTraitControlKey(control)] = 9;
    const clean = createDeerSetup(snapshot);
    expect(evaluate(setup, "arc", 0).damage).toBe(evaluate(clean, "arc", 0).damage);
    expect(evaluate(setup, "arc", 5).damage).toBe(evaluate(clean, "arc", 5).damage);
  });

  test.each([[100, 85], [50, 85], [49, 185]])("下注暗自身HP%s%%时静态威力为%s", (hp, power) => {
    const setup = { ...createDeerSetup(snapshot), attackerHp: hp };
    expect(evaluate(setup, "bet-dark").first.staticPower).toBe(power);
  });

  test("电弧迸发+40；离子火花保留独立能耗", () => {
    const setup = createDeerSetup(snapshot);
    const arc = evaluate(setup, "arc");
    expect(evaluate(setup, "burst").first.staticPower).toBe(arc.first.staticPower + 40);
    const ion = evaluate({ ...setup, normalElectric: "离子火花" }, "arc");
    expect(ion.damage).toBe(arc.damage);
    expect(ion.first.skillCost).toBe(2);
    expect(arc.first.skillCost).toBe(3);
  });

  test("先发使用第一击后HP复算，不用满血先发结果直接相加", () => {
    const setup = createDeerSetup(snapshot);
    const entry = evaluate(setup, "arc");
    expect(entry.nextState.directions.forward.currentHp).toBe(entry.targetHp - entry.damage);
    expect(entry.nextState.directions.forward.context.currentHpPercent).toBeCloseTo((entry.targetHp - entry.damage) / entry.maxHp * 100);
    expect(entry.followup.totalDamage).toBe(calculateMatchup(snapshot, entry.nextState).forward.results[0].totalDamage);
  });

  test("裂石应对首击不先吃降防，后续先发才应用物防-80%", () => {
    const setup = createDeerSetup(snapshot);
    const plain = evaluate(setup, "stone");
    const counter = evaluate(setup, "stone-counter");
    expect(counter.damage).toBe(plain.damage);
    expect(counter.followup.totalDamage).toBeGreaterThan(plain.followup.totalDamage);
    expect(counter.nextState.directions.forward.overrides.defenseLevelStage).toBe(-8);
    expect(counter.nextState.directions.forward.overrides.magicalDefenseLevelStageAdd ?? 0).toBe(0);
  });

  test("下注明消耗生命后再出先发，生命耗尽时不推荐补刀", () => {
    const setup = createDeerSetup(snapshot);
    const entry = evaluate(setup, "bet-light");
    const selfMax = entry.nextState.sides.attacker.panelStats.hp;
    expect(entry.nextState.directions.reverse.currentHp).toBe(selfMax - Math.floor(selfMax * 0.1));
    const exhausted = evaluate({ ...setup, attackerHp: 1 }, "bet-light");
    expect(exhausted.followup).toBeNull();
    expect(exhausted.comboLethal).toBe(false);
    expect(exhausted.followupReason).toContain("生命耗尽");
  });

  test("冻结只降低需扣血的阈值，不放大直接伤害；低伤害不会误报击倒", () => {
    const setup = createDeerSetup(snapshot);
    const plain = evaluate(setup, "arc");
    const frozen = evaluate({ ...setup, freeze: 2 }, "arc");
    expect(frozen.damage).toBe(plain.damage);
    expect(frozen.freeze.thresholdPercent).toBe(10);
    expect(frozen.lethal).toBe(false);
    const targetPercent = (plain.damage + Math.floor(plain.maxHp * .2)) / plain.maxHp * 100;
    expect(evaluate({ ...setup, freeze: 4, defenderHp: targetPercent }, "arc").lethal).toBe(true);
    expect(evaluate({ ...setup, freeze: 0, defenderHp: targetPercent }, "arc").lethal).toBe(false);
    setup.state.sides.defender.spiritId = snapshot.spirits.find((spirit) => spirit.types.includes("冰") && spirit.raceStats?.hp).id;
    expect(evaluate({ ...setup, freeze: 4 }, "arc").freeze.thresholdPercent).toBe(0);
  });

  test("四种模板与手调性格个体改变实算，不写回其他配置", () => {
    const setup = createDeerSetup(snapshot);
    const damages = DEFENSE_TEMPLATES.map((template) => {
      const next = structuredClone(setup);
      next.state.sides.defender = applyDeerPreset(next.state.sides.defender, template);
      return evaluate(next, "arc").percent;
    });
    expect(damages[0]).toBeLessThan(damages[1]);
    expect(damages[2]).toBe(damages[0]);
    expect(damages[3]).toBeGreaterThan(damages[1]);
  });

  test("防御能力、减伤、星陨均接入核心", () => {
    const setup = createDeerSetup(snapshot);
    const base = evaluate(setup, "arc").damage;
    expect(evaluate({ ...setup, reduction: 50 }, "arc").damage).toBeLessThan(base);
    expect(evaluate({ ...setup, starfall: 2 }, "arc").damage).toBeGreaterThan(base);
    setup.state.directions.forward.overrides.defenseLevelStage = 5;
    expect(evaluate(setup, "arc").damage).toBeLessThan(base);
  });

  test("防守特性按控件值参与计算，关闭后恢复未计特性伤害", () => {
    const setup = createDeerSetup(snapshot);
    const spirit = snapshot.spirits.find((entry) => entry.fullName === "圣草迪莫");
    expect(spirit).toBeTruthy();
    setup.state.sides.defender.spiritId = spirit.id;
    const control = getTraitView(snapshot, spirit, "defender").inputs.find((input) => input.contextKey.includes("Stacks"));
    setup.state.directions.forward.context[control.id] = 4;
    const protectedDamage = evaluate(setup, "arc").damage;
    setup.state.sides.defender.ignoreTraits = true;
    expect(evaluate(setup, "arc").damage).toBeGreaterThan(protectedDamage);
  });

  test("关闭补刀不生成第二击，先发自身不接另一个先发", () => {
    const setup = { ...createDeerSetup(snapshot), showFollowup: false };
    expect(evaluate(setup, "arc").followup).toBeNull();
    expect(evaluate({ ...setup, showFollowup: true }, "first").followup).toBeNull();
  });
});
