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

  expect(modifiers).toContainEqual(expect.objectContaining({
    amount: 115,
    label: "虫群突袭（5层）",
    source: "trait",
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
