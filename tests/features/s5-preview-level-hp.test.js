import { expect, test } from "vitest";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { buildCalculatorViewModel, getPanelView } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { projectBattleLevelHealth, switchBattleForm } from "../../src/state/calculator-session.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { resolveSkillStatusActivation } from "../../src/domain/skill-status-effects.js";

const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
function fixture({ key = "minggulong", level = 99, count = 0, mode = "four" } = {}) {
  const identity = { catalogId: "s5-level-hp-fixture", key, mechanicKey: key === "minggulong" ? key : "abu" };
  const trait = { id: "level-trait", name: "前瞻特性", description: "等级机制", previewIdentity: identity };
  const snapshot = { meta: { id: "s5-level-hp", rulesVersion: "fixture" },
    spirits: [
      { id: "level-owner", fullName: "等级精灵", types: ["普"], raceStats: { ...stats }, traitIds: [trait.id], traitName: trait.name, previewIdentity: identity },
      { id: "ordinary", fullName: "普通精灵", types: ["普"], raceStats: { ...stats }, traitIds: [] },
    ], traits: [trait], typeChart: null,
    skills: [{ id: "hit", name: "测试攻击", type: "普", category: "physical", basePower: 60, cost: 1 }],
    learnsets: ["level-owner", "ordinary"].map(spiritId => ({ spiritId, skillIds: ["hit"] })),
  };
  const state = createInitialState(snapshot);
  state.mode = mode;
  const inputs = getS5PreviewTraitInputs(trait);
  for (const [suffix, value] of [["CurrentLevel", level], ["LevelEventCount", count]]) {
    state.directions.forward.context[inputs.find(input => input.contextKey.endsWith(suffix)).id] = value;
  }
  return { snapshot, state, activeDirection: "reverse" };
}

function expectedPanel(args, level, raceStats = stats) {
  return calculateAllPanelStats({ raceStats, displayIvs: args.state.sides.attacker.displayIvs, level });
}

test.each(["single", "four"])("%s模式等级面板、双方HP与结算使用同一临时等级，原会话不写level", mode => {
  const args = fixture({ mode, count: 2 });
  const before = structuredClone(args);
  const view = buildCalculatorViewModel(args);
  const panel = expectedPanel(args, 79);
  expect(view.sides.attacker.combatLevel).toBe(79);
  expect(view.sides.defender.combatLevel).toBe(60);
  expect(view.sides.attacker.panelStats).toEqual(panel);
  expect(view.sides.attacker.health.maxHp).toBe(panel.hp);
  expect(view.result.defenderMaxHp).toBe(panel.hp);
  expect(view.result.selectedResult.combatPanel.defender.physicalDefense).toBe(panel.physicalDefense);
  expect(args).toEqual(before);
  expect(args.state.sides.attacker).not.toHaveProperty("level");
});

test("详细面板读取combatLevel，不把强化层对象当作战斗等级", () => {
  const args = fixture();
  const side = { ...args.state.sides.attacker, level: { stage: 3 }, combatLevel: 99 };
  const panel = getPanelView(args.snapshot.spirits[0], side);
  expect(panel.find(stat => stat.key === "hp").basePanel).toBe(expectedPanel(args, 99).hp);
  expect(getPanelView(args.snapshot.spirits[0], { ...side, combatLevel: undefined })
    .find(stat => stat.key === "hp").basePanel).toBe(expectedPanel(args, 60).hp);
});

test("非custom百分比HP随等级上限缩放，当前HP和条件比例一致", () => {
  const args = fixture();
  args.state.directions.reverse.currentHp = 196;
  args.state.directions.reverse.context.currentHpPercent = 50;
  const view = buildBalanceComparison({ ...args, hpInputModes: { reverse: "percent" } }).afterView;
  const max = expectedPanel(args, 99).hp;
  const hp = Math.round(max * .5);
  expect(view.sides.attacker.health.currentHp).toBe(hp);
  expect(view.sides.attacker.health.percent).toBe(Number((hp / max * 100).toFixed(1)));
  expect(view.result.defenderHp).toBe(hp);
  expect(args.state.directions.reverse.currentHp).toBe(196);
  expect(args.state.directions.reverse.context.currentHpPercent).toBe(50);
});

test.each([250, 999])("绝对HP %s按实际上限保留或截断，并重算HP条件比例", hp => {
  const args = fixture({ level: 60 });
  args.state.directions.reverse.currentHp = hp;
  args.state.directions.reverse.context.currentHpPercent = 5;
  const view = buildBalanceComparison({ ...args, hpInputModes: { reverse: "hp" } }).afterView;
  const max = expectedPanel(args, 60).hp;
  expect(view.sides.attacker.health.currentHp).toBe(Math.min(hp, max));
  expect(view.sides.attacker.health.percent).toBe(Number((Math.min(hp, max) / max * 100).toFixed(1)));
  expect(view.result.defenderHp).toBe(Math.min(hp, max));
});

test("等级变动只保存官方尺度HP，序列化刷新丢失单位后结果仍一致", () => {
  const args = fixture();
  args.state.directions.reverse.currentHp = 196;
  args.state.directions.reverse.context.currentHpPercent = 50;
  const saved = projectBattleLevelHealth(args.state, { snapshot: args.snapshot, side: "attacker", hpInputMode: "percent" });
  const first = buildBalanceComparison({ ...args, state: saved, hpInputModes: { reverse: "percent" } }).afterView;
  const refreshed = buildBalanceComparison({ ...args, state: JSON.parse(JSON.stringify(saved)) }).afterView;
  expect(refreshed.sides.attacker.health).toEqual(first.sides.attacker.health);
  expect(refreshed.result.selectedResult.totalDamage).toBe(first.result.selectedResult.totalDamage);
  expect(saved.sides.attacker).not.toHaveProperty("level");
  expect(args.state.directions.reverse.currentHp).toBe(196);
});

test("custom生命按实际等级临时投影，不将custom生命写回官方会话", () => {
  const args = fixture();
  args.state.directions.reverse.currentHp = 196;
  args.state.directions.reverse.context.currentHpPercent = 50;
  const original = structuredClone(args.state);
  const result = buildBalanceComparison({ ...args, hpInputModes: { reverse: "percent" },
    customStats: { attacker: { "level-owner": { hp: 200 } } }, customEnabled: { attacker: { "level-owner": true } } });
  const customMax = expectedPanel(args, 99, { ...stats, hp: 200 }).hp;
  expect(result.afterView.sides.attacker.health.maxHp).toBe(customMax);
  expect(result.afterView.sides.attacker.health.currentHp).toBe(Math.round(customMax * .5));
  const official = projectBattleLevelHealth(args.state, { snapshot: args.snapshot, side: "attacker", hpInputMode: "percent" });
  expect(official.directions.reverse.currentHp).toBe(Math.round(expectedPanel(args, 99).hp * .5));
  expect(args.state).toEqual(original);
});

test("技能回血按实际等级的maxHP计算，不保存派生等级", () => {
  const args = fixture();
  const refraction = { id: "refraction", name: "折射", type: "光", category: "status", cost: 1 };
  const grass = { id: "grass", name: "草技能", type: "草", category: "physical", basePower: 60, cost: 1 };
  args.snapshot.skills.push(refraction, grass);
  args.state.sides.attacker.skills.four = ["refraction", "grass", null, null];
  args.state.directions.reverse.currentHp = 50;
  const operations = resolveSkillStatusActivation(refraction, { carriedSkills: [refraction, grass], attackerHpPercent: 50 / expectedPanel(args, 99).hp * 100 }).operations;
  const result = applyBattleActivation({ ...args, side: "attacker", skillIndex: 0, calculation: { forward: { results: [] } } });
  const hp = Math.round(50 + expectedPanel(args, 99).hp * operations.healPercent / 100);
  expect(result.applied).toBe(true);
  expect(result.state.directions.reverse.currentHp).toBe(hp);
  expect(result.state.directions.reverse.context.currentHpPercent).toBe(hp / expectedPanel(args, 99).hp * 100);
  expect(result.state.sides.attacker).not.toHaveProperty("level");
});

test("同族形态HP截断也使用实际等级，并同步满血百分比", () => {
  const args = fixture();
  args.snapshot.spirits[0].evolutionChainIds = ["level-owner", "form"];
  args.snapshot.spirits.push({ ...args.snapshot.spirits[0], id: "form", fullName: "低生命形态", raceStats: { ...stats, hp: 50 } });
  args.state.directions.reverse.currentHp = 500;
  args.state.directions.reverse.context.currentHpPercent = 80;
  const next = switchBattleForm(args.state, { snapshot: args.snapshot, side: "attacker", spiritId: "form" }).state;
  expect(next.directions.reverse.currentHp).toBe(expectedPanel(args, 99, { ...stats, hp: 50 }).hp);
  expect(next.directions.reverse.context.currentHpPercent).toBe(100);
  expect(next.sides.attacker).not.toHaveProperty("level");
});

test("默认满血null在连续等级变化中保持满血，不变成旧上限绝对值", () => {
  const args = fixture({ key: "abu", level: 60 });
  let state = args.state;
  const countInput = getS5PreviewTraitInputs(args.snapshot.traits[0]).find(input => input.contextKey.endsWith("LevelEventCount"));
  for (const count of [0, 1, 2]) {
    state = { ...state, directions: { ...state.directions, forward: { ...state.directions.forward,
      context: { ...state.directions.forward.context, [countInput.id]: count } } } };
    state = projectBattleLevelHealth(state, { snapshot: args.snapshot, side: "attacker", hpInputMode: "percent" });
    expect(state.directions.reverse.currentHp).toBeNull();
    const view = buildBalanceComparison({ ...args, state }).afterView;
    expect(view.sides.attacker.combatLevel).toBe(60 + 2 * count);
    expect(view.sides.attacker.health.currentHp).toBe(view.sides.attacker.health.maxHp);
  }
});

test.each(["single", "four"])("%s真实激活不使用旧存档HP比例绕过80%%阈值", mode => {
  const args = fixture({ mode });
  args.snapshot.skills.push({ id: "horse", name: "马步", type: "武", category: "status", cost: 1 });
  args.state.directions.reverse.currentHp = 350;
  args.state.directions.reverse.context.currentHpPercent = 90;
  args.state.sides.attacker.skills.single = "horse";
  args.state.directions.forward.context.applyAttackBoost = true;
  args.state.sides.attacker.skills.four = [{ skillId: "horse", context: { applyAttackBoost: true } }];
  const result = applyBattleActivation({ ...args, side: "attacker", skillMode: mode, skillIndex: 0, calculation: { forward: { results: [] } } });
  expect(result.applied).toBe(false);
  expect(result.reason).toBe("自身生命需高于80%");
  expect(result.state.directions.reverse.context.currentHpPercent).toBe(350 / expectedPanel(args, 99).hp * 100);
  expect(result.state.directions.forward.overrides.attackLevelStage ?? 0).toBe(0);
});
