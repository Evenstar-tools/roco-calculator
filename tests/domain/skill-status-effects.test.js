import { describe, expect, test } from "vitest";
import {
  getSkillStatusEffectInputs,
  resolveSkillStatusActivation,
} from "../../src/domain/skill-status-effects.js";

const skill = (name, extra = {}) => ({ name, ...extra });

describe("skill status effects", () => {
  test("防御技能点击后应用描述中的基础减伤", () => {
    expect(
      resolveSkillStatusActivation(
        skill("有效预防", {
          category: "defense",
          description: "减伤50%，应对攻击：下一次行动获得先手+1。",
        }),
      ),
    ).toMatchObject({
      applied: true,
      operations: { defenseReductionPercent: 50 },
    });
  });

  test("防御应对增益未触发时仍应用防御技能的基础减伤", () => {
    expect(
      resolveSkillStatusActivation(
        skill("水泡盾", {
          category: "defense",
          description: "减伤80%，应对攻击：自己获得魔攻+70%。",
        }),
      ),
    ).toMatchObject({
      applied: true,
      deltas: { ownAttack: 0 },
      operations: { defenseReductionPercent: 80 },
    });
  });

  test("非防御技能不从描述误提取减伤", () => {
    expect(
      resolveSkillStatusActivation(
        skill("测试攻击", {
          category: "physical",
          description: "命中后使敌方下次受到的伤害减伤50%。",
        }),
      ),
    ).toBeNull();
  });

  test.each([
    ["热身运动", 3],
    ["芳香诱引", 2],
  ])("%s adds a persistent hit-count bonus", (name, ownHitCountAdd) => {
    expect(resolveSkillStatusActivation(skill(name))).toMatchObject({
      applied: true,
      deltas: { ownHitCountAdd },
    });
  });

  test("羽翼庇护只在应对攻击成功后增加连击数", () => {
    expect(getSkillStatusEffectInputs(skill("羽翼庇护"))).toEqual([
      expect.objectContaining({
        key: "counterAttackSucceeded",
        label: "应对攻击成功",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(skill("羽翼庇护"), {})).toMatchObject({
      applied: false,
    });
    expect(
      resolveSkillStatusActivation(skill("羽翼庇护"), {
        counterAttackSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownHitCountAdd: 2 },
    });
  });

  test.each([
    ["咆哮", { ownAttack: 0, ownDefense: 0, targetAttack: -6, targetDefense: 0 }],
    ["锐利眼神", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -12 }],
    ["加固", { ownAttack: 0, ownDefense: 14, targetAttack: 0, targetDefense: 0 }],
    ["鼓劲", { ownAttack: 0, ownDefense: 17, targetAttack: 0, targetDefense: 0 }],
    ["三连破", { ownAttack: 3, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["缓一缓", { ownAttack: 1, ownDefense: 1, targetAttack: 0, targetDefense: 0 }],
    ["氧输送", { ownAttack: 7, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["丰饶", { ownAttack: 14, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["花炮", { ownAttack: 12, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["怒火", { ownAttack: 12, ownDefense: -4, targetAttack: 0, targetDefense: 0 }],
    ["润泽", { ownAttack: 19, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["钧势", { ownAttack: 0, ownDefense: 14, targetAttack: 0, targetDefense: 0 }],
    ["沙石阵", { ownAttack: 0, ownDefense: 9, targetAttack: 0, targetDefense: 0 }],
    ["霜冻", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -10 }],
    ["龙吟", { ownAttack: 15, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["电离爆破", { ownAttack: 0, ownDefense: 0, targetAttack: -2, targetDefense: 0 }],
    ["破防", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -7 }],
    ["气沉丹田", { ownAttack: 13, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["耍赖", { ownAttack: 1, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["嘲弄", { ownAttack: 9, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["魔镜", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -5 }],
  ])("%s maps single stats to the shared attack or defense stage", (name, expected) => {
    expect(resolveSkillStatusActivation(skill(name))).toMatchObject({
      applied: true,
      deltas: expected,
    });
  });

  test.each([
    ["防反", { ownAttack: 7, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["纤维化", { ownAttack: 0, ownDefense: 7, targetAttack: 0, targetDefense: 0 }],
    ["刺盾", { ownAttack: 0, ownDefense: 0, targetAttack: -7, targetDefense: 0 }],
    ["不动如山", { ownAttack: 5, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["虚化", { ownAttack: 0, ownDefense: 7, targetAttack: 0, targetDefense: 0 }],
  ])("%s only applies after a successful defense response", (name, expected) => {
    expect(resolveSkillStatusActivation(skill(name), {})).toMatchObject({
      applied: false,
    });
    expect(
      resolveSkillStatusActivation(skill(name), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: expected,
    });
  });

  test("status counters expose a checkbox and only add the conditional deltas when checked", () => {
    expect(getSkillStatusEffectInputs(skill("破绽"))).toEqual([
      expect.objectContaining({
        key: "counterDefenseSucceeded",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(skill("破绽"), {})).toMatchObject({
      deltas: {
        ownAttack: 0,
        targetDefense: -7,
      },
    });
    expect(
      resolveSkillStatusActivation(skill("破绽"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      deltas: {
        ownAttack: 7,
        targetDefense: -7,
      },
    });
    expect(
      resolveSkillStatusActivation(skill("麻痹"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      deltas: {
        targetAttack: -7,
      },
    });
  });

  test("uses the same stable skill namespace for status-skill controls", () => {
    const [control] = getSkillStatusEffectInputs(skill("防反"));
    expect([control]).toMatchObject([
      {
        contextKey: "defenseCounterSucceeded",
        id: expect.stringMatching(
          /^skill\.defenseCounterSucceeded\.[a-f0-9]{8}$/,
        ),
        scope: "slot",
        source: "skill",
      },
    ]);
    expect(
      resolveSkillStatusActivation(skill("防反"), {
        [control.id]: true,
      }),
    ).toMatchObject({ applied: true, deltas: { ownAttack: 7 } });
  });

  test("marks live HP inputs as battle context instead of skill-slot memory", () => {
    expect(getSkillStatusEffectInputs(skill("马步"))).toContainEqual(
      expect.objectContaining({
        contextKey: "attackerHpPercent",
        id: expect.stringMatching(/^skill\.attackerHpPercent\.[a-f0-9]{8}$/),
        scope: "battle",
      }),
    );
  });

  test("Wildfire only applies the selected defense-reduction branch", () => {
    expect(getSkillStatusEffectInputs(skill("野火"))).toEqual([
      expect.objectContaining({
        key: "applyDefenseReduction",
        label: "选择物防-90%（不勾为灼烧7层）",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(skill("野火"), {})).toMatchObject({
      applied: true,
      deltas: { targetDefense: 0 },
      operations: { appliedNonDamageStatus: true },
    });
    expect(
      resolveSkillStatusActivation(skill("野火"), {
        applyDefenseReduction: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { targetDefense: -9 },
    });
  });

  test("Gal applies Wildfire's other branch after the selected burn branch", () => {
    expect(
      resolveSkillStatusActivation(skill("野火"), {
        choiceTrait: "有求必应",
      }),
    ).toMatchObject({
      applied: true,
      deltas: { targetDefense: -9 },
      operations: { appliedNonDamageStatus: true },
    });
  });

  test("Steam March can apply either or both checked branches", () => {
    expect(getSkillStatusEffectInputs(skill("蒸汽进行曲"))).toEqual([
      expect.objectContaining({ key: "applySpeedBoost", type: "boolean" }),
      expect.objectContaining({ key: "applyAttackBoost", type: "boolean" }),
    ]);
    expect(
      resolveSkillStatusActivation(skill("蒸汽进行曲"), {
        applyAttackBoost: true,
        applySpeedBoost: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: {
        ownAttack: 9,
        ownSpeedFlat: 60,
      },
    });
  });

  test("Incinerate converts the entered dispelled-mark count into attack stages", () => {
    expect(getSkillStatusEffectInputs(skill("焚尽"))).toEqual([
      expect.objectContaining({
        key: "dispelledMarkStacks",
        max: 99,
        min: 0,
        type: "number",
      }),
    ]);
    expect(
      resolveSkillStatusActivation(skill("焚尽"), {
        dispelledMarkStacks: 3,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownAttack: 15 },
    });
  });

  test("Meshing Transfer always adds speed and only odd slots add attack", () => {
    expect(
      resolveSkillStatusActivation(skill("啮合传递"), { skillSlot: 1 }),
    ).toMatchObject({
      deltas: { ownAttack: 8, ownSpeedFlat: 30 },
    });
    expect(
      resolveSkillStatusActivation(skill("啮合传递"), { skillSlot: 2 }),
    ).toMatchObject({
      deltas: { ownAttack: 0, ownSpeedFlat: 30 },
    });
  });

  test("Mud Armor doubles all positive own buffs only after a defense response", () => {
    expect(resolveSkillStatusActivation(skill("泥浆铠甲"), {})).toMatchObject({
      deltas: { ownAttack: 6, ownDefense: 6 },
      operations: { doublePositiveOwnBuffs: false },
    });
    expect(
      resolveSkillStatusActivation(skill("泥浆铠甲"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { ownAttack: 6, ownDefense: 6 },
      operations: { doublePositiveOwnBuffs: true },
    });
  });

  test("Stone Skin lets the user apply the rise, the fall, or both", () => {
    expect(
      resolveSkillStatusActivation(skill("石肤术"), {
        applyDefenseDrop: false,
        applyDefenseRise: true,
      }),
    ).toMatchObject({ deltas: { ownDefense: 16 } });
    expect(
      resolveSkillStatusActivation(skill("石肤术"), {
        applyDefenseDrop: true,
        applyDefenseRise: false,
      }),
    ).toMatchObject({ deltas: { ownDefense: -6 } });
    expect(
      resolveSkillStatusActivation(skill("石肤术"), {
        applyDefenseDrop: true,
        applyDefenseRise: true,
      }),
    ).toMatchObject({ deltas: { ownDefense: 10 } });
  });

  test.each([
    ["以毒攻毒", { ownAttack: 12 }],
    ["腐化", { targetAttack: -12 }],
  ])("%s reads the entered poison stacks", (name, expected) => {
    expect(
      resolveSkillStatusActivation(skill(name), { poisonStacks: 4 }),
    ).toMatchObject({ deltas: expected });
  });

  test("Storage counts carried zero-cost skills and keeps its base gain", () => {
    expect(
      resolveSkillStatusActivation(skill("贮藏"), { zeroCostSkillCount: 4 }),
    ).toMatchObject({ deltas: { ownAttack: 25 } });
  });

  test("Horse Stance only grants attack on the checked high-health branch", () => {
    expect(
      resolveSkillStatusActivation(skill("马步"), {
        applyAttackBoost: true,
        attackerHpPercent: 80,
      }),
    ).toMatchObject({ applied: false });
    expect(
      resolveSkillStatusActivation(skill("马步"), {
        applyAttackBoost: true,
        attackerHpPercent: 81,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownAttack: 15 },
    });
  });

  test("Backroom Operation changes the debuff target after a defense response", () => {
    expect(resolveSkillStatusActivation(skill("暗箱操作"), {})).toMatchObject({
      deltas: { ownAttack: -10, ownDefense: -10 },
    });
    expect(
      resolveSkillStatusActivation(skill("暗箱操作"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { targetAttack: -10, targetDefense: -10 },
    });
  });

  test("Feather Acceleration and Ultrasonic Wave add persistent power to all skills", () => {
    expect(resolveSkillStatusActivation(skill("羽化加速"))).toMatchObject({
      deltas: { ownFixedPower: 20 },
    });
    expect(resolveSkillStatusActivation(skill("超声波"), {})).toMatchObject({
      deltas: { ownFixedPower: 30 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 50 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        choiceTrait: "有求必应",
        defenseCounterSucceeded: false,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 60 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        choiceTrait: "一意孤行",
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 80 },
    });
  });

  test("verified status skills add persistent power to attacking skills", () => {
    expect(resolveSkillStatusActivation(skill("化劲"))).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 40 },
    });
    expect(resolveSkillStatusActivation(skill("力量吞噬"))).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 20, targetFixedPower: -20 },
    });
    expect(resolveSkillStatusActivation(skill("盛开"), {})).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 30 },
    });
    expect(
      resolveSkillStatusActivation(skill("盛开"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 60 },
    });
    expect(resolveSkillStatusActivation(skill("提气"), {})).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 40 },
    });
    expect(
      resolveSkillStatusActivation(skill("提气"), { enemySwitched: true }),
    ).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 90 },
    });
    expect(resolveSkillStatusActivation(skill("防御反击"), {})).toMatchObject({
      applied: false,
    });
    expect(
      resolveSkillStatusActivation(skill("防御反击"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 40 },
    });
  });

  test("Diffuse Reflection grants 35 power to at most one attack skill per type", () => {
    expect(resolveSkillStatusActivation(skill("漫反射"))).toMatchObject({
      applied: true,
      operations: { fixedPowerOncePerType: 35 },
    });
  });

  test("Sunny and Light Up add persistent percentage power only to light skills", () => {
    expect(resolveSkillStatusActivation(skill("放晴"), {})).toMatchObject({
      applied: true,
      operations: { powerPercentForType: 0.5, powerPercentType: "光" },
    });
    expect(
      resolveSkillStatusActivation(skill("放晴"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      operations: { powerPercentForType: 1, powerPercentType: "光" },
    });
    expect(resolveSkillStatusActivation(skill("点亮"), {})).toMatchObject({
      applied: false,
    });
    expect(
      resolveSkillStatusActivation(skill("点亮"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      operations: { powerPercentForType: 0.5, powerPercentType: "光" },
    });
  });

  test("Jal repeats the other choice while Dark Jal repeats the selected choice", () => {
    expect(
      resolveSkillStatusActivation(skill("蒸汽进行曲"), {
        applyAttackBoost: true,
        choiceTrait: "有求必应",
      }),
    ).toMatchObject({
      deltas: { ownAttack: 9, ownSpeedFlat: 60 },
    });
    expect(
      resolveSkillStatusActivation(skill("蒸汽进行曲"), {
        applyAttackBoost: true,
        choiceTrait: "一意孤行",
      }),
    ).toMatchObject({
      deltas: { ownAttack: 18, ownSpeedFlat: 0 },
    });
    expect(
      resolveSkillStatusActivation(skill("马步"), {
        applyAttackBoost: false,
        attackerHpPercent: 100,
        choiceTrait: "有求必应",
      }),
    ).toMatchObject({ deltas: { ownAttack: 15 } });
    expect(
      resolveSkillStatusActivation(skill("马步"), {
        applyAttackBoost: true,
        attackerHpPercent: 100,
        choiceTrait: "一意孤行",
      }),
    ).toMatchObject({ deltas: { ownAttack: 30 } });
    expect(
      resolveSkillStatusActivation(skill("沙石阵"), {
        choiceTrait: "有求必应",
      }),
    ).toMatchObject({ deltas: { ownDefense: 18 } });
    expect(
      resolveSkillStatusActivation(skill("沙石阵"), {
        choiceTrait: "一意孤行",
      }),
    ).toMatchObject({ deltas: { ownDefense: 18 } });
  });
});
