import { describe, expect, test } from "vitest";
import { resolveClownTrickDamage } from "../../src/domain/clown-trick.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";

const clownTrait = [{ id: "trait-clown", name: "戏耍" }];

describe("戏耍特性", () => {
  test("特性提供自身生命百分比输入", () => {
    expect(getTraitEffectInputs(clownTrait[0], "attacker")).toEqual([
      expect.objectContaining({
        contextKey: "attackerHpPercent",
        label: "自身生命百分比",
        max: 100,
        min: 0,
        type: "number",
      }),
    ]);
  });

  test("吸血只按实际缺失生命转为真实伤害", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 150,
      attackerMaximumHp: 200,
      mainDamage: 120,
      skill: { description: "造成物伤，并吸血100%。" },
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
      skill: { description: "造成物伤，并吸血100%。" },
    }).damage).toBe(0);
  });

  test("持久吸血能力可以作用于普通攻击", () => {
    expect(resolveClownTrickDamage({
      attackerTraits: clownTrait,
      attackerCurrentHp: 160,
      attackerMaximumHp: 200,
      mainDamage: 70,
      persistentLifestealPercent: 100,
      skill: { description: "造成物伤。" },
    })).toMatchObject({
      actualHealing: 40,
      damage: 40,
      lifestealPercent: 100,
    });
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
