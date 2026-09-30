import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { importDamageComparisonCandidate } from "../../src/state/damage-comparison.js";
import { createSkillDamageRanking, filterSkillDamageRanking, getDamageComparisonSelection } from "../../src/domain/skill-damage-ranking.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { calculateFreezeThreshold } from "../../src/domain/negative-status.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
const snapshot = { meta: { id: "freeze-ranking" }, traits: [],
  spirits: [["source", "普通"], ["target", "草"], ["ice", "冰"]].map(([id, type]) => ({ id, fullName: id, types: [type], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
  skills: [{ id: "hit", name: "测试攻击", type: "普通", category: "magical", basePower: 320 }],
};

test.each(["forward", "reverse"])("%s 冻结推条、满条筛选与代入一致，不伪造伤害或重复结算", async (direction) => {
  const state = createInitialState(snapshot);
  const target = direction === "forward" ? "defender" : "attacker";
  state.sides[target === "defender" ? "attacker" : "defender"].spiritId = "source";
  state.negativeStatuses[target] = { freeze: 4, burn: 9, poison: 9 };
  const options = { snapshot, state, direction, inheritTargetStatuses: true };
  const ranking = await createSkillDamageRanking(options);
  const row = ranking.rows.find((r) => r.spirit.id === "target");
  expect(row).toMatchObject({ damage: 360, freezePercent: 20, freezeThresholdHp: 89, lethal: true, freezeLethal: true, remainingHp: 0, remainingAfterDirect: 89 });
  expect(row.damagePercent).toBeCloseTo(360 / 449 * 100);
  expect(row.percent).toBeCloseTo(row.damagePercent + 20);
  expect(filterSkillDamageRanking([row], { filter: [100, null] })).toHaveLength(1);
  expect(filterSkillDamageRanking([row], { filter: [75, 100] })).toHaveLength(0);
  const ice = ranking.rows.find((r) => r.spirit.id === "ice");
  expect(ice).toMatchObject({ freezePercent: 0, freezeImmune: true, lethal: false });
  const clean = (await createSkillDamageRanking({ ...options, inheritTargetStatuses: false })).rows.find((r) => r.spirit.id === "target");
  expect(clean.damage).toBe(row.damage);
  expect(clean).toMatchObject({ freezePercent: 0, lethal: false });
  const imported = importDamageComparisonCandidate({ ...options, spirit: row.spirit });
  expect(buildCalculatorViewModel({ snapshot, state: imported, activeDirection: direction }).result.selectedResult.negativeStatusSettlement).toMatchObject({ lethal: true, statusDamage: 0 });
});

test("冻结阈值沿用最大生命、取整、免疫与层数上限", () => {
  expect(calculateFreezeThreshold({ maxHp: 449, stacks: 4 })).toMatchObject({ thresholdHp: 89, thresholdPercent: 20 });
  expect(calculateFreezeThreshold({ maxHp: 500, stacks: 4 })).toMatchObject({ thresholdHp: 100, thresholdPercent: 20 });
  expect(calculateFreezeThreshold({ maxHp: 500, stacks: 99 })).toMatchObject({ thresholdHp: 500, thresholdPercent: 100 });
  expect(calculateFreezeThreshold({ maxHp: 500, stacks: 4, types: ["冰"] })).toMatchObject({ immune: true, thresholdHp: 0 });
  const row = { spirit: { id: "test", fullName: "test" }, panelStats: { hp: 449 }, freezePercent: 20, percent: 0 };
  expect(filterSkillDamageRanking([{ ...row, damage: 359 }], { filter: [100, null] })).toHaveLength(0);
  expect(filterSkillDamageRanking([{ ...row, damage: 360 }], { filter: [100, null] })).toHaveLength(1);
});

test.each(["forward", "reverse"])("%s 彩虹独角兽折射两次的冻结自动进入追打承伤榜，重复计算不叠层", async (direction) => {
  const data = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const names = ["彩虹独角兽", "圣草迪莫", "冰钻布鲁斯"];
  const fixture = { ...data, spirits: names.map((name) => data.spirits.find((s) => s.fullName === name)) };
  const presets = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
  const side = direction === "forward" ? "attacker" : "defender";
  const target = side === "attacker" ? "defender" : "attacker";
  let state = createInitialState(fixture);
  state.mode = "four";
  state.sides[side].spiritId = fixture.spirits[0].id;
  state.sides[target].spiritId = fixture.spirits[1].id;
  state.sides[side].skills.four = [...presets.entries.find((p) => p.spiritId === fixture.spirits[0].id).skills];
  const selection = getDamageComparisonSelection(fixture, state, direction, 6);
  expect(selection.options).toHaveLength(7);
  expect(selection.selected.skill.id).toBe(state.sides[side].skills.four[6]);
  const skillIndex = (name) => selection.options.find((option) => option.skill.name === name).index;
  for (let i = 0; i < 2; i++) state = applyBattleActivation({ snapshot: fixture, state, side, skillIndex: skillIndex("折射"), skillMode: "four" }).state;
  expect(state.negativeStatuses[target].freeze).toBe(4);
  const before = JSON.stringify(state);
  const options = { snapshot: fixture, state, direction, selectedSkillIndex: skillIndex("追打"), inheritTargetStatuses: true };
  for (let i = 0; i < 2; i++) {
    const ranking = await createSkillDamageRanking(options);
    expect(ranking.rows.find((r) => r.spirit.fullName === "圣草迪莫").freezePercent).toBe(20);
    expect(ranking.rows.find((r) => r.spirit.fullName === "冰钻布鲁斯").freezePercent).toBe(0);
  }
  expect(JSON.stringify(state)).toBe(before);
});

test.each(["forward", "reverse"])("%s 寒潮本次自动冻结按每个候选解析，免疫与代入不重复叠加", async (direction) => {
  const data = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const fixture = { ...data, spirits: ["圣代甜甜（樱桃巧克力口味）", "寂灭骨龙", "冰钻布鲁斯"].map((name) => data.spirits.find((spirit) => spirit.fullName === name)) };
  const side = direction === "forward" ? "attacker" : "defender";
  const target = side === "attacker" ? "defender" : "attacker";
  const state = createInitialState(fixture);
  state.mode = "four";
  state.calculationOptions.includeNegativeStatusSettlement = true;
  state.sides[side].spiritId = fixture.spirits[0].id;
  state.sides[target].spiritId = fixture.spirits[1].id;
  const coldId = data.skills.find((skill) => skill.name === "寒潮").id;
  state.sides[side].skills.four = [coldId, null, null, null];
  // 初次查看就带本次附冻结，不预先写入“已使用”。
  state.directions[direction].context.negativeStatusUseCountsBySlot = { 1: 0 };
  const options = { snapshot: fixture, state, direction, selectedSkillIndex: 0, templateId: "current-defense", scope: "all" };
  const before = JSON.stringify(state);
  for (const [inheritTargetStatuses, counter, expectedStacks] of [[false, false, 3], [true, false, 5], [false, true, 7]]) {
    state.negativeStatuses[target].freeze = inheritTargetStatuses ? 2 : 0;
    state.sides[side].skills.four[0] = counter ? { skillId: coldId, context: { negativeStatusCounterState: true } } : coldId;
    const ranking = await createSkillDamageRanking({ ...options, inheritTargetStatuses });
    const row = ranking.rows.find((entry) => entry.spirit.id === fixture.spirits[1].id);
    expect(row.freezePercent).toBe(expectedStacks * 5);
    expect(ranking.rows.find((entry) => entry.spirit.id === fixture.spirits[2].id).freezePercent).toBe(0);
    const imported = importDamageComparisonCandidate({ ...options, spirit: row.spirit, inheritTargetStatuses });
    const settlement = buildCalculatorViewModel({ snapshot: fixture, state: imported, activeDirection: direction }).result.selectedResult.negativeStatusSettlement;
    expect(settlement.freeze.thresholdPercent).toBe(row.freezePercent);
    expect(settlement.stacks.freeze).toBe(expectedStacks);
    expect((await createSkillDamageRanking({ ...options, inheritTargetStatuses })).rows.find((entry) => entry.spirit.id === row.spirit.id).freezePercent).toBe(row.freezePercent);
  }
  state.negativeStatuses[target].freeze = 0;
  state.sides[side].skills.four[0] = coldId;
  state.calculationOptions.includeNegativeStatusSettlement = false;
  const disabled = await createSkillDamageRanking(options);
  expect(disabled.rows.find((entry) => entry.spirit.id === fixture.spirits[1].id).freezePercent).toBe(0);
  state.calculationOptions.includeNegativeStatusSettlement = true;
  expect(JSON.stringify(state)).toBe(before);
});
