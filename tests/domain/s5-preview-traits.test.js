import { describe, expect, test } from "vitest";
import {
  getS5PreviewTraitInputs, getS5PreviewTraitEvaluation, resolveS5PreviewTraitEffect,
} from "../../src/domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { getTraitEffectInputs, getTraitEffectRule, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";

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
    for (const key of ["abu", "boss-abu", "super-abu"]) {
      expect(getS5PreviewTraitInputs(trait(key), "attacker")).toEqual(ordinary);
      expect(evaluate(trait(key))).toMatchObject({ mechanicKey: "abu", currentLevel: 60, calcStatus: "ready" });
      expect(evaluate(trait(key), { CurrentLevel: 62, LevelEventCount: 1 })).toMatchObject({
        currentLevel: 64, calcStatus: "pending", blockingReason: expect.stringContaining("固定60级"),
      });
      expect(evaluate(trait(key), { CurrentLevel: 60, LevelEventCount: 90 }).currentLevel).toBe(99);
      expect(evaluate(trait(key), { CurrentLevel: 58, LevelEventCount: 1 })).toMatchObject({
        currentLevel: 60, calcStatus: "ready", summary: expect.stringContaining("58 + 2×1"),
      });
    }
  });

  test("role-specific IDs share canonical owner identity, preserve acquired instance values and do not borrow opposite role", () => {
    const entity = trait("gold-vein-dragon");
    const offense = getS5PreviewTraitInputs(entity, "attacker");
    const defense = getS5PreviewTraitInputs(entity, "defender");
    expect(offense.map(canonicalTraitControlKey)).toEqual(defense.map(canonicalTraitControlKey));
    expect(offense.map(({ source, scope }) => [source, scope])).toEqual([["attackerTrait", "direction"], ["attackerTrait", "direction"]]);
    const values = context(entity, "attacker", { AttackBuffActive: true, CurrentAttackBonus: 80 });
    expect(evaluate(entity, { AttackBuffActive: true, CurrentAttackBonus: 80 }).summary).toContain("+80%");
    expect(getS5PreviewTraitEvaluation(entity, "defender", values).summary).toBe("双攻增益未生效");
    const acquired = { ...entity, runtimeInputValues: Object.fromEntries(offense.map(control => [
      canonicalTraitControlKey(control), values[control.id],
    ])) };
    expect(getS5PreviewTraitEvaluation(acquired, "defender", {}).summary).toContain("+80%");
  });

  test.each(["gold-vein-dragon", "little-scissor"])("%s uses the explicit current total only when enabled, with no count multiplication", (key) => {
    const entity = trait(key);
    expect(resolve(entity)).toMatchObject({ attackLevelBonus: 0, attackMultiplier: 1, step: null });
    expect(resolve(entity, "attacker", { AttackBuffActive: true })).toMatchObject({ attackLevelBonus: 5, attackMultiplier: 1.5 });
    expect(resolve(entity, "attacker", { AttackBuffActive: true, CurrentAttackBonus: 90 })).toMatchObject({ attackLevelBonus: 9, attackMultiplier: 1.9 });
    expect(resolve(entity, "defender", { AttackBuffActive: true, CurrentAttackBonus: 90 })).toMatchObject({ attackLevelBonus: 0, powerPercentAdd: 0, step: null });
  });

  test("silver dragon changes magical attack only, leaving physical/power and inactive totals untouched", () => {
    const entity = trait("underground-silver-dragon");
    expect(resolve(entity, "attacker", { CurrentMagicalAttackBonus: 70 }, "magical")).toMatchObject({ attackLevelBonus: 7, attackMultiplier: 1.7, powerPercentAdd: 0 });
    expect(resolve(entity, "attacker", { CurrentMagicalAttackBonus: 70 }, "physical")).toMatchObject({ attackLevelBonus: 0, attackMultiplier: 1, step: null });
    expect(resolve(entity)).toMatchObject({ attackLevelBonus: 0, step: null });
  });

  test("shark applies one fixed 50% current buff; egg requires both entry conditions and buffs owning defense in either role", () => {
    const shark = trait("lele-shark");
    expect(resolve(shark)).toMatchObject({ attackLevelBonus: 0 });
    expect(resolve(shark, "attacker", { NegativeCleared: true })).toMatchObject({ attackLevelBonus: 5 });
    const egg = trait("egg-wrap");
    expect(resolve(egg, "defender", { TeamMoenhua: true })).toMatchObject({ defenseLevelBonus: 0 });
    expect(resolve(egg, "defender", { TeamMoenhua: true, EntryDefenseActive: true })).toMatchObject({ defenseLevelBonus: 5, defenderDefenseLevelBonus: 5 });
    expect(resolve(egg, "attacker", { TeamMoenhua: true, EntryDefenseActive: true })).toMatchObject({ attackerDefenseLevelBonus: 5, defenseLevelBonus: 0 });
    expect(evaluate(egg, { TeamMoenhua: true, EntryDefenseActive: true }).note).toContain("不默认永久");
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

  test("level99/80/79 block every partial modifier; explicit level60 trial alone can receive incoming +40%", () => {
    const entity = trait("minggulong");
    expect(evaluate(entity)).toMatchObject({ currentLevel: 99, calcStatus: "pending" });
    for (const CurrentLevel of [99, 80, 79]) {
      expect(evaluate(entity, { CurrentLevel })).toHaveProperty("blockingReason");
      expect(resolve(entity, "defender", { CurrentLevel })).toMatchObject({ finalDamageMultiplier: 1, step: null });
    }
    expect(resolve(entity, "defender", { CurrentLevel: 60 })).toMatchObject({ finalDamageMultiplier: 1.4 });
    expect(resolve(entity, "attacker", { CurrentLevel: 60 })).toMatchObject({ finalDamageMultiplier: 1, step: null });
    expect(evaluate(entity, { CurrentLevel: 60 })).not.toHaveProperty("blockingReason");
  });

  test("level counts perform only known arithmetic, preserve threshold boundaries and block unknown minimum", () => {
    const ming = trait("minggulong");
    expect(evaluate(ming, { LevelEventCount: 1 })).toMatchObject({ currentLevel: 89, summary: expect.stringContaining("99 − 10×1") });
    expect(evaluate(ming, { LevelEventCount: 2 })).toMatchObject({ currentLevel: 79, calcStatus: "pending" });
    expect(evaluate(ming, { CurrentLevel: 90, LevelEventCount: 1 }).currentLevel).toBe(80);
    expect(evaluate(ming, { CurrentLevel: 70, LevelEventCount: 1 })).toMatchObject({ currentLevel: 60, calcStatus: "ready" });
    expect(resolve(ming, "defender", { CurrentLevel: 70, LevelEventCount: 1 }).finalDamageMultiplier).toBe(1.4);
    expect(evaluate(ming, { LevelEventCount: 10 })).toMatchObject({
      currentLevel: -1, calcStatus: "pending", blockingReason: expect.stringContaining("下降下限"),
    });
    expect(resolve(ming, "defender", { LevelEventCount: 10 })).toMatchObject({ finalDamageMultiplier: 1, step: null });
    expect(evaluate(trait("abu"), { CurrentLevel: 78, LevelEventCount: 1 })).toMatchObject({ currentLevel: 80, calcStatus: "pending" });
    expect(evaluate(trait("abu"), { CurrentLevel: 77, LevelEventCount: 1 })).toMatchObject({ currentLevel: 79, calcStatus: "pending" });
  });

  test("status mechanisms report current confirmed effects without silently generating future buffs or damage blockers", () => {
    expect(evaluate(trait("boss-glass-jellyfish"), { SkillUsed: true, PoisonMarkStacks: 3 }).effects).toContainEqual({
      kind: "status-add", target: "opponent", status: "poison", stacks: 6, timing: "after-skill", confirmedSource: "manual-effective-poison-mark-stacks",
    });
    expect(evaluate(trait("jingyu"), { SnowActive: true, FreezeApplicationConfirmed: true }).effects[0]).toMatchObject({ kind: "status-replace", from: "freeze", to: "starfall", stacks: 3 });
    expect(evaluate(trait("doulie"), { SnowTriggered: true, SnowTurnsRemaining: 3 }).effects[0]).toMatchObject({ kind: "weather-state", remainingTurns: 3 });
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "bug" }, "attacker", { skill: { type: "火" } }).effects).toEqual([]);
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "bug" }, "attacker", { skill: { type: "虫" } }).effects[0]).toMatchObject({ status: "parasitism", stacks: 1 });
    expect(evaluate(trait("watermelon-bug"), { UsedSkillType: "grass" })).not.toHaveProperty("blockingReason");
    expect(evaluate(trait("crab-coconut"), { GrassDiscountReady: true }).effects[0]).toMatchObject({ kind: "next-grass-cost-discount", amount: 3 });
    expect(resolve(trait("crab-coconut"), "attacker", { GrassDiscountReady: true })).toMatchObject({ powerPercentAdd: 0, step: null });
    expect(evaluate(trait("lily-of-valley"), { DreamActive: true, TurnEndConfirmed: true }).effects[0]).toMatchObject({ status: "parasitism", stacks: 3, timing: "turn-end" });
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
      ...state.directions.forward, context: context(entity, "attacker", { CurrentMagicalAttackBonus: 100 }),
    } } };
    const after = buildCalculatorViewModel({ snapshot, state: boosted, activeDirection: "forward" });
    expect(after.calculation.forward.results[0].totalDamage).toBe(before.calculation.forward.results[0].totalDamage);
    expect(after.calculation.forward.results[1].totalDamage).toBeGreaterThan(before.calculation.forward.results[1].totalDamage);
    expect(after.calculation.reverse.results[0].totalDamage).toBe(before.calculation.reverse.results[0].totalDamage);
    expect({ snapshot, state }).toEqual(original);
  });
});
