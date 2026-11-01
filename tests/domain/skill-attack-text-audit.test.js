// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { resolveSkillStatusActivation } from "../../src/domain/skill-status-effects.js";

const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));

// 来自当期实体文案的人工审计期望；不导入生产效果表或从 resolver 反推分类。
const expected = [
  ["力量增效", "own", "physical", 10],
  ["魔法增效", "own", "magical", 7],
  ["咆哮", "target", "physical", -6],
  ["防反", "own", "both", 7, { defenseCounterSucceeded: true }],
  ["三连破", "own", "physical", 9],
  ["嗜痛", "own", "both", 8, { defenseCounterSucceeded: true, incomingHitCount: 2 }],
  ["缓一缓", "own", "magical", 1],
  ["氧输送", "own", "magical", 7],
  ["丰饶", "own", "both", 14],
  ["花炮", "own", "magical", 12],
  ["怒火", "own", "both", 12],
  ["焚毁", "own", "physical", 6, { dispelledMarkStacks: 3 }],
  ["焚尽", "own", "physical", 15, { dispelledMarkStacks: 3 }],
  ["润泽", "own", "magical", 19],
  ["水泡盾", "own", "magical", 7, { defenseCounterSucceeded: true }],
  ["啮合传递", "own", "physical", 8, { skillSlot: 3 }],
  ["蒸汽进行曲", "own", "physical", 9, { applyAttackBoost: true }],
  ["泥浆铠甲", "own", "physical", 6],
  ["刺盾", "target", "physical", -7, { defenseCounterSucceeded: true }],
  ["不动如山", "own", "physical", 5, { defenseCounterSucceeded: true }],
  ["龙吟", "own", "both", 15],
  ["麻痹", "target", "both", -7, { counterDefenseSucceeded: true }],
  ["电离爆破", "target", "magical", -2],
  ["以毒攻毒", "own", "magical", 6, { poisonStacks: 2 }],
  ["腐化", "target", "both", -6, { poisonStacks: 2 }],
  ["贮藏", "own", "both", 15, { zeroCostSkillCount: 2 }],
  ["崩拳", "own", "physical", 10, { counterTriggered: true }],
  ["破绽", "own", "physical", 7, { counterDefenseSucceeded: true }],
  ["气沉丹田", "own", "physical", 13],
  ["预备势", "own", "physical", 8],
  ["马步", "own", "physical", 15, { applyAttackBoost: true, attackerHpPercent: 100 }],
  ["耍赖", "own", "both", 1],
  ["嘲弄", "own", "magical", 9],
  ["极限撕裂", "own", "both", -5, { attackerHpPercent: 100 }],
  ["跌落", "own", "physical", -5],
  ["暗箱操作", "own", "both", -10],
  ["坍缩", "own", "magical", 7, { defeatedEnemy: true }],
];

const explicitAttackChange = /(物攻|魔攻|双攻|攻防).*[+\-＋－]/u;
const operationKeys = [
  "ownPhysicalAttackStageAdd", "ownMagicalAttackStageAdd",
  "targetPhysicalAttackStageAdd", "targetMagicalAttackStageAdd",
];
const skillByName = name => {
  const matches = snapshot.skills.filter(skill => skill.name === name);
  expect(matches, name).toHaveLength(1);
  return matches[0];
};

test("当期所有明确攻击增减文案均进入人工审核清单，新增技能不可静默漏算", () => {
  expect(snapshot.meta.seasonId).toBe("S3");
  const actualNames = snapshot.skills.filter(skill => explicitAttackChange.test(skill.description)).map(skill => skill.name);
  expect(actualNames.sort()).toEqual(expected.map(([name]) => name).sort());
});

test.each(expected)("%s：按独立文案口径仅影响 %s 的 %s 攻击", (name, side, stat, amount, context = {}) => {
  const skill = skillByName(name);
  const token = stat === "physical" ? "物攻" : stat === "magical" ? "魔攻" : /双攻|物攻和魔攻/u;
  expect(skill.description).toMatch(token);
  const result = resolveSkillStatusActivation(skill, { statusTriggerCount: 1, ...context });
  expect(result?.applied, skill.description).toBe(true);
  const sharedField = `${side}Attack`;
  const oppositeShared = side === "own" ? "targetAttack" : "ownAttack";
  expect(result.deltas[oppositeShared]).toBe(0);
  if (stat === "both") {
    expect(result.deltas[sharedField]).toBe(amount);
    for (const key of operationKeys) expect(result.operations[key] ?? 0, key).toBe(0);
  } else {
    expect(result.deltas[sharedField]).toBe(0);
    const expectedKey = `${side}${stat === "physical" ? "Physical" : "Magical"}AttackStageAdd`;
    for (const key of operationKeys) {
      expect(result.operations[key] ?? 0, key).toBe(key === expectedKey ? amount : 0);
    }
  }
});

test.each([[50, 0], [50.01, -5], [100, -5]])("极限撕裂当前生命 %s%%：使用后双攻变化 %s 层", (attackerHpPercent, amount) => {
  const result = resolveSkillStatusActivation(skillByName("极限撕裂"), { attackerHpPercent });
  expect(result).toMatchObject({ applied: amount !== 0, deltas: { ownAttack: amount, targetAttack: 0 } });
  for (const key of operationKeys) expect(result.operations[key] ?? 0).toBe(0);
});

test("跌落应对状态后仍只提高物攻；分维度不改变原有触发条件", () => {
  const result = resolveSkillStatusActivation(skillByName("跌落"), { counterTriggered: true });
  expect(result).toMatchObject({ deltas: { ownAttack: 0 }, operations: { ownPhysicalAttackStageAdd: 5 } });
  expect(result.operations.ownMagicalAttackStageAdd ?? 0).toBe(0);
});

test("焚毁使用本服真实描述决定单攻口径", () => {
  const skill = skillByName("焚毁");
  expect(skill.description).toContain("获得物攻+20%");
  const result = resolveSkillStatusActivation(skill, { dispelledMarkStacks: 2 });
  expect(result.deltas.ownAttack).toBe(0);
  expect(result.operations.ownPhysicalAttackStageAdd).toBe(4);
  expect(result.operations.ownMagicalAttackStageAdd ?? 0).toBe(0);
});

test("S3 不引入分光、矿物置换等 S5 独有技能及对应自动效果", () => {
  for (const name of ["分光", "矿物置换", "续杯", "画龙点睛"]) {
    expect(snapshot.skills.some(skill => skill.name === name)).toBe(false);
    for (const context of [{}, { teamDistinctTypeCount: 4 }]) {
      expect(resolveSkillStatusActivation({ name, category: "status", calculationRuleset: "s3-midseason-2026-08-13" }, context)).toBeNull();
    }
  }
});
