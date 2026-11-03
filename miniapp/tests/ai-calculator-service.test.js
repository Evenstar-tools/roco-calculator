import { beforeAll, describe, expect, test } from "vitest";
import { getReleaseData } from "./release-source.js";
import { createAiCalculatorService } from "../src/ai/calculator-service.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import { selectSingleSkill, rememberSingleSkill } from "../src/shared/state/calculator-session.js";
import { createCalculationView } from "../src/view-models/calculation.js";
import { withMiniappBattleLevelDefaults } from "../src/state/battle-level-defaults.js";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { getTraitView } from "../src/shared/domain/calculator-view-model.js";
import { canonicalTraitControlKey } from "../src/shared/state/trait-values.js";
import { getSkillInputs } from "../src/view-models/skills.js";

let snapshot;
let ai;
beforeAll(async () => {
  snapshot = (await getReleaseData()).runtime;
  ai = createAiCalculatorService(snapshot);
}, 30_000);

const sample = { attacker: "龙鱼", defender: "岚鸟（春天的样子）", skill: "先发制人" };
const spiritNamed = name => snapshot.spirits.find(entry => entry.fullName === name);
const skillNamed = name => snapshot.skills.find(entry => entry.name === name);
const data = result => {
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  expect(result.content[0].type).toBe("text");
  return result.structuredContent;
};

function directState(attacker, defender, skill) {
  let state = createInitialState(snapshot);
  state.sides.attacker = { ...state.sides.attacker, spiritId: spiritNamed(attacker).id,
    skills: { single: null, four: [null, null, null, null] } };
  state.sides.defender = { ...state.sides.defender, spiritId: spiritNamed(defender).id,
    skills: { single: null, four: [null, null, null, null] } };
  state = withMiniappBattleLevelDefaults(snapshot, state);
  return selectSingleSkill(state, { side: "attacker", direction: "forward", skillId: skillNamed(skill).id, snapshot }).state;
}

describe("微信AI只读资料接口", () => {
  test("查询真实精灵、特性和合法技能参数，不把同族形态合成单一精灵", () => {
    const spirits = data(ai.searchRocoData({ query: "岚鸟" }));
    expect(spirits.total).toBeGreaterThan(1);
    expect(spirits.results.map(entry => entry.name)).toContain("岚鸟（春天的样子）");
    const result = spirits.results.find(entry => entry.name === "岚鸟（春天的样子）");
    expect(result.raceStats).toEqual(spiritNamed(result.name).raceStats);
    expect(result.traits[0].id).toBe(spiritNamed(result.name).traitIds[0]);
    expect(result.defaultLevel).toBe(60);
    expect(data(ai.searchRocoData({ query: "阿布" })).results.find(entry => entry.name === "阿布").defaultLevel).toBe(99);
    expect(data(ai.searchRocoData({ kind: "trait", query: result.traits[0].id })).results[0]).toEqual(result.traits[0]);
    const skill = data(ai.searchRocoData({ kind: "skill", query: "下注", spiritId: spiritNamed("乌拉塔（极夜的样子）").id })).results[0];
    expect(skill.controls.find(control => control.contextKey === "betMode")).toMatchObject({
      parameter: "skillValues.betMode", type: "choice", defaultValue: "fixed",
      options: [{ label: "固定加威", value: "fixed" }, { label: "低血加威", value: "lowHp" }],
    });
    expect(skill.controls.find(control => control.contextKey === "attackerHpPercent").parameter).toBe("attackerHpPercent");
    expect(data(ai.searchRocoData({ kind: "skill", query: "下注", spiritId: spiritNamed("黑猫密探").id })).total).toBe(0);
  });

  test("限制返回量；未收录查询明确返回空列表，非法输入返回原子接口错误", () => {
    const all = data(ai.searchRocoData({ kind: "spirit", query: "spirit", limit: 2 }));
    expect(all.results).toHaveLength(2);
    expect(all.truncated).toBe(true);
    expect(data(ai.searchRocoData({ query: "未收录测试精灵" }))).toMatchObject({ status: "ok", total: 0, results: [] });
    for (const params of [undefined, [], {}, { query: "" }, { query: 3 }, { query: "阿布", kind: "item" },
      { query: "阿布", limit: 13 }, { query: "阿布", limit: 1.5 }, { query: "阿布", typo: true },
      { query: "阿布", spiritId: "龙鱼" }]) {
      expect(ai.searchRocoData(params).isError).toBe(true);
    }
  });
});

describe("微信AI伤害接口复用真实小程序链路", () => {
  test.each([
    ["龙鱼", "岚鸟（春天的样子）", "先发制人"],
    ["黑猫密探", "龙鱼", "午夜噪音"],
    ["阿布", "龙鱼", "先发制人"],
    ["超能阿布", "龙鱼", "先发制人"],
    ["冥古龙", "龙鱼", "扫尾"],
  ])("%s的%s/%s与现有view-model逐段结果一致", (attacker, defender, skill) => {
    const state = directState(attacker, defender, skill);
    const expected = createCalculationView(snapshot, state, "forward");
    const result = ai.calculateRocoDamage({ attacker, defender, skill });
    const actual = data(result);
    expect(result.isError).toBe(false);
    expect(actual.status).toBe("exact");
    expect(actual.damage).toBe(expected.selectedResult.totalDamage);
    expect(actual.hpPercent).toBe(expected.selectedResult.hpPercent);
    expect(actual.hitDamages).toEqual(expected.selectedResult.hitDamages);
    expect(actual.hitCount).toBe(expected.selectedResult.hitCount);
    expect(actual.formulaSteps).toEqual(expected.selectedResult.formulaSteps);
    expect(Object.values(actual.assumptions.displayIvs)).toEqual([60, 60, 60, 60, 60, 60]);
    expect(actual.assumptions.attackerLevel).toBe(["阿布", "超能阿布", "冥古龙"].includes(attacker) ? 99 : 60);
    if (skill === "午夜噪音") expect(actual.hitCount).toBe(5);
    expect(actual.meta).toMatchObject({ dataVersion: snapshot.meta.id, rulesVersion: snapshot.meta.rulesVersion, seasonId: "S5" });
  });

  test("指定合法性格、等级与阶段值仍复用S5等级/结算，不静默吞掉非法等级", () => {
    const state = directState("阿布", "龙鱼", "先发制人");
    state.sides.attacker.nature = "adamant";
    state.sides.defender.nature = "steady";
    const control = getTraitView(snapshot, spiritNamed("阿布"), "attacker").inputs.find(input => input.contextKey.endsWith("S5BattleLevel"));
    state.sides.attacker.traitValues[canonicalTraitControlKey(control)] = 79;
    state.directions.forward.overrides = { attackLevelStage: 1, defenseLevelStage: -1 };
    const expected = createCalculationView(snapshot, state, "forward").selectedResult;
    const result = data(ai.calculateRocoDamage({ attacker: "阿布", defender: "龙鱼", skill: "先发制人",
      attackerNature: "固执", defenderNature: "steady", attackerLevel: 79, attackStage: 1, defenseStage: -1 }));
    expect(result.damage).toBe(expected.totalDamage);
    expect(result.formulaSteps).toEqual(expected.formulaSteps);
    expect(result.assumptions).toMatchObject({ attackerLevel: 79, defenderLevel: 60,
      attackerNature: { id: "adamant", name: "固执" }, defenderNature: { id: "steady", name: "稳重" } });
    expect(data(ai.calculateRocoDamage({ ...sample, attackerLevel: 99 })).code).toBe("unsupported_level");
  });

  test.each([7, 99])("能力等级支持首页相同的%j层范围", (stage) => {
    const state = directState(sample.attacker, sample.defender, sample.skill);
    state.directions.forward.overrides = { attackLevelStage: stage, defenseLevelStage: -stage };
    const expected = createCalculationView(snapshot, state, "forward").selectedResult;
    const actual = data(ai.calculateRocoDamage({ ...sample, attackStage: stage, defenseStage: -stage }));
    expect(actual.damage).toBe(expected.totalDamage);
    expect(actual.formulaSteps).toEqual(expected.formulaSteps);
  });

  test("下注暗默认49%，已更低保留；明不制造自损，不执行攻击或修改已有会话", () => {
    const input = { attacker: "乌拉塔（极夜的样子）", defender: "龙鱼", skill: "下注" };
    const dark = data(ai.calculateRocoDamage({ ...input, skillValues: { betMode: "lowHp" } }));
    expect(dark.assumptions.darkBetHpApplied).toBe(true);
    expect(dark.attackerHealth.requestedPercent).toBe(49);
    expect(dark.attackerHealth.current).toBe(Math.round(dark.attackerHealth.maximum * 0.49));
    expect(dark.defenderHealth.current).toBe(dark.defenderHealth.maximum);
    const lower = data(ai.calculateRocoDamage({ ...input, attackerHpPercent: 20, skillValues: { betMode: "lowHp" } }));
    expect(lower.attackerHealth.requestedPercent).toBe(20);
    expect(lower.assumptions.darkBetHpApplied).toBe(false);
    const bright = data(ai.calculateRocoDamage(input));
    expect(bright.attackerHealth.requestedPercent).toBe(100);
    expect(bright.resolvedPower).toBeLessThan(dark.resolvedPower);
    let state = directState(input.attacker, input.defender, input.skill);
    const bet = getSkillInputs(skillNamed("下注")).find(control => control.contextKey === "betMode");
    state.directions.forward.context.betMode = "lowHp";
    state.directions.forward.context[bet.id] = "lowHp";
    state.directions.reverse.currentHp = dark.attackerHealth.current;
    state.directions.reverse.context.currentHpPercent = 49;
    state = rememberSingleSkill(state, { side: "attacker", direction: "forward", skillId: skillNamed(input.skill).id, snapshot }).state;
    expect(dark.damage).toBe(createCalculationView(snapshot, state, "forward").selectedResult.totalDamage);
    expect(data(ai.calculateRocoDamage({ ...input, skillValues: { [bet.id]: "lowHp" } })).damage).toBe(dark.damage);
  });

  test("缺少技能条件提供needs_input和可填写参数；状态技能和未适配规则不伪造零伤害", () => {
    const missing = ai.calculateRocoDamage({ attacker: "缇塔", defender: "龙鱼", skill: "飞踢" });
    expect(missing.isError).toBe(true);
    expect(data(missing)).toMatchObject({ code: "needs_input", inputs: [{ key: "skillPosition" }] });
    const completed = ai.calculateRocoDamage({ attacker: "缇塔", defender: "龙鱼", skill: "飞踢", skillValues: { skillPosition: 2 } });
    expect(completed.isError).toBe(false);
    for (const skill of ["羽化加速", "花炮", "防御"]) {
      const result = ai.calculateRocoDamage({ ...sample, skill });
      expect(result.isError).toBe(true);
      expect(data(result)).toMatchObject({ code: "non_damage_skill" });
      expect(result.structuredContent).not.toHaveProperty("damage");
    }
    const unsupportedSnapshot = { ...snapshot, skills: snapshot.skills.map(entry => entry.name === "先发制人"
      ? { ...entry, ruleId: "unknown_ai_rule_test" } : entry) };
    const unsupported = createAiCalculatorService(unsupportedSnapshot).calculateRocoDamage(sample);
    expect(unsupported.isError).toBe(true);
    expect(data(unsupported).code).toBe("unsupported");
    expect(unsupported.structuredContent).not.toHaveProperty("damage");
  });

  test("实体必须是ID或唯一完整名，不能猜形态或接受不存在学习面", () => {
    for (const [patch, code] of [
      [{ attacker: "岚鸟" }, "ambiguous_entity"],
      [{ attacker: "乌拉塔" }, "ambiguous_entity"],
      [{ attacker: "不存在的精灵" }, "not_found"],
      [{ skill: "愿力冲击" }, "ambiguous_entity"],
      [{ skill: "午夜噪音" }, "unlearnable_skill"],
      [{ attackerNature: "固" }, "invalid_nature"],
    ]) {
      const result = ai.calculateRocoDamage({ ...sample, ...patch });
      expect(result.isError).toBe(true);
      expect(data(result).code).toBe(code);
    }
    const byId = data(ai.calculateRocoDamage({ attacker: spiritNamed(sample.attacker).id,
      defender: spiritNamed(sample.defender).id, skill: skillNamed(sample.skill).id }));
    expect(byId.damage).toBe(data(ai.calculateRocoDamage(sample)).damage);
  });

  test("类型、极端数值、未知控件均返回结构化错误而不隐式转换", () => {
    for (const patch of [{ attackerLevel: 150 }, { attackerLevel: 0 }, { attackerLevel: "60" },
      { defenderLevel: 2.5 }, { attackerHpPercent: -1 }, { attackerHpPercent: 101 },
      { defenderHpPercent: Number.NaN }, { attackerHpPercent: Infinity }, { attackerHpPercent: "49" },
      { attackerHpPercent: null }, { defenderHpPercent: null }, { attackStage: null }, { defenseStage: null },
      { attackStage: 100 }, { defenseStage: -100 }, { attackStage: 1.5 }, { skillValues: [] },
      { skillValues: { typo: true } }, { unexpected: true }, { attacker: {} }, { defender: null }, { skill: "" },
      { attackerNature: 1 }]) {
      const result = ai.calculateRocoDamage({ ...sample, ...patch });
      expect(result.isError, JSON.stringify(patch)).toBe(true);
      expect(data(result)).toMatchObject({ status: "error", message: expect.any(String) });
    }
    for (const params of [undefined, null, [], {}, { attacker: "龙鱼" }]) expect(ai.calculateRocoDamage(params).isError).toBe(true);
    const bet = { attacker: "乌拉塔（极夜的样子）", defender: "龙鱼", skill: "下注" };
    for (const skillValues of [{ betMode: "dark" }, { betMode: false }, { attackerHpPercent: 49 },
      { betMode: "lowHp", "skill.betMode": "fixed" }]) {
      expect(ai.calculateRocoDamage({ ...bet, skillValues }).isError).toBe(true);
    }
    expect(data(createAiCalculatorService(null).calculateRocoDamage(sample)).code).toBe("snapshot_unavailable");
  });

  test("多次调用/返回对象编辑不会篡改快照、已有配置或读写storage", () => {
    const store = createCalculatorStore(snapshot, directState(sample.attacker, sample.defender, sample.skill));
    const beforeState = JSON.stringify(store.getState());
    const beforeSnapshot = JSON.stringify(snapshot);
    const searched = data(ai.searchRocoData({ query: "龙鱼" }));
    searched.results[0].raceStats.hp = -1;
    const skillResult = data(ai.searchRocoData({ kind: "skill", query: "下注" }));
    skillResult.results[0].controls[0].options[0].value = "changed";
    const result = ai.calculateRocoDamage(sample);
    result.structuredContent.assumptions.displayIvs.hp = 1;
    expect(data(ai.calculateRocoDamage(sample)).assumptions.displayIvs.hp).toBe(60);
    expect(JSON.stringify(snapshot)).toBe(beforeSnapshot);
    expect(JSON.stringify(store.getState())).toBe(beforeState);
  });
});
