import { describe, expect, test } from "vitest";
import {
  resolveBaronGreed,
  resolveBaronGreedHitSequence,
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
    expect(resolveBaronGreed({
      attackerCurrentHp: 450,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      mainDamage: 200,
      skill: { description: "造成物伤。" },
    })).toMatchObject({
      active: true,
      attackLevelStageAdd: 2,
      effectiveLifestealPercent: 50,
      lifestealLevels: 5,
      missingHp: 50,
      overflowHealing: 50,
      requestedHealing: 100,
    });
  });

  test("目标剩余生命限制吸血与溢出回复", () => {
    expect(resolveBaronGreed({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      mainDamage: 500,
      persistentLifestealPercent: 50,
      skill: { description: "造成物伤。" },
      targetCurrentHp: 10,
    })).toMatchObject({
      attackLevelStageAdd: 0,
      effectiveLifestealPercent: 100,
      overflowHealing: 10,
      requestedHealing: 10,
    });
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

  test("技能自带吸血和已获得的吸血能力参与同一次回复，但不重复加入基础50%", () => {
    expect(resolveBaronGreed({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      mainDamage: 100,
      persistentLifestealPercent: 100,
      skill: { description: "造成物伤，并吸血100%。" },
    })).toMatchObject({
      attackLevelStageAdd: 10,
      effectiveLifestealPercent: 250,
      lifestealLevels: 15,
      overflowHealing: 250,
    });
  });

  test("下注明分支先扣除10%生命，再结算吸血与溢出回复", () => {
    const result = resolveBaronGreed({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      context: { betMode: "fixed" },
      mainDamage: 200,
      skill: {
        name: "下注",
        description:
          "造成物伤，选择：本次技能威力+40，使用后自己生命-10%或自己生命低于50%时本次技能威力+100。",
      },
    });
    expect(result).toMatchObject({
      actualHealing: 50,
      attackLevelStageAdd: 2,
      currentHpAfterHealing: 500,
      missingHp: 50,
      overflowHealing: 50,
      requestedHealing: 100,
      selfDamageBeforeHealing: 50,
    });
    expect(result.settlement.text).toContain("下注先扣 50 生命");
    expect(result.settlement.text).toContain("实际回复 50");
  });

  test("下注暗分支不扣血，不改变吸血与溢出回复", () => {
    expect(resolveBaronGreed({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      context: { attackerHpPercent: 49, betMode: "lowHp" },
      mainDamage: 200,
      skill: {
        name: "下注",
        description:
          "造成物伤，选择：本次技能威力+40，使用后自己生命-10%或自己生命低于50%时本次技能威力+100。",
      },
    })).toMatchObject({
      attackLevelStageAdd: 4,
      missingHp: 0,
      overflowHealing: 100,
      requestedHealing: 100,
      selfDamageBeforeHealing: 0,
    });
  });

  test("多段技能逐段吸血，溢出治疗增加的物攻从下一段开始生效", () => {
    const result = resolveBaronGreedHitSequence({
      attackerCurrentHp: 450,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      calculateHit: ({ attackLevelStageAdd }) =>
        100 + attackLevelStageAdd * 10,
      hitCount: 3,
      skill: { description: "造成物伤，3连击。" },
      targetCurrentHp: 1000,
    });

    expect(result).toMatchObject({
      active: true,
      attackLevelStageAdd: 4,
      hitDamages: [100, 100, 120],
      overflowHealing: 110,
      requestedHealing: 160,
      totalDamage: 320,
    });
  });

  test("逐段吸血只按目标每段实际损失生命结算", () => {
    const result = resolveBaronGreedHitSequence({
      attackerCurrentHp: 500,
      attackerMaximumHp: 500,
      attackerTraits: [baronTrait],
      calculateHit: ({ attackLevelStageAdd }) =>
        100 + attackLevelStageAdd * 10,
      hitCount: 3,
      skill: { description: "造成物伤，3连击。" },
      targetCurrentHp: 150,
    });

    expect(result).toMatchObject({
      attackLevelStageAdd: 3,
      hitDamages: [100, 120, 130],
      overflowHealing: 75,
      requestedHealing: 75,
    });
  });
});
