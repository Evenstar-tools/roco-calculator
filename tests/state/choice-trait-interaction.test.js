import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../../src/domain/skill-status-effects.js";
import { projectTriggerContext } from "../../src/domain/trigger-controls.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { createInitialState } from "../../src/state/defaults.js";

const snapshot = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
const skillFor = (name) => snapshot.skills.find((skill) => skill.name === name);
function setup(spiritName, skillName, values, side = "attacker", mode = "four") {
  const skill = skillFor(skillName);
  const inputs = [...getSkillEffectInputs(skill), ...getSkillStatusEffectInputs(skill)];
  const context = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    inputs.find((input) => input.contextKey === key)?.id ?? key, value,
  ]));
  const state = createInitialState(snapshot);
  state.mode = mode;
  for (const candidate of ["attacker", "defender"]) {
    state.sides[candidate].spiritId = snapshot.spirits.find((spirit) => spirit.fullName === (candidate === side ? spiritName : "迪莫")).id;
    state.sides[candidate].skills.four = [skillFor("抓挠").id, null, null, null];
  }
  state.sides[side].skills.four = [{ skillId: skill.id, context }, skillFor("抓挠").id, null, null];
  state.sides[side].skills.single = skill.id;
  const direction = side === "attacker" ? "forward" : "reverse";
  if (mode === "single") state.directions[direction].context = context;
  const view = (value) => buildCalculatorViewModel({ snapshot, state: value, activeDirection: direction }).calculation;
  const activate = (value) => applyBattleActivation({ snapshot, state: value, side, skillIndex: 0, skillMode: mode, calculation: view(value) });
  return { state, skill, direction, view, activate };
}

test.each(["attacker", "defender"].flatMap((side) => ["four", "single"].flatMap((mode) => [
  [side, mode, "加尔", "growth", 1], [side, mode, "加尔", "counter", 1],
  [side, mode, "黑化加尔", "growth", 2], [side, mode, "黑化加尔", "counter", 0],
])))("%s %s %s 友谊满溢 %s 的真实控件累计为 %i", (side, mode, spirit, branch, count) => {
  const { state, skill, direction, view, activate } = setup(spirit, "友谊满溢", { friendshipMode: branch, choiceTraitTriggered: true, counterTriggered: true, skillUseCount: 0 }, side, mode);
  const before = view(state)[direction].results[0];
  expect(before.choiceTraitSequence?.executions).toHaveLength(2);
  if (spirit === "黑化加尔" && branch === "growth") {
    expect(before.choiceTraitSequence.executions[1].power - before.choiceTraitSequence.executions[0].power).toBe(20);
  }
  const next = activate(state);
  expect(next.applied).toBe(true);
  const context = mode === "single" ? next.state.directions[direction].context : next.state.sides[side].skills.four[0].context;
  expect(projectTriggerContext(context, getSkillEffectInputs(skill)).skillUseCount).toBe(count);
  expect(view(next.state)[direction].results[0].usageSummary.count).toBe(count);
  expect(view(state)[direction].results[0]).toEqual(before); // 原快照可完整撤销，无预览副作用。
});

test.each([
  ["加尔", true, 9, 60], ["黑化加尔", true, 18, 0], ["加尔", false, 9, 0],
])("%s 纯状态选择特性 %s：增益只应用一次", (spirit, triggered, attack, speed) => {
  const { state, direction, view, activate } = setup(spirit, "蒸汽进行曲", { applyAttackBoost: true, choiceTraitTriggered: triggered });
  const next = activate(state);
  expect(next.applied).toBe(true);
  expect(next.state.directions[direction].overrides).toMatchObject({ attackLevelStage: attack, attackerSpeedFlat: speed });
  const result = view(next.state)[direction].results[0];
  expect(result.usageSummary).toMatchObject({ count: 1, appliedEffects: expect.arrayContaining([`攻击+${attack}层`]) });
  expect(result.gainSummary).toBe("蒸汽进行曲×1");
  const twice = activate(next.state);
  expect(twice.state.directions[direction].overrides.attackLevelStage).toBe(attack * 2);
  expect(view(twice.state)[direction].results[0].gainSummary).toBe("蒸汽进行曲×2");
});

test.each(["加尔", "黑化加尔"])("%s 切换分支、关闭特性、手动威力与次数不会串用", (spirit) => {
  const fixture = setup(spirit, "友谊满溢", { friendshipMode: "growth", choiceTraitTriggered: true, skillUseCount: 3 });
  const { state, skill, view, activate } = fixture;
  const after = activate(state).state;
  const entry = after.sides.attacker.skills.four[0];
  const modeId = getSkillEffectInputs(skill).find((input) => input.contextKey === "friendshipMode").id;
  const count = spirit === "加尔" ? 4 : 5;
  expect(view(after).forward.results[0].usageSummary.count).toBe(count);
  entry.context[modeId] = "counter";
  entry.context.choiceTraitTriggered = false;
  const switched = view(after).forward.results[0];
  expect(switched.choiceTraitSequence).toBeUndefined();
  expect(switched.usageSummary.count).toBe(count);
  expect(activate(after).state.sides.attacker.skills.four[0].context).toEqual(entry.context);
  entry.context[modeId] = "growth";
  entry.overrides = { powerOverride: { mode: "static", value: 123 } };
  const manual = view(after).forward.results[0];
  expect(manual.staticPower).toBe(123);
  expect(manual.usageSummary).toMatchObject({ count, manualPower: true });
  after.sides.attacker.skills.four[0] = skillFor("抓挠").id;
  expect(view(after).forward.results[0].choiceTraitSequence).toBeUndefined();
  expect(view(after).forward.results[0].usageSummary).toBeUndefined();
});

test.each([
  ["加尔", "野火", { applyDefenseReduction: true }, "forward", "defenseLevelStage", -9],
  ["黑化加尔", "野火", { applyDefenseReduction: true }, "forward", "defenseLevelStage", -18],
  ["加尔", "马步", { applyAttackBoost: true }, "forward", "attackLevelStage", 15],
  ["黑化加尔", "马步", { applyAttackBoost: true }, "forward", "attackLevelStage", 30],
  ["加尔", "超声波", {}, "forward", "fixedPowerAdd", 40],
  ["黑化加尔", "超声波", {}, "forward", "fixedPowerAdd", 40],
  ["黑化加尔", "沙石阵", {}, "reverse", "defenseLevelStage", 18],
])("%s %s 已适配状态增益与累计行一致", (spirit, skillName, context, target, field, expected) => {
  const { state, skill, view, activate } = setup(spirit, skillName, { ...context, choiceTraitTriggered: true });
  const next = activate(state);
  expect(next.applied).toBe(true);
  expect(next.state.directions[target].overrides[field]).toBe(expected);
  const result = view(next.state).forward.results[0];
  expect(result.usageSummary.count).toBe(1);
  expect(result.usageSummary.appliedEffects.join(" ")).toContain(`${expected > 0 ? "+" : ""}${expected}`);
  expect(next.state.directions[target].overrides.gainSources[field].sources).toEqual([
    expect.objectContaining({ id: `attacker:${skill.id}`, count: 1, amount: expected }),
  ]);
});

test.each(["加尔", "黑化加尔"].flatMap((spirit) => ["steady", "counter"].map((branch) => [spirit, branch])))("%s 驱赶 %s 仅第一段触发应对", (spirit, branch) => {
  const { state, skill, view } = setup(spirit, "驱赶", { driveOutMode: branch, counterTriggered: true, choiceTraitTriggered: true });
  const result = view(state).forward.results[0];
  const second = spirit === "加尔" ? (branch === "steady" ? "counter" : "steady") : branch;
  expect(result.choiceTraitSequence.executions.map((item) => item.power)).toEqual([
    skill.basePower + (branch === "steady" ? 20 : 140),
    skill.basePower + (second === "steady" ? 20 : 0),
  ]);
  expect(result.totalDamage).toBe(result.choiceTraitSequence.executions.reduce((sum, item) => sum + item.damage, 0));
});
