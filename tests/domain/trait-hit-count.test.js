import { describe, expect, test } from "vitest";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import {
  resolveGlobalFixedHitCount,
  resolveTraitHitCountBonus,
} from "../../src/domain/trait-hit-count.js";

const erosion = {
  id: "trait_erosion",
  name: "侵蚀",
  description: "敌方每有1层中毒效果，自己获得连击数+1。",
};
const windCombo = {
  id: "trait_wind_combo",
  name: "乘风连击",
  description: "使用翼系技能后，获得连击数+1。",
};
const kakaSprint = {
  id: "trait_kaka_sprint",
  name: "咔咔冲刺",
  description: "若先于敌方行动，行动后获得连击数+1。",
};
const blameShift = {
  id: "trait_blame_shift",
  name: "嫁祸",
  description: "自己每失去25%生命，连击数+2。",
};
const freeFlight = {
  id: "trait_free_flight",
  name: "自由飘",
  description: "自己每有1层萌化，获得连击数+3。",
};
const indiscriminateFilter = {
  id: "trait_indiscriminate_filter",
  name: "无差别过滤",
  description: "在场时，所有精灵连击数固定为2。",
};

const comboAttack = {
  category: "physical",
  description: "造成物伤，3连击。",
  name: "撕咬",
};
const singleAttack = {
  category: "physical",
  description: "造成物理伤害。",
  name: "单段攻击",
};
const comboStatus = {
  category: "status",
  description: "自己获得物攻+30%，3连击。",
  name: "三连破",
};
const warmup = {
  category: "status",
  description: "自己获得连击数+3。",
  name: "热身运动",
};

function traitContext(trait, values) {
  return Object.fromEntries(
    getTraitEffectInputs(trait, "attacker").map((control) => [
      control.id,
      values[control.contextKey] ?? control.defaultValue,
    ]),
  );
}

describe("resolveTraitHitCountBonus", () => {
  test("无差别过滤提供攻防共用的勾选项，勾选后全场连击固定为2", () => {
    const attackerControl = getTraitEffectInputs(
      indiscriminateFilter,
      "attacker",
    )[0];
    const defenderControl = getTraitEffectInputs(
      indiscriminateFilter,
      "defender",
    )[0];

    expect(attackerControl).toMatchObject({
      contextKey: "indiscriminateFilterActivated",
      label: "触发无差别过滤",
      type: "boolean",
    });
    expect(defenderControl).toMatchObject({
      contextKey: "indiscriminateFilterActivated",
      label: "触发无差别过滤",
      type: "boolean",
    });
    expect(
      resolveGlobalFixedHitCount({
        attackerTraits: [indiscriminateFilter],
        context: { [attackerControl.id]: true },
        defenderTraits: [],
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCount: 2, traitName: "无差别过滤" });
    expect(
      resolveGlobalFixedHitCount({
        attackerTraits: [],
        context: { [defenderControl.id]: true },
        defenderTraits: [indiscriminateFilter],
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCount: 2, traitName: "无差别过滤" });
    expect(
      resolveGlobalFixedHitCount({
        attackerTraits: [indiscriminateFilter],
        context: { [attackerControl.id]: false },
        defenderTraits: [],
        skill: comboAttack,
      }),
    ).toBeNull();
  });

  test("无差别过滤不作用于未声明连击的技能", () => {
    const attackerControl = getTraitEffectInputs(
      indiscriminateFilter,
      "attacker",
    )[0];

    expect(
      resolveGlobalFixedHitCount({
        attackerTraits: [indiscriminateFilter],
        context: { [attackerControl.id]: true },
        defenderTraits: [],
        skill: singleAttack,
      }),
    ).toBeNull();
    expect(
      resolveGlobalFixedHitCount({
        attackerTraits: [indiscriminateFilter],
        context: { [attackerControl.id]: true },
        defenderTraits: [],
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCount: 2, traitName: "无差别过滤" });
  });

  test("侵蚀需要勾选后才按敌方中毒层数增加连击", () => {
    expect(
      resolveTraitHitCountBonus({
        traits: [erosion],
        context: traitContext(erosion, {
          enemyPoisonStacks: 3,
          traitHitCountActivated: false,
        }),
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCountAdd: 0 });

    expect(
      resolveTraitHitCountBonus({
        traits: [erosion],
        context: traitContext(erosion, {
          enemyPoisonStacks: 3,
          traitHitCountActivated: true,
        }),
        skill: comboAttack,
      }),
    ).toMatchObject({
      hitCountAdd: 3,
      steps: [expect.objectContaining({ label: "侵蚀连击", after: 3 })],
    });
  });

  test.each([
    [windCombo, "windSkillUseCount", 4, "乘风连击"],
    [kakaSprint, "actedFirstCount", 3, "咔咔冲刺连击"],
  ])("%s 按记录次数增加连击", (trait, countKey, count, label) => {
    const context = traitContext(trait, {
      [countKey]: count,
      traitHitCountActivated: true,
    });
    expect(
      resolveTraitHitCountBonus({ traits: [trait], context, skill: comboAttack }),
    ).toMatchObject({
      hitCountAdd: count,
      steps: [expect.objectContaining({ label, after: count })],
    });
  });

  test.each([windCombo, kakaSprint])(
    "%s 未勾选时不增加连击",
    (trait) => {
      const context = traitContext(trait, {
        actedFirstCount: 5,
        traitHitCountActivated: false,
        windSkillUseCount: 5,
      });
      expect(
        resolveTraitHitCountBonus({ traits: [trait], context, skill: comboAttack }),
      ).toMatchObject({ hitCountAdd: 0 });
    },
  );

  test("明确声明连击的状态技能生效，但热身运动自身不生效", () => {
    const context = traitContext(erosion, {
      enemyPoisonStacks: 3,
      traitHitCountActivated: true,
    });
    expect(
      resolveTraitHitCountBonus({ traits: [erosion], context, skill: comboStatus }),
    ).toMatchObject({ hitCountAdd: 3 });
    expect(
      resolveTraitHitCountBonus({ traits: [erosion], context, skill: warmup }),
    ).toMatchObject({ hitCountAdd: 0 });
  });

  test.each([
    [100, 0],
    [75.1, 0],
    [75, 2],
    [50, 4],
    [25, 6],
    [0, 8],
  ])("嫁祸在当前生命 %s%% 时增加 %s 次连击", (attackerHpPercent, expected) => {
    const trigger = getTraitEffectInputs(blameShift, "attacker").find(
      (control) => control.contextKey === "traitHitCountActivated",
    );
    const context = {
      [trigger.id]: true,
      attackerHpPercent,
    };
    expect(
      resolveTraitHitCountBonus({
        traits: [blameShift],
        context,
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCountAdd: expected });
  });

  test("嫁祸未触发时不增加连击", () => {
    expect(
      resolveTraitHitCountBonus({
        traits: [blameShift],
        context: traitContext(blameShift, {
          attackerHpPercent: 25,
          traitHitCountActivated: false,
        }),
        skill: comboAttack,
      }),
    ).toMatchObject({ hitCountAdd: 0 });
  });

  test("魔眷鸟自由飘不进入本次特性解析", () => {
    expect(
      resolveTraitHitCountBonus({
        traits: [freeFlight],
        context: { attackerHpPercent: 0, traitHitCountActivated: true },
        skill: comboAttack,
      }),
    ).toEqual({ hitCountAdd: 0, sources: [], steps: [] });
  });
});
