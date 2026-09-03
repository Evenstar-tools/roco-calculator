import { expect, test } from "vitest";
import { createSpeedModifiers } from "../../src/features/team-ability/domain/speed-modifiers.js";

test("只把当前配置携带的速度状态技能列为可选加速", () => {
  const snapshot = {
    skills: [
      { id: "quick", name: "快速移动", category: "status", basePower: 0 },
      { id: "taunt", name: "嘲弄", category: "status", basePower: 0 },
      { id: "attack", name: "普通攻击", category: "physical", basePower: 80 },
    ],
    traits: [],
  };
  const modifiers = createSpeedModifiers({
    configuration: { skills: { four: ["quick", "taunt", "attack", null] } },
    currentSpeed: 200,
    snapshot,
    spirit: { traitIds: [] },
  });

  expect(modifiers.map(({ amount, label }) => [label, amount])).toEqual([
    ["快速移动", 80],
    ["快速移动（应对防御成功）", 160],
    ["嘲弄（敌方本回合更换精灵）", 70],
  ]);
  expect(modifiers[0].groupId).toBe(modifiers[1].groupId);
});

test("特性触发速度复用项目规则并限制蜂后为五名队友", () => {
  const snapshot = {
    skills: [],
    traits: [{ id: "swarm", name: "虫群突袭" }],
  };
  const modifiers = createSpeedModifiers({
    configuration: { skills: { four: [] } },
    currentSpeed: 154,
    snapshot,
    spirit: { traitIds: ["swarm"] },
  });

  expect(modifiers.map(({ amount, label, stack }) => ({ amount, label, stack }))).toEqual([
    { amount: 23, label: "虫群突袭（1层）", stack: 1 },
    { amount: 46, label: "虫群突袭（2层）", stack: 2 },
    { amount: 69, label: "虫群突袭（3层）", stack: 3 },
    { amount: 92, label: "虫群突袭（4层）", stack: 4 },
    { amount: 115, label: "虫群突袭（5层）", stack: 5 },
  ]);
});

test("百分比速度逐层按最终百分比向下取整", () => {
  const modifiers = createSpeedModifiers({
    configuration: { skills: { four: [] } },
    currentSpeed: 223,
    snapshot: {
      skills: [],
      traits: [{ id: "partner", name: "最好的伙伴" }],
    },
    spirit: { traitIds: ["partner"] },
  });

  expect(modifiers.map(({ amount }) => amount)).toEqual([44, 89, 133, 178, 223]);
});

test("携带折射和电系技能时提供当前20点速度情景", () => {
  const modifiers = createSpeedModifiers({
    configuration: { skills: { four: ["refraction", "electric"] } },
    currentSpeed: 241,
    snapshot: {
      skills: [
        { id: "refraction", name: "折射", category: "magical", type: "光" },
        { id: "electric", name: "磁干扰", category: "magical", type: "电" },
      ],
      traits: [],
    },
    spirit: { traitIds: [] },
  });

  expect(modifiers).toContainEqual(expect.objectContaining({
    amount: 20,
    label: "折射（携带电系技能）",
    source: "skill",
  }));
});

test("契约的形状提供绝缘球速度情景", () => {
  const modifiers = createSpeedModifiers({
    configuration: { skills: { four: [] } },
    currentSpeed: 234,
    snapshot: {
      skills: [],
      traits: [{ id: "contract", name: "契约的形状" }],
    },
    spirit: { traitIds: ["contract"] },
  });

  expect(modifiers).toContainEqual(expect.objectContaining({
    amount: 50,
    label: "契约的形状（绝缘球）",
    source: "trait",
  }));
});
