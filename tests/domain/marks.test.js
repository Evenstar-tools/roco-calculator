import { describe, expect, test } from "vitest";
import {
  createMarksState,
  MARK_DEFINITIONS,
  normalizeMarksState,
  resolveSkillMarkApplications,
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
  test("龙噬记录3能耗技能触发双攻+40%，并明确保持手动能力结算", () => {
    expect(
      MARK_DEFINITIONS.positive.find((mark) => mark.id === "dragon-bite"),
    ).toEqual({
      id: "dragon-bite",
      name: "龙噬",
      summary: "使用 3 能耗技能后双攻 +40%；当前由能力配置结算",
    });
  });

  test.each([
    ["momentum", 2, 0.6, 0],
    ["attack", 3, 0.3, 0],
  ])(
    "applies %s once per stack",
    (id, stacks, powerPercentAdd, fixedPowerAdd) => {
      const result = effects(id, stacks);
      expect(result.fixedPowerAdd).toBe(fixedPowerAdd);
      expect(result.powerPercentAdd).toBeCloseTo(powerPercentAdd);
    },
  );

  test("only applies charge stacks when burst is triggered", () => {
    expect(effects("charge", 4, { burstTriggered: false })).toMatchObject({
      fixedPowerAdd: 0,
    });
    expect(effects("charge", 4, { burstTriggered: true })).toMatchObject({
      fixedPowerAdd: 40,
    });
  });

  test("重组只接受普通或应对防御两档追加倍率", () => {
    expect(effects("reassembly", 1)).toMatchObject({
      reassemblyMultiplier: 1,
    });
    expect(effects("reassembly", 3)).toMatchObject({
      reassemblyMultiplier: 3,
    });
    expect(normalizeMarksState({
      attacker: {
        negative: { id: null, stacks: 0 },
        positive: { id: "reassembly", stacks: 2 },
      },
    }).attacker.positive).toEqual({ id: "reassembly", stacks: 1 });
  });

  test("reads the charge mark granted by 增程电池", () => {
    expect(
      resolveSkillMarkApplications({
        name: "增程电池",
        description: "自己获得1层蓄电印记。",
      }),
    ).toEqual([
      {
        id: "charge",
        polarity: "positive",
        stacks: 1,
        target: "self",
      },
    ]);
  });

  test("only applies tailwind when the attacker acts first", () => {
    expect(effects("tailwind", 2)).toMatchObject({
      hiddenPanelPowerPercentAdd: 0.4,
      powerPercentAdd: 0.4,
    });
    expect(
      effects("tailwind", 2, { actedBeforeEnemy: false }).powerPercentAdd,
    ).toBe(0);
    expect(effects("momentum", 1).hiddenPanelPowerPercentAdd).toBe(0);
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
