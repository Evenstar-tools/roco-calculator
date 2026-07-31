import { describe, expect, test } from "vitest";
import {
  createMarksState,
  normalizeMarksState,
  resolveSourceMarkEffects,
} from "../../src/domain/marks.js";

const physicalSkill = {
  basePower: 80,
  category: "physical",
  name: "测试技能",
  type: "普通",
};

function effects(id, stacks, overrides = {}) {
  return resolveSourceMarkEffects({
    attackerSpeed: 200,
    defenderSpeed: 150,
    marks: {
      negative: { id: null, stacks: 0 },
      positive: { id, stacks },
    },
    side: "attacker",
    skill: physicalSkill,
    ...overrides,
  });
}

describe("mark rules", () => {
  test.each([
    ["momentum", 2, 0.6, 0],
    ["attack", 3, 0.3, 0],
    ["charge", 4, 0, 40],
  ])(
    "applies %s once per stack",
    (id, stacks, powerPercentAdd, fixedPowerAdd) => {
      const result = effects(id, stacks);
      expect(result.fixedPowerAdd).toBe(fixedPowerAdd);
      expect(result.powerPercentAdd).toBeCloseTo(powerPercentAdd);
    },
  );

  test("only applies tailwind when the attacker acts first", () => {
    expect(effects("tailwind", 2).powerPercentAdd).toBe(0.4);
    expect(
      effects("tailwind", 2, { actedBeforeEnemy: false }).powerPercentAdd,
    ).toBe(0);
  });

  test("applies slow per stack and records non-damage marks without inventing damage", () => {
    const slow = resolveSourceMarkEffects({
      attackerSpeed: 200,
      defenderSpeed: 150,
      marks: {
        negative: { id: "slow", stacks: 3 },
        positive: { id: "wet", stacks: 2 },
      },
      side: "attacker",
      skill: physicalSkill,
    });

    expect(slow.speedPenalty).toBe(30);
    expect(slow.settlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          markId: "wet",
          status: "recorded",
        }),
        expect.objectContaining({
          markId: "slow",
          status: "applied",
          text: "减速 ×3 速度 -30",
        }),
      ]),
    );
  });

  test("normalizes one positive and one negative slot per side and caps stacks", () => {
    expect(
      normalizeMarksState({
        attacker: {
          negative: { id: "slow", stacks: 120 },
          positive: { id: "tailwind", stacks: 2.9 },
        },
        defender: {
          negative: { id: "unknown", stacks: 9 },
          positive: { id: null, stacks: 8 },
        },
      }),
    ).toEqual({
      attacker: {
        negative: { id: "slow", stacks: 99 },
        positive: { id: "tailwind", stacks: 2 },
      },
      defender: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
    });
    expect(createMarksState()).toEqual({
      attacker: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
      defender: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
    });
  });
});
