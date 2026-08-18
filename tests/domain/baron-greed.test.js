import { describe, expect, test } from "vitest";
import {
  resolveBaronGreed,
  resolveLifestealCapability,
} from "../../src/domain/baron-greed.js";

const baronTrait = { name: "贪得无厌" };

describe("恶魔男爵贪得无厌", () => {
  test("常驻50%吸血计为5层，并与后续吸血能力相加", () => {
    expect(resolveLifestealCapability({
      persistentLifestealPercent: 110,
      traits: [baronTrait],
    })).toEqual({
      basePercent: 50,
      levels: 16,
      percent: 160,
    });
  });

  test("只把超过缺失生命的回复换算为后续物攻等级", () => {
    const result = resolveBaronGreed({
      attackerCurrentHp: 450,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      mainDamage: 200,
      skill: { description: "造成物伤。" },
    });

    expect(result).toMatchObject({
      active: true,
      attackLevelStageAdd: 2,
      effectiveLifestealPercent: 50,
      lifestealLevels: 5,
      missingHp: 50,
      overflowHealing: 50,
      requestedHealing: 100,
    });
    expect(result.settlement.text).toContain("后续物攻 +2级（+20%）");
  });

  test("不足完整5%最大生命的溢出回复不增加物攻等级", () => {
    expect(resolveBaronGreed({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      mainDamage: 49,
      skill: { description: "造成物伤。" },
    }).attackLevelStageAdd).toBe(0);
  });
});
