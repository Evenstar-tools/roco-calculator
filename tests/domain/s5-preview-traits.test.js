import { describe, expect, test } from "vitest";
import {
  getS5PreviewTraitInputs, getS5PreviewTraitEvaluation, resolveS5PreviewTraitEffect,
} from "../../src/domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getTraitEffectInputs, getTraitEffectRule, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { getLegacyMinggulongLevelInputs } from "../../src/features/s5-preview/level-input-migration.js";

const trait = (mechanicKey, extra = {}) => ({
  id: "preview-" + mechanicKey, name: "前瞻特性", description: "未知文本：威力+999%。",
  previewIdentity: { catalogId: "s5-trait-test", mechanicKey }, ...extra,
});
const context = (entity, role, values) => Object.fromEntries(getS5PreviewTraitInputs(entity, role)
  .filter((control) => Object.hasOwn(values, control.contextKey.replace(/^.*TraitS5/u, "")))
  .map((control) => [control.id, values[control.contextKey.replace(/^.*TraitS5/u, "")]]));
const resolve = (entity, role = "attacker", values = {}, category = "physical") => resolveS5PreviewTraitEffect(entity, role, {
  context: context(entity, role, values), skill: { name: "测试技能", type: "普通", category },
});
const evaluate = (entity, values = {}, role = "attacker", options) => getS5PreviewTraitEvaluation(entity, role, context(entity, role, values), options);

describe("S5 explicit trait controls and evaluation", () => {
  test("only S5 catalog identity opts in; metadata prevents description inference even for unknown keys", () => {
    expect(getS5PreviewTraitInputs({ name: "前瞻特性" })).toBeNull();
    expect(getS5PreviewTraitInputs({ previewIdentity: { catalogId: "s4-old", mechanicKey: "abu" } })).toBeNull();
    expect(resolveS5PreviewTraitEffect({ name: "普通特性" })).toBeNull();
    const unknown = trait("future-unreviewed");
    expect(getTraitEffectRule(unknown)).toBeNull();
    expect(getTraitEffectInputs(unknown)).toEqual([]);
    expect(resolveTraitEffectRule(unknown, "attacker", {})).toMatchObject({ attackLevelBonus: 0, powerPercentAdd: 0, step: null });
    expect(evaluate(unknown)).toMatchObject({ calcStatus: "pending", blockingReason: expect.any(String) });
  });

  test("all three Abu aliases share identical owner-safe controls and evaluation", () => {
    const ordinary = getS5PreviewTraitInputs(trait("abu"), "attacker");
    expect(ordinary).toHaveLength(1);
    expect(ordinary).toMatchObject([
      { contextKey: "attackerTraitS5BattleLevel", label: "当前等级", defaultValue: 60, min: 1, max: 99, step: 2 },
    ]);
    for (const key of ["abu", "boss-abu", "super-abu"]) {
      expect(getS5PreviewTraitInputs(trait(key), "attacker")).toEqual(ordinary);
      expect(evaluate(trait(key))).toMatchObject({ mechanicKey: "abu", currentLevel: 60, calcStatus: "ready" });
      for (const BattleLevel of [1, 60, 62, 79, 80, 99]) {
        expect(evaluate(trait(key), { BattleLevel })).toMatchObject({
          currentLevel: BattleLevel, calcStatus: "ready",
          summary: `当前等级 ${BattleLevel}${BattleLevel < 80 ? "；承伤 +40%" : ""}`,
        });
        expect(resolve(trait(key), "defender", { BattleLevel }).finalDamageMultiplier).toBe(BattleLevel < 80 ? 1.4 : 1);
        expect(resolve(trait(key), "attacker", { BattleLevel }).finalDamageMultiplier).toBe(1);
      }
    }
  });

  test("role-specific IDs share canonical owner identity, preserve acquired instance values and do not borrow opposite role", () => {
    const entity = trait("gold-vein-dragon");
    const offense = getS5PreviewTraitInputs(entity, "attacker");
    const defense = getS5PreviewTraitInputs(entity, "defender");
    expect(offense.map(canonicalTraitControlKey)).toEqual(defense.map(canonicalTraitControlKey));
    expect(offense.map(({ source, scope }) => [source, scope])).toEqual(Array.from({ length: 3 }, () => ["attackerTrait", "direction"]));
    const values = context(entity, "attacker", { ChargeCount: 2 });
    expect(evaluate(entity, { ChargeCount: 2 }).summary).toContain("物攻能力等级 +10");
    expect(getS5PreviewTraitEvaluation(entity, "defender", values).summary).toBe("未聚能 · 无增益");
    const acquired = { ...entity, runtimeInputValues: Object.fromEntries(offense.map(control => [
      canonicalTraitControlKey(control), values[control.id],
    ])) };
    expect(getS5PreviewTraitEvaluation(acquired, "defender", {}).summary).toContain("物攻能力等级 +10");
  });

  test.each(["little-scissor"])("%s counts actual enemy exits as flat skill power without reading old attack percentages", (key) => {
    const entity = trait(key);
    expect(resolve(entity)).toMatchObject({ attackLevelBonus: 0, attackMultiplier: 1, step: null });
    expect(resolve(entity, "attacker", { OpponentExitCount: 1 })).toMatchObject({ attackLevelBonus: 0, fixedPowerAdd: 20, attackMultiplier: 1 });
    expect(resolve(entity, "attacker", { OpponentExitCount: 3 }, "magical")).toMatchObject({ attackLevelBonus: 0, fixedPowerAdd: 60 });
    expect(resolve(entity, "defender", { OpponentExitCount: 3 })).toMatchObject({ attackLevelBonus: 0, fixedPowerAdd: 0, step: null });
    expect(getS5PreviewTraitEvaluation(entity, "attacker", { attackerTraitS5AttackBuffActive: true, attackerTraitS5CurrentAttackBonus: 90 }).effects).toEqual([]);
  });

  test.each([0, 1, 2, 19, 20, 21])("gold dragon count %s adds5 stages each, leaving total-stage clamping to the shared calculator", ChargeCount => {
    const entity = trait("gold-vein-dragon");
    expect(resolve(entity, "attacker", { ChargeCount })).toMatchObject({
      attackLevelBonus: ChargeCount * 5, attackMultiplier: 1 + ChargeCount * 0.5,
    });
    expect(resolve(entity, "defender", { ChargeCount })).toMatchObject({ attackLevelBonus: 0, step: null });
  });

  test("gold dragon sanitizes count and rejects nonconvertible old percentages until explicitly replaced", () => {
    const entity = trait("gold-vein-dragon");
    expect(resolve(entity, "attacker", { ChargeCount: -1 }).attackLevelBonus).toBe(0);
    expect(resolve(entity, "attacker", { ChargeCount: 2.9 }).attackLevelBonus).toBe(10);
    const legacy = { attackerTraitS5AttackBuffActive: true, attackerTraitS5CurrentAttackBonus: 70 };
    expect(getS5PreviewTraitEvaluation(entity, "attacker", legacy)).toMatchObject({ calcStatus: "pending" });
    expect(getS5PreviewTraitEvaluation(entity, "attacker", { ...legacy, ...context(entity, "attacker", { ChargeCount: 0 }) }))
      .toMatchObject({ calcStatus: "ready", summary: "未聚能 · 无增益" });
    expect(getS5PreviewTraitEvaluation(entity, "attacker", { ...legacy, attackerTraitS5CurrentAttackBonus: 100 }).summary)
      .toBe("聚能 2 次 · 物攻能力等级 +10");
  });

  test("new counters wait for turn end; settled values clamp to the current count", () => {
    const gold = trait("gold-vein-dragon");
    expect(resolve(gold, "attacker", { ChargeCount: 2, SettledChargeCount: 0 }).attackLevelBonus).toBe(0);
    expect(evaluate(gold, { ChargeCount: 2, SettledChargeCount: 1 })).toMatchObject({ totalCount: 2, settledCount: 1, pendingCount: 1 });
    expect(resolve(gold, "attacker", { ChargeCount: 2, SettledChargeCount: 1 }, "magical").attackLevelBonus).toBe(0);
    expect(resolve(gold, "attacker", { ChargeCount: 1, SettledChargeCount: 9 }).attackLevelBonus).toBe(5);
    const silver = trait("underground-silver-dragon");
    expect(resolve(silver, "attacker", { EnergySpent: 7, SettledEnergySpent: 0 }, "magical").attackLevelBonus).toBe(0);
    expect(resolve(silver, "attacker", { EnergySpent: 7, SettledEnergySpent: 3 }, "magical").attackLevelBonus).toBe(3);
    expect(evaluate(silver, { EnergySpent: 7, SettledEnergySpent: 3 }).summary).toContain("待回合结束 4 点");
  });

  test("silver dragon changes magical attack only, leaving physical/power and inactive totals untouched", () => {
    const entity = trait("underground-silver-dragon");
    expect(resolve(entity, "attacker", { EnergySpent: 7 }, "magical")).toMatchObject({ attackLevelBonus: 7, attackMultiplier: 1.7, powerPercentAdd: 0 });
    expect(resolve(entity, "attacker", { EnergySpent: 7 }, "physical")).toMatchObject({ attackLevelBonus: 0, attackMultiplier: 1, step: null });
    expect(resolve(entity)).toMatchObject({ attackLevelBonus: 0, step: null });
  });

  test("shark applies one fixed 50% current buff; egg uses one trigger and buffs owning defense in either role", () => {
    const shark = trait("lele-shark");
    expect(resolve(shark)).toMatchObject({ attackLevelBonus: 0 });
    expect(resolve(shark, "attacker", { NegativeCleared: true })).toMatchObject({ attackLevelBonus: 5 });
    expect(resolve(shark, "attacker", { NegativeCleared: true }, "magical")).toMatchObject({ attackLevelBonus: 0, attackMultiplier: 1, step: null });
    const egg = trait("egg-wrap");
    expect(getS5PreviewTraitInputs(egg)).toHaveLength(1);
    expect(getS5PreviewTraitInputs(egg)[0]).toMatchObject({ label: "特性触发", type: "boolean" });
    expect(resolve(egg, "defender", { TeamMoenhua: true })).toMatchObject({ defenseLevelBonus: 0 });
    expect(resolve(egg, "defender", { EggTriggered: true })).toMatchObject({ defenseLevelBonus: 5, defenderDefenseLevelBonus: 5 });
    expect(resolve(egg, "attacker", { EggTriggered: true })).toMatchObject({ attackerDefenseLevelBonus: 5, defenseLevelBonus: 0 });
    expect(evaluate(egg, { EggTriggered: true }).note).toContain("当前条件");
  });

  test("official dice ranges distinguish one-to-six and one-to-twenty without guessing face effects", () => {
    for (const [key, description, maximum] of [
      ["diliutun", "入场时随机获得1~6点，在场时双方根据点数获得不同效果。", 6],
      ["diniantun", "入场时随机获得1~20点，在场时双方根据点数获得不同效果。", 20],
    ]) {
      const entity = trait("diliutun", { description, previewIdentity: { catalogId: "s5-official-test", key, mechanicKey: "diliutun" } });
      expect(getS5PreviewTraitInputs(entity).find(input => input.contextKey.endsWith("DiceFace"))).toMatchObject({ min: 1, max: maximum });
      expect(evaluate(entity, { DiceRolled: true, DiceFace: 20 })).toMatchObject({ calcStatus: "pending", summary: expect.stringContaining(`骰点 ${maximum}`) });
    }
  });

  test.each([[19, 0], [20, 50], [21, 50]])("boss Bruce total cost %s gives fixed speed %s while power is a manual fraction", (OpponentTotalCost, speed) => {
    const entity = trait("boss-ice-bruce");
    expect(resolve(entity, "attacker", { OpponentTotalCost, CurrentPowerBonus: 80 })).toMatchObject({
      powerPercentAdd: 0.8, powerMultiplier: 1.8, attackerSpeedFlatBonus: speed,
    });
    expect(resolve(entity, "defender", { OpponentTotalCost, CurrentPowerBonus: 80 })).toMatchObject({
      powerPercentAdd: 0, defenderSpeedFlatBonus: speed, attackerSpeedFlatBonus: 0,
    });
  });

  test("valid levels enable calculation; only levels below80 receive incoming +40%", () => {
    const entity = trait("minggulong");
    expect(getS5PreviewTraitInputs(entity)).toMatchObject([
      { contextKey: "attackerTraitS5BattleLevel", label: "当前等级", defaultValue: 99, min: 1, max: 99, step: 10 },
    ]);
    expect(getS5PreviewTraitInputs(entity)).toHaveLength(1);
    expect(evaluate(entity)).toMatchObject({ currentLevel: 99, calcStatus: "ready" });
    for (const BattleLevel of [99, 89, 80, 79]) {
      expect(evaluate(entity, { BattleLevel })).not.toHaveProperty("blockingReason");
      expect(resolve(entity, "defender", { BattleLevel }).finalDamageMultiplier).toBe(BattleLevel < 80 ? 1.4 : 1);
    }
    expect(resolve(entity, "defender", { BattleLevel: 60 })).toMatchObject({ finalDamageMultiplier: 1.4 });
    expect(resolve(entity, "attacker", { BattleLevel: 60 })).toMatchObject({ finalDamageMultiplier: 1, step: null });
    expect(evaluate(entity, { BattleLevel: 60 })).not.toHaveProperty("blockingReason");
  });

  test("Minggulong reads one current level without hidden decrements; invalid old counts stay guarded", () => {
    const ming = trait("minggulong");
    expect(evaluate(ming, { BattleLevel: 89 })).toMatchObject({ currentLevel: 89, summary: "当前等级 89" });
    expect(evaluate(ming, { BattleLevel: 79 })).toMatchObject({ currentLevel: 79, summary: "当前等级 79；承伤 +40%", calcStatus: "ready" });
    const legacy = getLegacyMinggulongLevelInputs();
    const oldCount = legacy.find(control => control.contextKey.endsWith("LevelEventCount"));
    const current = context(ming, "attacker", { BattleLevel: 80 });
    expect(getS5PreviewTraitEvaluation(ming, "attacker", { ...current, [oldCount.id]: 3 }).currentLevel).toBe(80);
    expect(getS5PreviewTraitEvaluation(ming, "attacker", { [oldCount.id]: 10 })).toMatchObject({
      currentLevel: -1, calcStatus: "pending", blockingReason: expect.stringContaining("下降下限"),
    });
    const defenseCount = getLegacyMinggulongLevelInputs("defender").find(control => control.contextKey.endsWith("LevelEventCount"));
    expect(resolveS5PreviewTraitEffect(ming, "defender", { context: { [defenseCount.id]: 10 } })).toMatchObject({ finalDamageMultiplier: 1, step: null });
  });

  test("status mechanisms report current confirmed effects without silently generating future buffs or damage blockers", () => {
    expect(evaluate(trait("boss-glass-jellyfish"), { SkillUsed: true, PoisonMarkStacks: 3 }).effects).toContainEqual({
      kind: "status-add", target: "opponent", status: "poison", stacks: 6, timing: "after-skill", confirmedSource: "manual-effective-poison-mark-stacks",
    });
    expect(getS5PreviewTraitEvaluation(trait("jingyu"), "attacker", { weatherBlizzard: true })).toMatchObject({ effects: [], summary: expect.stringContaining("回合末待适配") });
    expect(evaluate(trait("jingyu"), { SnowActive: true, FreezeApplicationConfirmed: true }).effects).toEqual([]);
    const goose = trait("doulie");
    expect(getS5PreviewTraitEvaluation(goose, "attacker", { ...context(goose, "attacker", { SnowTriggered: true }), weatherBlizzard: true, weatherTurns: 3 }).effects[0]).toMatchObject({ kind: "weather-state", remainingTurns: 3 });
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "bug" }, "attacker", { skill: { type: "火" } }).effects).toEqual([]);
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "bug" }, "attacker", { skill: { type: "虫" } }).effects[0]).toMatchObject({ status: "parasitism", stacks: 1 });
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "grass" })).not.toHaveProperty("blockingReason");
    expect(evaluate(trait("crab-coconut"), { GrassDiscountReady: true }).effects[0]).toMatchObject({ kind: "next-grass-cost-discount", amount: 3 });
    expect(resolve(trait("crab-coconut"), "attacker", { GrassDiscountReady: true })).toMatchObject({ powerPercentAdd: 0, step: null });
    // Old stored booleans cannot apply another turn or override the global weather.
    const lily = trait("lily-of-valley");
    expect(evaluate(lily, { DreamActive: true, TurnEndConfirmed: true })).toMatchObject({ effects: [], summary: "萌系天气未生效，无寄生施加" });
    expect(getS5PreviewTraitEvaluation(lily, "attacker", { weatherDream: true })).toMatchObject({ effects: [], summary: "萌系天气生效：回合结束可给对手3层寄生" });
    expect(getS5PreviewTraitInputs(lily).find(input => input.contextKey.endsWith("TurnEndConfirmed")).action).toBe("s5-dream-turn-end");
    expect(evaluate(trait("diliutun"))).toMatchObject({ calcStatus: "ready", effects: [] });
    expect(evaluate(trait("diliutun"), { DiceRolled: true, DiceFace: 20 })).toMatchObject({ calcStatus: "pending", blockingReason: expect.stringContaining("映射") });
  });

  test("shared real damage VM consumes S5 current modifiers and recomputes both directions without changing state/snapshot", () => {
    const entity = trait("underground-silver-dragon");
    const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
    const snapshot = {
      meta: { id: "s5-effect-fixture", rulesVersion: "fixture-rules" }, typeChart: null,
      spirits: ["self", "opponent"].map(id => ({ id, fullName: id, raceStats: stats, traitIds: id === "self" ? [entity.id] : [], types: ["普通"] })),
      traits: [entity],
      skills: ["physical", "magical"].map(category => ({ id: category, name: category, category, type: "普通", basePower: 80, cost: 2 })),
      learnsets: ["self", "opponent"].map(spiritId => ({ spiritId, skillIds: ["physical", "magical"] })),
    };
    const state = createInitialState(snapshot);
    state.mode = "four";
    for (const [side, spiritId] of [["attacker", "self"], ["defender", "opponent"]]) {
      state.sides[side].spiritId = spiritId;
      state.sides[side].skills = { single: "magical", four: ["physical", "magical", null, null] };
    }
    const original = structuredClone({ snapshot, state });
    const before = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    const boosted = { ...state, directions: { ...state.directions, forward: {
      ...state.directions.forward, context: context(entity, "attacker", { EnergySpent: 10 }),
    } } };
    const after = buildCalculatorViewModel({ snapshot, state: boosted, activeDirection: "forward" });
    expect(after.calculation.forward.results[0].totalDamage).toBe(before.calculation.forward.results[0].totalDamage);
    expect(after.calculation.forward.results[1].totalDamage).toBeGreaterThan(before.calculation.forward.results[1].totalDamage);
    expect(after.calculation.reverse.results[0].totalDamage).toBe(before.calculation.reverse.results[0].totalDamage);
    expect({ snapshot, state }).toEqual(original);
  });
});
