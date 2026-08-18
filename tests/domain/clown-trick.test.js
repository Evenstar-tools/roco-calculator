import { describe, expect, test } from "vitest";
import { resolveClownTrickDamage } from "../../src/domain/clown-trick.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";

const clownTrait = [{ id: "trait-clown", name: "戏耍" }];

describe("clown trick trait", () => {
  test("特性为攻防两侧提供同一套自身生命输入", () => {
    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(clownTrait[0], role)).toEqual([
        expect.objectContaining({
          contextKey: "attackerHpPercent",
          label: "自身生命百分比",
          max: 100,
          min: 0,
          type: "number",
        }),
      ]);
    }
  });

  test("100%吸血只按实际缺失生命转为真实伤害", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 150,
      attackerMaximumHp: 200,
      mainDamage: 120,
      skill: { name: "蝙蝠", description: "造成物伤，并吸血100%。" },
    })).toMatchObject({
      active: true,
      actualHealing: 50,
      damage: 50,
      lifestealPercent: 100,
      missingHp: 50,
      requestedHealing: 120,
    });
  });

  test("满血时溢出治疗不计入特性伤害", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 200,
      attackerMaximumHp: 200,
      mainDamage: 120,
      skill: { name: "蝙蝠", description: "造成物伤，并吸血100%。" },
    }).damage).toBe(0);
  });

  test("贪婪赋予的100%吸血可作用于普通攻击", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 160,
      attackerMaximumHp: 200,
      mainDamage: 70,
      persistentLifestealPercent: 100,
      skill: { name: "普通攻击", description: "造成物伤。" },
    })).toMatchObject({
      actualHealing: 40,
      damage: 40,
      lifestealPercent: 100,
    });
  });

  test("贪婪或等价交换提供的吸血与技能自带吸血相加", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 0,
      attackerMaximumHp: 500,
      mainDamage: 100,
      persistentLifestealPercent: 110,
      skill: { name: "蝙蝠", description: "造成物伤，并吸血100%。" },
    })).toMatchObject({
      lifestealPercent: 210,
      requestedHealing: 210,
    });
  });

  test("固定回复技能与应对回复只在条件成立时转为真伤", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 80,
      attackerMaximumHp: 200,
      mainDamage: 0,
      skill: { name: "休息回复", description: "自己回复30%生命。" },
    }).damage).toBe(60);

    const branch = {
      attackerTraits: clownTrait,
      attackerCurrentHp: 50,
      attackerMaximumHp: 200,
      mainDamage: 80,
      skill: {
        name: "抽枝",
        description: "造成物伤，应对状态：自己回复50%生命和5能量。",
      },
    };
    expect(resolveClownTrickDamage(branch).damage).toBe(0);
    expect(resolveClownTrickDamage({
      ...branch,
      context: { counterTriggered: true },
    }).damage).toBe(100);
  });

  test("光合治愈与吸血合并后只按缺失生命截断一次", () => {
    const result = resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 300,
      attackerMaximumHp: 400,
      externalHealingSources: [{ amount: 200, label: "光合治愈" }],
      mainDamage: 80,
      persistentLifestealPercent: 100,
      skill: { name: "普通攻击", description: "造成物伤。" },
    });

    expect(result).toMatchObject({
      actualHealing: 100,
      damage: 100,
      missingHp: 100,
      requestedHealing: 280,
    });
    expect(result.settlement.text).toContain("吸血 80 + 光合治愈 200");
  });
});
