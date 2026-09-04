import { describe, expect, test } from "vitest";
import {
  getStatusSkillTriggerPreview,
  getSkillStatusEffectInputs,
  resolveSkillStatusActivation,
} from "../../src/domain/skill-status-effects.js";

const skill = (name, extra = {}) => ({ name, ...extra });

describe("skill status effects", () => {
  test("减压阀暴露已使用次数供相邻技能结算", () => {
    expect(getSkillStatusEffectInputs(skill("减压阀"))).toEqual([
      expect.objectContaining({
        contextKey: "pressureValveUseCount",
        defaultValue: 0,
        label: "已使用次数",
        max: 20,
        min: 0,
        type: "number",
      }),
    ]);
  });

  test("贪婪每次增加10层吸血并读取萌芽层数", () => {
    expect(resolveSkillStatusActivation(skill("贪婪"))).toMatchObject({
      applied: true,
      operations: { lifestealPercent: 100 },
    });
    expect(
      resolveSkillStatusActivation(skill("贪婪"), { sproutStacks: 1 }),
    ).toMatchObject({
      applied: true,
      operations: { lifestealPercent: 110 },
    });
  });

  test("等价交换应对成功后增加5层吸血并读取萌芽层数", () => {
    const equivalentExchange = skill("等价交换", {
      category: "defense",
      description: "减伤90%，应对攻击：自己获得50%吸血。",
    });

    expect(resolveSkillStatusActivation(equivalentExchange, {
      defenseCounterSucceeded: false,
      sproutStacks: 1,
    })).toMatchObject({
      applied: true,
      operations: { defenseReductionPercent: 90 },
    });
    expect(resolveSkillStatusActivation(equivalentExchange, {
      defenseCounterSucceeded: true,
      sproutStacks: 1,
    })).toMatchObject({
      applied: true,
      operations: {
        defenseReductionPercent: 90,
        lifestealPercent: 60,
      },
    });
  });

  test("S3季中示弱应用速度永久+130", () => {
    expect(resolveSkillStatusActivation(skill("示弱"))).toMatchObject({
      applied: true,
      deltas: { ownSpeedFlat: 130 },
    });
  });

  test("S4状态技能应用后续伤害所需的连击与能力变化", () => {
    expect(resolveSkillStatusActivation(skill("惊鸿一瞥"))).toMatchObject({
      applied: true,
      deltas: { ownHitCountAdd: 1 },
    });
    expect(resolveSkillStatusActivation(skill("仰望夜空"))).toMatchObject({
      applied: true,
      deltas: { ownAttack: 7, ownDefense: 7 },
    });
  });

  test.each([
    [
      skill("蓄势待发", {
        category: "status",
        description: "自己获得1层蓄势印记。",
      }),
      { id: "momentum", polarity: "positive", stacks: 1, target: "self" },
    ],
    [
      skill("空间压迫", {
        category: "physical",
        description: "造成物伤，敌方获得1层星陨印记。",
      }),
      { id: "starfall", polarity: "negative", stacks: 1, target: "opponent" },
    ],
    [
      skill("加油", {
        category: "status",
        description: "自己获得1层萌芽印记。",
      }),
      { id: "sprout", polarity: "positive", stacks: 1, target: "self" },
    ],
    [
      skill("纺纱", {
        category: "status",
        description: "敌方获得1层暗涌印记。",
      }),
      { id: "undertow", polarity: "negative", stacks: 1, target: "opponent" },
    ],
  ])("点击 %s 应用描述中的确定印记", (selectedSkill, mark) => {
    expect(resolveSkillStatusActivation(selectedSkill)).toMatchObject({
      applied: true,
      operations: { markApplications: [mark] },
    });
  });

  test("不把应对、随机或动态印记条件当成普通点击效果", () => {
    expect(
      resolveSkillStatusActivation(skill("冥想", {
        category: "defense",
        description: "减伤80%，应对攻击：敌方获得2层星陨印记。",
      })),
    ).not.toMatchObject({ operations: { markApplications: expect.anything() } });
    expect(
      resolveSkillStatusActivation(skill("薄纱环", {
        category: "status",
        description: "选择：对手随机获得1种负面印记或自己随机获得1种正面印记。",
      })),
    ).toBeNull();
  });

  test("折射把携带技能的唯一系别效果交给统一状态入口", () => {
    expect(resolveSkillStatusActivation(skill("折射", { type: "光" }), {
      carriedSkills: [
        skill("折射", { type: "光" }),
        skill("追打", { type: "普通" }),
        skill("回旋风暴", { type: "翼" }),
      ],
    })).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 10, ownHitCountAdd: 1 },
      operations: { refractionTypes: ["普通", "翼"] },
    });
  });

  test("萌芽只为技能的自身正面增益追加固定单位", () => {
    expect(
      resolveSkillStatusActivation(skill("魔法增效"), { sproutStacks: 2 }),
    ).toMatchObject({
      deltas: { ownAttack: 9 },
    });
    expect(
      resolveSkillStatusActivation(skill("怒火"), { sproutStacks: 2 }),
    ).toMatchObject({
      deltas: { ownAttack: 14, ownDefense: -4 },
    });
    expect(
      resolveSkillStatusActivation(skill("羽化加速"), { sproutStacks: 1 }),
    ).toMatchObject({
      deltas: { ownFixedPower: 30 },
    });
    expect(
      resolveSkillStatusActivation(skill("热身运动"), { sproutStacks: 1 }),
    ).toMatchObject({
      deltas: { ownHitCountAdd: 4 },
    });
    expect(
      resolveSkillStatusActivation(skill("蒸汽进行曲"), {
        applyAttackBoost: true,
        applySpeedBoost: true,
        sproutStacks: 1,
      }),
    ).toMatchObject({
      deltas: { ownAttack: 10, ownSpeedFlat: 70 },
    });
  });

  test.each([
    ["快速移动", { counterDefenseSucceeded: false }, { ownSpeedFlat: 90 }],
    ["快速移动", { counterDefenseSucceeded: true }, { ownSpeedFlat: 170 }],
    ["伺机而动", {}, { ownFixedPower: 80 }],
    ["乘风", {}, { ownSpeedFlat: 130 }],
    ["示弱", {}, { ownSpeedFlat: 140 }],
    ["龙吟", {}, { ownAttack: 16, ownSpeedFlat: 90 }],
    ["嘲弄", { enemySwitchedThisTurn: true }, { ownAttack: 10, ownSpeedFlat: 80 }],
    ["钧势", {}, { ownDefense: 15, ownSpeedFlat: -30 }],
    ["沙石阵", {}, { ownDefense: 10, ownSpeedFlat: -20 }],
  ])("萌芽补齐状态技能 %s 的固定正面增益", (name, context, deltas) => {
    expect(
      resolveSkillStatusActivation(skill(name), {
        ...context,
        sproutStacks: 1,
      }),
    ).toMatchObject({ applied: true, deltas });
  });

  test.each([
    ["地陷", {}, { ownDefense: 8 }],
    ["地陷", { counterTriggered: true }, { ownDefense: 15 }],
    ["砂石冲撞", { enemySwitchedThisTurn: true }, { ownDefense: 11 }],
    ["崩拳", { counterTriggered: true }, { ownAttack: 11 }],
    ["超导加速", {}, { ownSpeedFlat: 40 }],
    ["坍缩", { defeatedEnemy: true }, { ownAttack: 8 }],
    ["跌落", {}, { ownAttack: -5 }],
    ["跌落", { counterTriggered: true }, { ownAttack: 6 }],
    ["焚毁", { dispelledMarkStacks: 3 }, { ownAttack: 7 }],
  ])("萌芽补齐攻击技能 %s 使用后的固定正面增益", (name, context, deltas) => {
    expect(
      resolveSkillStatusActivation(skill(name), {
        ...context,
        sproutStacks: 1,
      }),
    ).toMatchObject({ applied: true, deltas });
  });

  test("萌芽不放大对敌减益、减伤和印记应用", () => {
    expect(
      resolveSkillStatusActivation(skill("锐利眼神"), { sproutStacks: 5 }),
    ).toMatchObject({
      deltas: { targetDefense: -12 },
    });
    expect(
      resolveSkillStatusActivation(
        skill("有效预防", {
          category: "defense",
          description: "减伤50%，应对攻击：下一次行动获得先手+1。",
        }),
        { sproutStacks: 5 },
      ),
    ).toMatchObject({
      operations: { defenseReductionPercent: 50 },
    });
    expect(
      resolveSkillStatusActivation(
        skill("萌芽技能", { description: "自己获得1层萌芽印记。" }),
        { sproutStacks: 5 },
      ),
    ).toMatchObject({
      operations: {
        markApplications: [
          { id: "sprout", polarity: "positive", stacks: 1, target: "self" },
        ],
      },
    });
  });

  test("放晴和点亮每层萌芽增加十个百分点光系威力", () => {
    expect(
      resolveSkillStatusActivation(skill("放晴"), { sproutStacks: 1 }),
    ).toMatchObject({
      operations: { powerPercentForType: 0.6, powerPercentType: "光" },
    });
    expect(
      resolveSkillStatusActivation(skill("放晴"), {
        counterDefenseSucceeded: true,
        sproutStacks: 1,
      }),
    ).toMatchObject({
      operations: { powerPercentForType: 1.1, powerPercentType: "光" },
    });
    expect(
      resolveSkillStatusActivation(
        skill("点亮", {
          category: "defense",
          description: "减伤90%，应对攻击：自己获得光系技能威力永久+50%。",
        }),
        { defenseCounterSucceeded: true, sproutStacks: 1 },
      ),
    ).toMatchObject({
      operations: { powerPercentForType: 0.6, powerPercentType: "光" },
    });
  });

  test("暴风眼每层萌芽再增加百分之百连击", () => {
    expect(
      resolveSkillStatusActivation(skill("暴风眼"), { sproutStacks: 1 }),
    ).toMatchObject({
      operations: { hitCountPercentForAllAttacks: 2 },
    });
  });

  test("其他百分比威力不受萌芽影响", () => {
    const resolution = resolveSkillStatusActivation(
      skill("淬火", {
        category: "defense",
        description: "减伤80%，应对攻击：下次攻击技能威力翻倍。",
      }),
      { defenseCounterSucceeded: true, sproutStacks: 2 },
    );
    expect(resolution).toMatchObject({
      operations: { transientPowerPercentForAllAttacks: 1 },
    });
    expect(resolution.operations).not.toHaveProperty("fixedPowerOncePerType");
  });

  test("漫反射不读取萌芽加成", () => {
    expect(
      resolveSkillStatusActivation(skill("漫反射"), { sproutStacks: 3 }),
    ).toMatchObject({
      operations: { fixedPowerOncePerType: 35 },
    });
  });
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

  test("淬火在防御应对成功后让下次攻击技能威力翻倍", () => {
    const quench = skill("淬火", {
      category: "defense",
      description: "减伤80%，应对攻击：下次攻击技能威力翻倍。",
    });
    expect(getSkillStatusEffectInputs(quench)).toEqual([
      expect.objectContaining({
        key: "defenseCounterSucceeded",
        label: "防御应对成功",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(quench, {})).toMatchObject({
      applied: true,
      operations: { defenseReductionPercent: 80 },
    });
    expect(
      resolveSkillStatusActivation(quench, {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      operations: {
        defenseReductionPercent: 80,
        transientPowerPercentForAllAttacks: 1,
      },
    });
  });

  test("暖气只在应对成功后给下一次攻击增加50固定威力", () => {
    const warmAir = skill("暖气", {
      category: "defense",
      description: "减伤70%，应对攻击：下一次攻击时，技能威力+50。",
    });

    expect(getSkillStatusEffectInputs(warmAir)).toEqual([
      expect.objectContaining({
        key: "defenseCounterSucceeded",
        label: "防御应对成功",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(warmAir, {})).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 0 },
      operations: { defenseReductionPercent: 70 },
    });
    expect(
      resolveSkillStatusActivation(warmAir, {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 50 },
      operations: { defenseReductionPercent: 70 },
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
    ["三连破", { ownAttack: 9, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
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

  test("花炮按本次实际连击次数结算逐击增益", () => {
    expect(
      resolveSkillStatusActivation(skill("花炮"), { effectiveHitCount: 5 }),
    ).toMatchObject({
      applied: true,
      deltas: { ownAttack: 30 },
    });
    expect(resolveSkillStatusActivation(skill("花炮"))).toMatchObject({
      applied: true,
      deltas: { ownAttack: 12 },
    });
  });

  test("花炮将触发次数与每次连击数分开结算和预览", () => {
    expect(getStatusSkillTriggerPreview(skill("花炮", {
      basePower: 0,
      category: "status",
    }), {
      hitCount: 3,
      triggerCount: 2,
    })).toMatchObject({
      count: 2,
      cumulativeEffect: "己方双攻 +36层",
      defaultHitCount: 2,
      hitCount: 3,
      hitCountConfigurable: true,
      repeatable: true,
      unitEffect: "己方双攻 +18层",
    });
    expect(resolveSkillStatusActivation(skill("花炮", {
      basePower: 0,
      category: "status",
    }), {
      effectiveHitCount: 3,
      statusTriggerCount: 2,
    })).toMatchObject({
      deltas: { ownAttack: 36 },
    });
  });

  test("三连破每次连击增加三层攻击且默认三连击", () => {
    expect(resolveSkillStatusActivation(skill("三连破"))).toMatchObject({
      applied: true,
      deltas: { ownAttack: 9 },
    });
    expect(
      resolveSkillStatusActivation(skill("三连破"), { effectiveHitCount: 5 }),
    ).toMatchObject({
      applied: true,
      deltas: { ownAttack: 15 },
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
      deltas: { ownAttack: -5, ownDefense: -5 },
    });
    expect(
      resolveSkillStatusActivation(skill("暗箱操作"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { targetAttack: -12, targetDefense: -12 },
    });
  });

  test("Feather Acceleration and Ultrasonic Wave add persistent power to all skills", () => {
    expect(resolveSkillStatusActivation(skill("羽化加速"))).toMatchObject({
      deltas: { ownFixedPower: 20 },
    });
    expect(resolveSkillStatusActivation(skill("超声波"), {})).toMatchObject({
      deltas: { ownFixedPower: 20 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 20 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        choiceTrait: "有求必应",
        defenseCounterSucceeded: false,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 40 },
    });
    expect(
      resolveSkillStatusActivation(skill("超声波"), {
        choiceTrait: "一意孤行",
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      deltas: { ownFixedPower: 40 },
    });
  });

  test("撒娇为同侧全技能永久增加10威力，并受萌芽增幅", () => {
    expect(resolveSkillStatusActivation(skill("撒娇"), {})).toMatchObject({
      applied: true,
      deltas: { ownFixedPower: 10 },
    });
    expect(
      resolveSkillStatusActivation(skill("撒娇"), { sproutStacks: 2 }),
    ).toMatchObject({ deltas: { ownFixedPower: 30 } });
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
