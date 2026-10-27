import { expect, test } from "vitest";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { damagePresentation } from "../../src/domain/result-presentation.js";
import { buildBalanceComparison, buildBattleLevelComparison } from "../../src/features/balance-comparison/model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { getLegacyMinggulongLevelInputs } from "../../src/features/s5-preview/level-input-migration.js";

const stats = { hp: 100, physicalAttack: 100, magicalAttack: 140, physicalDefense: 100, magicalDefense: 80, speed: 100 };
function fixture({ attacker = "abu", defender = "ordinary", attackLevel = 90, defendLevel = 60, mode = "single" } = {}) {
  const identities = ["abu", "minggulong"].map(key => ({ catalogId: "s5-level-comparison", key, mechanicKey: key }));
  const traits = identities.map(identity => ({ id: `trait-${identity.key}`, name: identity.key,
    description: "等级机制", previewIdentity: identity }));
  const snapshot = { meta: { id: "level-comparison", rulesVersion: "fixture" }, traits,
    spirits: [...identities.map(identity => ({ id: identity.key, fullName: identity.key,
      types: ["普"], raceStats: { ...stats }, traitIds: [`trait-${identity.key}`], previewIdentity: identity })),
    { id: "ordinary", fullName: "普通精灵", types: ["普"], raceStats: { ...stats }, traitIds: [] }],
    skills: [
      { id: "physical", name: "物攻测试", type: "普", category: "physical", basePower: 60, cost: 1 },
      { id: "magical", name: "魔攻测试", type: "普", category: "magical", basePower: 80, cost: 2 },
      { id: "status", name: "无伤害测试", type: "普", category: "status", basePower: 0, cost: 1 },
    ], typeChart: null,
    learnsets: ["abu", "minggulong", "ordinary"].map(spiritId => ({ spiritId, skillIds: ["physical", "magical", "status"] })),
  };
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.sides.attacker.spiritId = attacker;
  state.sides.defender.spiritId = defender;
  const args = { snapshot, state, activeDirection: "forward" };
  setLevel(args, "attacker", attackLevel);
  setLevel(args, "defender", defendLevel);
  return args;
}

function setLevel({ snapshot, state }, side, level) {
  const spirit = snapshot.spirits.find(entry => entry.id === state.sides[side].spiritId);
  const trait = snapshot.traits.find(entry => spirit.traitIds.includes(entry.id));
  if (!trait) return;
  const outgoing = side === "attacker" ? "forward" : "reverse";
  const incoming = side === "attacker" ? "reverse" : "forward";
  for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
    const input = getS5PreviewTraitInputs(trait, role).find(control => control.contextKey.endsWith("BattleLevel"));
    state.directions[direction].context[input.id] = level;
    state.directions[direction].context[input.contextKey] = level;
  }
}

function compare(args) {
  const afterView = buildBalanceComparison(args).afterView;
  return { afterView, comparison: buildBattleLevelComparison({ ...args, afterView }) };
}

function baseline(args, afterView) {
  const copy = structuredClone(args);
  setLevel(copy, "attacker", 60);
  setLevel(copy, "defender", 60);
  for (const [direction, side] of [["forward", "defender"], ["reverse", "attacker"]]) {
    const { currentHp, maxHp } = afterView.sides[side].health;
    copy.state.directions[direction].currentHp = currentHp;
    copy.state.directions[direction].context.currentHpPercent = currentHp / maxHp * 100;
  }
  return buildBalanceComparison({ ...copy, hpInputModes: { forward: "percent", reverse: "percent" } }).afterView;
}

test("当前等级打60级计入面板、系数和取整，比较不改写原输入", () => {
  const args = fixture();
  const saved = structuredClone(args);
  const { afterView, comparison } = compare(args);
  const expectedBaseline = baseline(args, afterView);
  const currentDamage = damagePresentation(afterView.result.selectedResult).damage;
  const baselineDamage = damagePresentation(expectedBaseline.result.selectedResult).damage;
  expect(comparison).toEqual({ status: "ready", attackerLevel: 90, defenderLevel: 60,
    currentDamage, baselineDamage, percent: Number(((currentDamage / baselineDamage - 1) * 100).toFixed(1)), skillName: "物攻测试" });
  expect(comparison.percent).toBeGreaterThan(36.5);
  expect(args).toEqual(saved);
});

test.each(["forward", "reverse"])("阿布80对冥古龙99的%s对比，双60完整重算低等级承伤并镜像输入", activeDirection => {
  const args = { ...fixture({ defender: "minggulong", attackLevel: 80, defendLevel: 99 }), activeDirection };
  const { afterView, comparison } = compare(args);
  const expected = baseline(args, afterView);
  expect(comparison).toMatchObject({ attackerLevel: activeDirection === "forward" ? 80 : 99,
    defenderLevel: activeDirection === "forward" ? 99 : 80,
    baselineDamage: damagePresentation(expected.result.selectedResult).damage });
  expect(expected.result.selectedResult.traitContributions.some(entry => entry.values.finalDamageMultiplier === 1.4)).toBe(true);
  if (activeDirection === "forward") expect(comparison.percent).toBeLessThan(0);
});

test("两侧手调种族、性格、个体与强化沿用同一配置，不退回官方种族值", () => {
  const args = fixture({ defender: "minggulong", attackLevel: 80, defendLevel: 99 });
  args.customStats = { attacker: { abu: { physicalAttack: 170, hp: 140 } }, defender: { minggulong: { physicalDefense: 135, hp: 180 } } };
  args.customEnabled = { attacker: { abu: true }, defender: { minggulong: true } };
  args.state.sides.attacker.nature = "adamant";
  args.state.sides.attacker.displayIvs.physicalAttack = 0;
  args.state.directions.forward.overrides.attackLevelStage = 2;
  const { afterView, comparison } = compare(args);
  const expected = baseline(args, afterView);
  expect(comparison.baselineDamage).toBe(damagePresentation(expected.result.selectedResult).damage);
  expect(expected.sides.attacker.spirit.raceStats.physicalAttack).toBe(170);
  expect(expected.sides.defender.spirit.raceStats.physicalDefense).toBe(135);
  expect(comparison.baselineDamage).not.toBe(compare({ ...args, customEnabled: {} }).comparison.baselineDamage);
});

test("双60生命使用当前真实HP比例，忽略过期绝对值和旧百分比，并沿用实际结算展示伤害", () => {
  const args = fixture({ defender: "minggulong", attackLevel: 80, defendLevel: 99 });
  args.state.directions.forward.currentHp = 250;
  args.state.directions.forward.context.currentHpPercent = 5;
  args.state.directions.reverse.currentHp = 200;
  args.state.directions.reverse.context.currentHpPercent = 90;
  args.hpInputModes = { forward: "hp", reverse: "hp" };
  args.state.calculationOptions.includeNegativeStatusSettlement = true;
  args.state.negativeStatuses.defender.burn = 2;
  const { afterView, comparison } = compare(args);
  const expected = baseline(args, afterView);
  expect(expected.sides.defender.health.currentHp).toBe(Math.round(expected.sides.defender.health.maxHp *
    afterView.sides.defender.health.currentHp / afterView.sides.defender.health.maxHp));
  expect(expected.sides.defender.health.currentHp).not.toBe(250);
  expect(comparison.currentDamage).toBe(damagePresentation(afterView.result.selectedResult).damage);
  expect(comparison.currentDamage).toBeGreaterThan(afterView.result.selectedResult.totalDamage);
  expect(comparison.baselineDamage).toBe(damagePresentation(expected.result.selectedResult).damage);
});

test("四技能跟随选中技能单独计算，不能用统一面板比例替代", () => {
  const args = fixture({ mode: "four" });
  args.state.sides.attacker.displayIvs.magicalAttack = 0;
  args.snapshot.skills[1].basePower = 7;
  const physical = compare(args).comparison;
  args.state.directions.forward.selectedSkillIndex = 1;
  const magical = compare(args).comparison;
  expect(physical.skillName).toBe("物攻测试");
  expect(magical.skillName).toBe("魔攻测试");
  expect(physical.currentDamage).not.toBe(magical.currentDamage);
  expect(physical.percent).not.toBe(magical.percent);
});

test("普通双方、忽略特性、非技能来源、未就绪及无伤害不显示对比", () => {
  expect(compare(fixture({ attacker: "ordinary" })).comparison).toBeNull();
  const args = fixture();
  args.state.sides.attacker.ignoreTraits = true;
  expect(compare(args).comparison).toBeNull();
  delete args.state.sides.attacker.ignoreTraits;
  for (const selectedDamageSource of ["trait", "bloodline", "unknown"]) {
    args.state.directions.forward.selectedDamageSource = selectedDamageSource;
    expect(compare(args).comparison).toBeNull();
  }
  args.state.directions.forward.selectedDamageSource = "skill";
  args.state.sides.attacker.skills.single = "status";
  expect(compare(args).comparison).toBeNull();
  args.state.sides.attacker.skills.single = "physical";
  args.snapshot.skills[0].s5StatusEffectPending = "待核验";
  expect(compare(args).comparison).toBeNull();
});

test("基准为0但当前有伤害时保留绝对值，不生成无穷百分比；双方0隐藏", () => {
  const args = fixture({ attackLevel: 99 });
  args.snapshot.skills[0].basePower = 4;
  args.snapshot.spirits.find(entry => entry.id === "ordinary").raceStats.physicalDefense = 1000;
  expect(compare(args).comparison).toMatchObject({ status: "zero-baseline", currentDamage: 1, baselineDamage: 0, percent: null });
  args.snapshot.skills[0].basePower = 1;
  expect(compare(args).comparison).toBeNull();
});

test("当前双方已为60级时，不附加第二次系数加成", () => {
  const args = fixture({ defender: "minggulong", attackLevel: 60, defendLevel: 60 });
  const { comparison } = compare(args);
  expect(comparison.percent).toBe(0);
  expect(comparison.currentDamage).toBe(comparison.baselineDamage);
});

test.each(["hp", "percent", undefined])("双方60级使用%s生命输入，取整、自定义生命和异常结算保持严格0%%", mode => {
  const args = fixture({ defender: "minggulong", attackLevel: 60, defendLevel: 60 });
  args.customStats = { attacker: { abu: { hp: 137 } }, defender: { minggulong: { hp: 183 } } };
  args.customEnabled = { attacker: { abu: true }, defender: { minggulong: true } };
  args.hpInputModes = { forward: mode, reverse: mode };
  args.state.directions.forward.currentHp = 187;
  args.state.directions.forward.context.currentHpPercent = 45.67;
  args.state.directions.reverse.currentHp = 103;
  args.state.directions.reverse.context.currentHpPercent = 32.19;
  args.state.calculationOptions.includeNegativeStatusSettlement = true;
  args.state.negativeStatuses.defender.burn = 2;
  const { comparison } = compare(args);
  expect(comparison.percent).toBe(0);
  expect(comparison.currentDamage).toBe(comparison.baselineDamage);
});

test("有效旧等级记录不会覆盖双60基准，无效旧计数保持待定而不生成对比", () => {
  const args = fixture({ attacker: "minggulong", attackLevel: 99 });
  for (const role of ["attacker", "defender"]) {
    const direction = role === "attacker" ? "forward" : "reverse";
    const [oldLevel, oldCount] = getLegacyMinggulongLevelInputs(role);
    args.state.directions[direction].context[oldLevel.id] = 99;
    args.state.directions[direction].context[oldCount.id] = 3;
  }
  const { afterView, comparison } = compare(args);
  expect(comparison.baselineDamage).toBe(damagePresentation(baseline(args, afterView).result.selectedResult).damage);
  const oldCount = getLegacyMinggulongLevelInputs().find(control => control.contextKey.endsWith("LevelEventCount"));
  args.state.directions.forward.context[oldCount.id] = 10;
  expect(compare(args).comparison).toBeNull();
});
