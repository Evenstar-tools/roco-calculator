import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { buildDamageComparisonInput, createSkillDamageRanking, damageComparisonIssue, describeDamageComparisonTemplate, filterSkillDamageRanking, getDamageComparisonTemplates, STANDARD_DURABILITY_TEMPLATES } from "../../src/domain/skill-damage-ranking.js";
import { captureDamageComparison, importDamageComparisonCandidate } from "../../src/state/damage-comparison.js";

const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
const spirit = (id, types = ["草"]) => ({ id, fullName: id, dexNo: id, types, raceStats: stats, stage: "首领", sourceCategory: "首领形态", traitIds: [] });
const snapshot = {
  meta: { id: "comparison-fixture" },
  spirits: [spirit("source", ["火"]), spirit("grass"), spirit("water", ["水"])],
  skills: [{ id: "fire", name: "火焰", type: "火", category: "magical", basePower: 80 }],
  traits: [],
};

describe("技能承伤对比", () => {
  test("固定模板收敛为三种配点，保留动态模板且不改变独立耐久榜", async () => {
    const templates = getDamageComparisonTemplates({ grass: {} });
    expect(templates.map(({ label }) => label)).toEqual(["生命性格满双防个体", "生命性格无双防个体", "中立性格生命个体", "当前防守方配点", "用户预设"]);
    expect(STANDARD_DURABILITY_TEMPLATES["standard-magical-v1"].natureId).toBe("cautious");
    const state = createInitialState(snapshot);
    const expected = [["standard-hp-v1", "grounded", 60], ["hp-only-v1", "grounded", 0], ["neutral-hp-only-v1", "neutral", 0]];
    for (const direction of ["forward", "reverse"]) {
      const target = direction === "reverse" ? "attacker" : "defender";
      for (const [templateId, nature, defense] of expected) {
        const options = { snapshot, state, direction, templateId };
        const ranking = await createSkillDamageRanking(options);
        const row = ranking.rows.find((entry) => entry.spirit.id === "grass");
        const imported = importDamageComparisonCandidate({ ...options, spirit: row.spirit });
        expect(imported.sides[target]).toMatchObject({ nature, displayIvs: { hp: 60, physicalDefense: defense, magicalDefense: defense, physicalAttack: 0, magicalAttack: 0, speed: 0 } });
        expect(buildCalculatorViewModel({ snapshot, state: imported, activeDirection: direction }).result.selectedResult.totalDamage).toBe(row.damage);
        const description = describeDamageComparisonTemplate(row.template);
        expect(description).toContain("生命60");
        expect(description.includes("物防60")).toBe(defense === 60);
        expect(description.includes("魔防60")).toBe(defense === 60);
      }
    }
  });
  test.each(["forward", "reverse"])("%s 按各自用户预设配点计算，未配置回退，代入与榜单一致", async (direction) => {
    const state = createInitialState(snapshot);
    const presets = {
      grass: { natureId: "timid", displayIvs: { hp: 60, magicalAttack: 60, speed: 60, physicalDefense: 0, magicalDefense: 0, physicalAttack: 0 }, traitValues: { ignored: 99 }, skills: { four: [] } },
      water: { natureId: "cautious", displayIvs: { hp: 0, magicalAttack: 0, speed: 0, physicalDefense: 60, magicalDefense: 60, physicalAttack: 0 } },
    };
    const source = captureDamageComparison(state, direction, presets);
    expect(source.presetsBySpirit.grass.traitValues).toEqual({ ignored: 99 });
    expect(source.presetsBySpirit.grass.skills).toEqual(presets.grass.skills);
    presets.grass.displayIvs.hp = 0;
    expect(source.presetsBySpirit.grass.displayIvs.hp).toBe(60);
    const options = { snapshot, ...source, templateId: "user-presets" };
    const ranking = await createSkillDamageRanking(options);
    const target = direction === "forward" ? "defender" : "attacker";
    for (const row of ranking.rows) {
      const input = buildDamageComparisonInput({ ...options, spirit: row.spirit });
      const expected = source.presetsBySpirit[row.spirit.id] ?? { natureId: "neutral", displayIvs: { hp: 60, physicalDefense: 0, magicalDefense: 0, speed: 0, physicalAttack: 0, magicalAttack: 0 } };
      expect(Boolean(row.template.presetFallback)).toBe(!source.presetsBySpirit[row.spirit.id]);
      expect(input.sides[target]).toMatchObject({ nature: expected.natureId, displayIvs: expected.displayIvs, ignoreTraits: true });
      const imported = importDamageComparisonCandidate({ ...options, spirit: row.spirit });
      expect(imported.sides[target]).toMatchObject({ nature: expected.natureId, displayIvs: expected.displayIvs, traitValues: expected.traitValues ?? {} });
      expect(buildCalculatorViewModel({ snapshot, state: imported, activeDirection: direction }).result.selectedResult.totalDamage).toBe(row.damage);
      expect(row.template.natureId).toBe(expected.natureId);
    }
    expect(describeDamageComparisonTemplate(ranking.rows.find((row) => row.spirit.id === "source").template)).toBe("未配置预设，使用默认分配：60级 · 中立性格 · 生命60个体，双防及其余0");
    expect(describeDamageComparisonTemplate(ranking.rows.find((row) => row.spirit.id === "grass").template)).toContain("胆小 · 生命60／魔攻60／速度60个体");
  });
  test.each(["forward", "reverse"])("%s 用户预设代入保留技能顺序、空位、手调与单技能配置，不改来源", (direction) => {
    const data = { ...snapshot, skills: [...snapshot.skills,
      { id: "water-skill", name: "水球", type: "水", category: "magical", basePower: 50 },
    ] };
    const state = createInitialState(data);
    const sourceSide = direction === "forward" ? "attacker" : "defender";
    const targetSide = sourceSide === "attacker" ? "defender" : "attacker";
    state.sides[sourceSide].skills.four = [{ skillId: "fire", context: { skillSlot: 1 }, overrides: { basePower: 95 } }, "water-skill", null, null];
    const skills = { four: ["water-skill", null, { skillId: "fire", context: { skillSlot: 3 }, overrides: { basePower: 120, hitCount: 2 } }, null], single: { skillId: "water-skill", context: { skillSlot: 2 }, overrides: { basePower: 70 } } };
    const preset = { natureId: "timid", displayIvs: { hp: 60, magicalAttack: 60, speed: 60 }, skills };
    const captured = captureDamageComparison(state, direction, { water: preset });
    const before = JSON.stringify({ state, captured, preset });
    const options = { snapshot: data, ...captured, templateId: "user-presets", spirit: data.spirits[2] };
    const imported = importDamageComparisonCandidate(options);
    expect(buildDamageComparisonInput(options).sides[targetSide].skills).toEqual(skills);
    expect(imported.sides[targetSide].skills).toEqual(skills);
    expect(imported.sides[sourceSide]).toEqual(state.sides[sourceSide]);
    expect(JSON.stringify({ state, captured, preset })).toBe(before);
    imported.sides[targetSide].skills.four[2].overrides.basePower = 1;
    expect(captured.presetsBySpirit.water.skills.four[2].overrides.basePower).toBe(120);
    expect(preset.skills.four[2].overrides.basePower).toBe(120);
    const withoutPreset = importDamageComparisonCandidate({ ...options, presetsBySpirit: {} });
    const standard = importDamageComparisonCandidate({ ...options, templateId: "standard-hp-v1" });
    expect(standard.sides[targetSide].skills).toEqual(withoutPreset.sides[targetSide].skills);
    expect(standard.sides[targetSide].skills).not.toEqual(skills);
  });
  test.each(["forward", "reverse"])("%s 手动特性条件优先于默认值和旧预设，承伤榜与主计算器一致", async (direction) => {
    const data = { ...snapshot,
      spirits: snapshot.spirits.map((entry) => ({ ...entry, traitIds: ["chord"] })),
      traits: [{ id: "chord", name: "和弦共振" }],
    };
    const sourceSide = direction === "forward" ? "attacker" : "defender";
    const targetSide = direction === "forward" ? "defender" : "attacker";
    for (const [stored, stacks, effect] of [[{}, 1, 50], [{ "trait.traitStacks.53103d7d": 1 }, 2, 60], [{ "trait.traitStacks.53103d7d": 1 }, 0, 50]]) {
      const state = createInitialState(data);
      state.sides[sourceSide].traitValues = stored;
      state.directions[direction].context = {
        "attackerTrait.attackerTraitStacks.53103d7d": stacks,
        "attackerTrait.attackerTraitEffect.fff35f45": effect,
      };
      const before = JSON.stringify(state);
      const input = buildDamageComparisonInput({ snapshot: data, state, direction, spirit: data.spirits[2] });
      expect(input.directions[direction].context).toMatchObject(state.directions[direction].context);
      const mainState = { ...state, sides: { ...state.sides, [targetSide]: input.sides[targetSide] } };
      const main = buildCalculatorViewModel({ snapshot: data, state: mainState, activeDirection: direction });
      const ranking = await createSkillDamageRanking({ snapshot: data, state, direction });
      expect(ranking.rows.find((row) => row.spirit.id === "water").damage).toBe(main.result.selectedResult.totalDamage);
      expect(JSON.stringify(state)).toBe(before);
    }
  });
  test.each(["forward", "reverse"])("%s 手填星陨和冻结仅显式沿用，关闭仍清空目标状态", (direction) => {
    let state = createInitialState(snapshot);
    const target = direction === "forward" ? "defender" : "attacker";
    state.marks[target].positive = { id: "charge", stacks: 9 };
    state.negativeStatuses[target] = { burn: 7, poison: 8, freeze: 0, electrified: 2, parasitism: 6 };
    state = calculatorReducer(state, { type: "mark/update", side: target, polarity: "negative", value: { id: "starfall", stacks: "3" } });
    state = calculatorReducer(state, { type: "negative-status/update", side: target, key: "freeze", value: "4" });
    state.directions[direction].context = { enemyFreezeStacks: 88, defenderHpPercent: 5 };
    state.directions[direction].currentHp = 1;
    const options = { snapshot, state, direction, spirit: snapshot.spirits[2] };
    const clean = buildDamageComparisonInput(options);
    const carried = buildDamageComparisonInput({ ...options, inheritTargetStatuses: true });
    expect(clean.marks[target].negative.stacks).toBe(0);
    expect(clean.negativeStatuses[target].freeze).toBe(0);
    expect(carried.marks[target]).toEqual({ negative: { id: "starfall", stacks: 3 }, positive: { id: null, stacks: 0 } });
    expect(carried.negativeStatuses[target]).toEqual({ burn: 0, poison: 0, freeze: 4, electrified: 0, parasitism: 0 });
    expect(carried.directions[direction]).toMatchObject({ starfallStacks: 3, context: { enemyFreezeStacks: 4 } });
    expect(carried.directions[direction].context).not.toHaveProperty("defenderHpPercent");
    expect(carried.directions[direction].currentHp).toBe(carried.sides[target].panelStats.hp);
    expect(state.directions[direction].currentHp).toBe(1);
  });
  test.each(["forward", "reverse"])("%s 当前防守方配点仅复用性格和个体，代入参数一致", async (direction) => {
    const state = createInitialState(snapshot);
    const target = direction === "forward" ? "defender" : "attacker";
    state.sides[target].nature = "cautious";
    state.sides[target].displayIvs = { hp: 60, physicalDefense: 0, magicalDefense: 60, speed: 0, physicalAttack: 0, magicalAttack: 0 };
    state.negativeStatuses[target].freeze = 3;
    const options = { snapshot, state, direction, templateId: "current-defense", inheritTargetStatuses: true };
    const ranking = await createSkillDamageRanking(options);
    expect(ranking.template).toMatchObject({ label: "当前防守方配点", natureId: "cautious", displayIvs: state.sides[target].displayIvs });
    for (const row of ranking.rows) {
      const input = buildDamageComparisonInput({ ...options, spirit: row.spirit });
      expect(row.damage).toBe(calculateMatchup(snapshot, input)[direction].selectedResult.totalDamage);
      const imported = importDamageComparisonCandidate({ ...options, spirit: row.spirit });
      expect(imported.sides[target]).toMatchObject({ nature: "cautious", displayIvs: state.sides[target].displayIvs });
      expect(imported.sides[target]).not.toHaveProperty("ignoreTraits");
      expect(imported.negativeStatuses[target].freeze).toBe(3);
      expect(imported.calculationOptions.includeNegativeStatusSettlement).toBe(true);
    }
  });
  test("冻结和星陨确实进入相关技能的直接伤害，而非仅显示层数", async () => {
    for (const [name, mark] of [["碎冰冰", false], ["极寒领域", false], ["多维击打", true]]) {
      const data = { ...snapshot, skills: [{ id: "hit", name, type: "冰", category: "magical", basePower: 60 }] };
      const state = createInitialState(data);
      state.negativeStatuses.defender.freeze = 4;
      state.marks.defender.negative = { id: "starfall", stacks: mark ? 3 : 0 };
      const options = { snapshot: data, state };
      const clean = await createSkillDamageRanking(options);
      const carried = await createSkillDamageRanking({ ...options, inheritTargetStatuses: true });
      const old = clean.rows.find((row) => row.spirit.id === "grass");
      const next = carried.rows.find((row) => row.spirit.id === "grass");
      expect(next.damage).toBeGreaterThan(old.damage);
      const imported = importDamageComparisonCandidate({ ...options, spirit: next.spirit, inheritTargetStatuses: true });
      const view = buildCalculatorViewModel({ snapshot: data, state: imported, activeDirection: "forward" });
      expect(view.result.selectedResult.totalDamage).toBe(next.damage);
    }
  });
  test("非伤害技能的零伤回复不参加榜单", async () => {
    const data = { ...snapshot,
      spirits: snapshot.spirits.map((entry, index) => index ? entry : { ...entry, traitIds: ["baron"] }),
      traits: [{ id: "baron", name: "贪得无厌" }],
      skills: [{ id: "rest", name: "休息回复", type: "普通", category: "status", basePower: 0, description: "自己回复30%生命。" }],
    };
    const state = createInitialState(data);
    const ranking = await createSkillDamageRanking({ snapshot: data, state });
    expect(ranking.rows).toEqual([]);
    expect(ranking.excluded).toHaveLength(3);
    expect(ranking.excluded.every((row) => row.reason === "该技能无直接伤害")).toBe(true);
  });
  test("四技能相邻威力联动和己方重组状态保留，切技能不改主配置", async () => {
    const data = { ...snapshot, skills: [
      { ...snapshot.skills[0], basePower: 200 },
      { id: "six", name: "六自由度", type: "机械", category: "magical", basePower: 30, description: "造成魔伤，威力额外增加两侧技能威力差的四分之一，传动1。" },
      { id: "zero", name: "传动状态", type: "普通", category: "status", basePower: 0 },
    ] };
    const state = createInitialState(data);
    state.mode = "four";
    state.sides.attacker.skills.four = ["zero", "six", "fire", null];
    state.marks.attacker.positive = { id: "reassembly", stacks: 1 };
    const before = JSON.stringify(state);
    const ranking = await createSkillDamageRanking({ snapshot: data, state, selectedSkillIndex: 1 });
    expect(ranking.rows).toHaveLength(3);
    for (const row of ranking.rows) {
      const input = buildDamageComparisonInput({ snapshot: data, state, spirit: row.spirit, selectedSkillIndex: 1 });
      expect(input.marks.attacker).toEqual(state.marks.attacker);
      expect(row.result.skillName).toBe("六自由度");
      expect(row.result.formulaSteps.some((step) => step.label === "相邻技能显示威力")).toBe(true);
      expect(row.result.reassemblyDamage).toBeGreaterThan(0);
      expect(row.damage).toBe(calculateMatchup(data, input).forward.selectedResult.totalDamage);
    }
    expect(JSON.stringify(state)).toBe(before);
  });
  test("清除含前缀的旧目标条件，但保留自身技能和特性条件", () => {
    const state = createInitialState(snapshot);
    state.sides.attacker.skills.four[0] = { skillId: "fire", context: {
      "skill.enemyPoisonStacks.hash": 9, "skill.defenderHpPercent.hash": 20,
      "attackerTrait.attackerHpPercent.hash": 55, "skill.chargeStacks.hash": 3,
    } };
    const next = buildDamageComparisonInput({ snapshot, state, spirit: snapshot.spirits[2] });
    expect(next.sides.attacker.skills.four[0].context).toEqual({
      "attackerTrait.attackerHpPercent.hash": 55, "skill.chargeStacks.hash": 3,
    });
  });
  test("百分比边界用原值，搜索保留全榜名次，同伤按图鉴稳定排序", () => {
    const rows = [4999, 5000, 9999, 10000].map((damage, index) => ({
      spirit: spirit(String(index)), panelStats: { hp: 10000 }, damage, percent: damage / 100,
      lethal: damage >= 10000,
    }));
    expect(filterSkillDamageRanking(rows, { filter: "half" })).toHaveLength(1);
    expect(filterSkillDamageRanking(rows, { filter: "survive" })).toHaveLength(3);
    expect(filterSkillDamageRanking(rows, { filter: "ko" }).map((row) => row.rank)).toEqual([4]);
    expect(filterSkillDamageRanking(rows, { query: "2" })[0]).toMatchObject({ rank: 3, lethal: false });
    expect(filterSkillDamageRanking(rows, { descending: true })[0].damage).toBe(10000);
    expect(filterSkillDamageRanking([rows[1], { ...rows[1], spirit: spirit("9") }]).map((row) => row.spirit.id)).toEqual(["1", "9"]);
  });
  test("缺种族和非最终形态明确排除，切换范围只纳入完整种族", async () => {
    const data = { ...snapshot, spirits: [...snapshot.spirits,
      { ...spirit("baby"), stage: "一阶", sourceCategory: "普通", evolution: { nextIds: ["grass"] } },
      { ...spirit("unknown"), raceStats: null },
    ] };
    const state = createInitialState(data);
    const ranking = await createSkillDamageRanking({ snapshot: data, state });
    expect(ranking.excluded.map(({ spirit, reason }) => [spirit.id, reason])).toEqual([["baby", "不在当前形态范围"], ["unknown", "种族值不完整"]]);
    const all = await createSkillDamageRanking({ snapshot: data, state, scope: "all" });
    expect(all.rows).toHaveLength(4);
    expect(all.excluded).toHaveLength(1);
    expect(await createSkillDamageRanking({ snapshot: data, state, signal: { aborted: true } })).toBeNull();
  });
  test("手动显示威力和依赖对手出招的技能不产出伪榜单", () => {
    const state = createInitialState(snapshot);
    state.mode = "single";
    state.directions.forward.overrides = { powerOverride: { mode: "panel", value: 200 } };
    expect(damageComparisonIssue(snapshot, state)).toContain("显示威力");
    state.directions.forward.overrides.powerOverride.mode = "static";
    expect(damageComparisonIssue(snapshot, state)).toBeNull();
    const data = { ...snapshot, skills: [{ ...snapshot.skills[0], name: "听桥" }] };
    expect(damageComparisonIssue(data, state)).toContain("依赖对手");
  });
  test("按标准模板逐只调用真实核心，排序且不改原配置", async () => {
    const state = createInitialState(snapshot);
    const before = JSON.stringify(state);
    const ranking = await createSkillDamageRanking({ snapshot, state });
    expect(ranking.rows).toHaveLength(3);
    expect(ranking.rows.map((row) => row.percent)).toEqual([...ranking.rows.map((row) => row.percent)].sort((a, b) => a - b));
    for (const row of ranking.rows) {
      const input = buildDamageComparisonInput({ snapshot, state, spirit: row.spirit });
      const direct = calculateMatchup(snapshot, input).forward.selectedResult;
      expect(row.damage).toBe(direct.totalDamage);
      expect(row.percent).toBe(row.damage / row.panelStats.hp * 100);
      expect(input.sides.defender).toMatchObject({ ignoreTraits: true, nature: "grounded", displayIvs: { hp: 60, speed: 0 } });
    }
    expect(JSON.stringify(state)).toBe(before);
  });
  test("代入保留攻击方和方向，清理旧防守状态并恢复原生特性", () => {
    const state = createInitialState(snapshot);
    state.directions.reverse.context = { weatherRainTurns: 3, attackerHpPercent: 60 };
    state.directions.reverse.overrides = { attackLevelStage: 2, defenseLevelStage: 4, typeMultiplier: 9 };
    state.directions.forward.currentHp = 120;
    state.sides.attacker.acquiredTraitIds = ["old"];
    const next = importDamageComparisonCandidate({ snapshot, state, direction: "reverse", spirit: snapshot.spirits[2] });
    expect(next.sides.attacker.spiritId).toBe("water");
    expect(next.sides.attacker.acquiredTraitIds).toEqual([]);
    expect(next.sides.attacker).not.toHaveProperty("ignoreTraits");
    expect(next.sides.attacker).not.toHaveProperty("panelStats");
    expect(next.sides.defender).toEqual(state.sides.defender);
    expect(next.directions.forward.currentHp).toBe(120);
    expect(next.directions.reverse.overrides).toEqual({ attackLevelStage: 2 });
    expect(next.directions.reverse.context.weatherRainTurns).toBe(3);
  });
});
