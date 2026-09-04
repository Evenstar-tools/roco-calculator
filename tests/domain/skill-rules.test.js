import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import {
  getDefaultHitCount,
  getSkillEffectInputs,
  getSkillEffectRule,
} from "../../src/domain/skill-effects.js";
import { resolveSkillPower } from "../../src/domain/skill-rules.js";

function skill(overrides = {}) {
  return {
    id: "skill_fixture",
    name: "测试技能",
    type: "普通",
    category: "physical",
    basePower: 80,
    ruleId: null,
    ruleParams: null,
    ...overrides,
  };
}

describe("resolveSkillPower", () => {
  test.each([
    ["天旋地转", 90, 60],
    ["电弧", 120, 80],
    ["引雷", 55, 35],
  ])("%s 的迸发默认开启并可手动关闭", (name, enabledPower, disabledPower) => {
    const burstSkill = snapshot.skills.find((candidate) => candidate.name === name);
    const burstControl = getSkillEffectInputs(burstSkill).find(
      (input) => input.contextKey === "burstTriggered",
    );

    expect(burstControl).toMatchObject({
      defaultValue: true,
      label: "触发迸发",
      type: "boolean",
    });
    expect(resolveSkillPower(burstSkill, {})).toMatchObject({ value: enabledPower });
    expect(resolveSkillPower(burstSkill, { burstTriggered: false })).toMatchObject({
      value: disabledPower,
    });
  });

  test("雷暴按已选迸发来源自动计数，并保留手动种类数", () => {
    const thunderstorm = snapshot.skills.find(
      (candidate) => candidate.name === "雷暴",
    );
    const inputs = getSkillEffectInputs(thunderstorm);

    expect(inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextKey: "burstTriggered",
          defaultValue: true,
          label: "触发迸发",
        }),
        expect.objectContaining({
          contextKey: "activeBurstKinds",
          defaultValue: 0,
          label: "迸发种类数",
        }),
      ]),
    );
    expect(
      inputs
        .filter((input) => input.burstSource)
        .map(({ burstGroup, contextKey, label }) => ({
          burstGroup,
          contextKey,
          label,
        })),
    ).toEqual([
      { burstGroup: "特性", contextKey: "burstSourceBioelectric", label: "生物电" },
      { burstGroup: "特性", contextKey: "burstSourceCurrentStimulus", label: "电流刺激" },
      { burstGroup: "特性", contextKey: "burstSourceOverload", label: "超负荷" },
      { burstGroup: "特性", contextKey: "burstSourceContinuousLoad", label: "连续负荷" },
      { burstGroup: "技能", contextKey: "burstSourceHeavenSpin", label: "天旋地转" },
      { burstGroup: "技能", contextKey: "burstSourceArc", label: "电弧" },
      { burstGroup: "技能", contextKey: "burstSourceSuperconduct", label: "超导" },
      { burstGroup: "技能", contextKey: "burstSourceLightningGuide", label: "引雷" },
      { burstGroup: "技能", contextKey: "burstSourceDoublePulse", label: "双联脉冲" },
      { burstGroup: "印记", contextKey: "burstSourceChargeMark", label: "蓄电" },
    ]);
    expect(
      inputs.find((input) => input.contextKey === "burstSourceSuperconduct"),
    ).toMatchObject({ burstDescription: "本技能能耗 -2。" });
    expect(
      inputs.find((input) => input.contextKey === "burstSourceBioelectric"),
    ).toMatchObject({ burstDescription: "携带的电系技能获得迸发：能耗 -2。" });

    for (const [
      label,
      context,
      value,
      resolvedCost,
      activeBurstKinds,
      inheritedCostReduction,
      selectedBurstSources,
    ] of [
      ["无来源", {}, 55, 1, 0, 0, []],
      [
        "普通来源",
        { burstSourceDoublePulse: true },
        65,
        2,
        1,
        0,
        ["burstSourceDoublePulse"],
      ],
      [
        "生物电来源",
        { burstSourceBioelectric: true },
        65,
        0,
        1,
        2,
        ["burstSourceBioelectric"],
      ],
      [
        "电流刺激来源",
        { burstSourceCurrentStimulus: true },
        65,
        2,
        1,
        0,
        ["burstSourceCurrentStimulus"],
      ],
      [
        "超导来源",
        { burstSourceSuperconduct: true },
        65,
        0,
        1,
        2,
        ["burstSourceSuperconduct"],
      ],
      [
        "普通来源与超导来源混合",
        {
          burstSourceDoublePulse: true,
          burstSourceSuperconduct: true,
        },
        75,
        1,
        2,
        2,
        ["burstSourceSuperconduct", "burstSourceDoublePulse"],
      ],
    ]) {
      expect(resolveSkillPower(thunderstorm, context), label).toMatchObject({
        activeBurstKinds,
        inheritedCostReduction,
        resolvedCost,
        selectedBurstSources,
        value,
      });
    }

    expect(resolveSkillPower(thunderstorm, {
      burstSourceCurrentStimulus: true,
    })).toMatchObject({ inheritedFixedPowerAdd: 40, value: 65 });
    for (const [contextKey, inheritedFixedPowerAdd] of [
      ["burstSourceHeavenSpin", 30],
      ["burstSourceArc", 40],
      ["burstSourceLightningGuide", 20],
    ]) {
      expect(resolveSkillPower(thunderstorm, {
        [contextKey]: true,
      })).toMatchObject({ inheritedFixedPowerAdd, value: 65 });
    }

    expect(
      resolveSkillPower({ ...thunderstorm, cost: 0 }, {
        burstSourceSuperconduct: true,
      }),
    ).toMatchObject({
      activeBurstKinds: 1,
      inheritedCostReduction: 2,
      resolvedCost: 0,
      value: 65,
    });

    expect(
      resolveSkillPower(thunderstorm, {
        activeBurstKinds: 0,
        burstSourceBioelectric: true,
        burstSourceDoublePulse: true,
      }),
    ).toMatchObject({
      inheritedCostReduction: 2,
      resolvedCost: 1,
      value: 75,
    });
    expect(resolveSkillPower(thunderstorm, { activeBurstKinds: 3 })).toMatchObject({
      value: 85,
    });
    expect(
      resolveSkillPower(thunderstorm, {
        activeBurstKinds: 3,
        burstSourceSuperconduct: true,
      }),
    ).toMatchObject({
      activeBurstKinds: 3,
      inheritedCostReduction: 2,
      resolvedCost: 2,
      value: 85,
    });
    expect(
      resolveSkillPower(thunderstorm, {
        activeBurstKinds: 1,
        burstSourceBioelectric: true,
        burstSourceDoublePulse: true,
      }),
    ).toMatchObject({ value: 75 });
    expect(
      resolveSkillPower(thunderstorm, {
        activeBurstKinds: 3,
        burstTriggered: false,
        burstSourceSuperconduct: true,
      }),
    ).toMatchObject({
      activeBurstKinds: 0,
      inheritedCostReduction: 0,
      resolvedCost: 1,
      value: 55,
    });

    expect(
      resolveSkillPower(thunderstorm, {
        burstSourceDoublePulse: true,
        burstSourceSuperconduct: true,
      }).steps,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        after: 3,
        before: 1,
        label: "迸发种类能耗增加",
      }),
      expect.objectContaining({
        after: 1,
        before: 3,
        label: "继承迸发能耗降低",
      }),
    ]));
  });

  test("超导迸发默认将本次能耗降低2，且可关闭", () => {
    const superconduct = snapshot.skills.find(
      (candidate) => candidate.name === "超导",
    );
    expect(getSkillEffectInputs(superconduct)).toMatchObject([
      {
        contextKey: "burstTriggered",
        defaultValue: true,
        label: "触发迸发",
        type: "boolean",
      },
    ]);
    expect(resolveSkillPower(superconduct, {})).toMatchObject({
      resolvedCost: 1,
      ruleSource: "feishu-doc:season-announcement-revision-11",
      value: 90,
    });
    expect(
      resolveSkillPower(superconduct, { burstTriggered: false }),
    ).toMatchObject({ resolvedCost: 3, value: 90 });
  });

  test("reads the declared default hit count from every skill description", () => {
    expect(
      getDefaultHitCount(
        skill({
          description: "造成魔伤，5连击。",
          name: "乱打",
        }),
      ),
    ).toBe(5);
    expect(getDefaultHitCount(skill())).toBe(1);
  });

  test("returns an exact resolution for fixed-power attacks", () => {
    expect(resolveSkillPower(skill(), {})).toEqual({
      status: "exact",
      value: 80,
      inputs: [],
      steps: [],
    });
  });

  test("炙热波动勾选应对后威力和灼烧层数同时翻倍", () => {
    const blazingWave = snapshot.skills.find(
      (candidate) => candidate.name === "炙热波动",
    );

    expect(getSkillEffectInputs(blazingWave)).toMatchObject([
      {
        contextKey: "counterTriggered",
        label: "触发应对",
        type: "boolean",
      },
    ]);
    expect(resolveSkillPower(blazingWave, {})).toMatchObject({
      appliedBurnStacks: 4,
      status: "exact",
      value: 55,
    });
    expect(
      resolveSkillPower(blazingWave, { counterTriggered: true }),
    ).toMatchObject({
      appliedBurnStacks: 8,
      status: "exact",
      value: 110,
      steps: [
        expect.objectContaining({
          label: "应对：威力 ×2，灼烧 4→8层",
        }),
      ],
    });
  });

  test("keeps Color Dispersion at 80 power and exposes its mixed-blood damage bonus", () => {
    const colorDispersion = skill({
      category: "magical",
      description: "造成魔伤，对混血精灵造成伤害+50%。",
      name: "色散",
      type: "光",
    });

    expect(getSkillEffectInputs(colorDispersion)).toEqual([
      expect.objectContaining({
        key: "enemyIsMixedBloodline",
        label: "目标为混血精灵",
        type: "boolean",
      }),
    ]);
    expect(
      resolveSkillPower(colorDispersion, {
        enemyIsMixedBloodline: true,
      }),
    ).toMatchObject({
      finalDamageMultiplier: 1.5,
      status: "exact",
      value: 80,
    });
    expect(
      resolveSkillPower(colorDispersion, {
        basePowerOverride: 100,
        enemyIsMixedBloodline: true,
      }),
    ).toMatchObject({
      finalDamageMultiplier: 1.5,
      status: "exact",
      value: 100,
    });
  });

  test("铁蒺藜应对成功只翻倍最终伤害，不改技能威力", () => {
    const caltrop = snapshot.skills.find(
      (candidate) => candidate.name === "铁蒺藜",
    );

    expect(resolveSkillPower(caltrop, { counterTriggered: true })).toMatchObject({
      finalDamageMultiplier: 2,
      status: "exact",
      value: 85,
    });
  });

  test("exposes stable slot control ids and accepts the stable value in calculations", () => {
    const colorDispersion = skill({
      category: "magical",
      description: "造成魔伤，对混血精灵造成伤害+50%。",
      name: "色散",
      type: "光",
    });

    const [control] = getSkillEffectInputs(colorDispersion);
    expect([control]).toMatchObject([
      {
        contextKey: "enemyIsMixedBloodline",
        id: expect.stringMatching(
          /^skill\.enemyIsMixedBloodline\.[a-f0-9]{8}$/,
        ),
        scope: "slot",
        source: "skill",
      },
    ]);
    expect(
      resolveSkillPower(colorDispersion, {
        [control.id]: true,
      }),
    ).toMatchObject({ finalDamageMultiplier: 1.5, status: "exact" });
  });

  test("resolves Flash Strike from the speed difference table", () => {
    expect(
      resolveSkillPower(
        skill({ name: "闪击", ruleId: "speed_difference" }),
        { attackerSpeed: 260, defenderSpeed: 180 },
      ),
    ).toMatchObject({ status: "exact", value: 120 });
  });

  test.each([
    [-1, 60],
    [0, 60],
    [1, 80],
    [30, 80],
    [31, 100],
    [33, 100],
    [60, 100],
    [61, 120],
    [90, 120],
    [91, 140],
    [120, 140],
    [121, 150],
    [150, 150],
    [151, 160],
    [180, 160],
    [181, 170],
    [210, 170],
    [211, 180],
    [240, 180],
    [241, 190],
    [270, 190],
    [271, 200],
  ])(
    "uses the reviewed difference table at %i for power %i",
    (difference, power) => {
      const flashStrike = snapshot.skills.find(({ name }) => name === "闪击");
      const sandTrap = snapshot.skills.find(
        ({ name }) => name === "鸣沙陷阱",
      );

      expect(
        resolveSkillPower(flashStrike, {
          attackerSpeed: 200 + difference,
          defenderSpeed: 200,
        }),
      ).toMatchObject({ status: "exact", value: power });
      expect(
        resolveSkillPower(sandTrap, {
          attackerPhysicalDefense: 200 + difference,
          defenderPhysicalDefense: 200,
        }),
      ).toMatchObject({ status: "exact", value: power });
    },
  );

  test("defaults Mana Burst to ten energy instead of blocking damage", () => {
    expect(
      resolveSkillPower(
        skill({ name: "魔能爆", ruleId: "mana_burst" }),
        {},
      ),
    ).toMatchObject({
      status: "exact",
      value: 210,
      steps: [{ input: 10, after: 210 }],
    });
  });

  test("caps Mana Burst power at ten energy without clamping the input", () => {
    expect(
      resolveSkillPower(
        skill({ name: "魔能爆", ruleId: "mana_burst" }),
        { energy: 99 },
      ),
    ).toMatchObject({
      status: "exact",
      value: 210,
      steps: [{ input: 10, after: 210 }],
    });
  });

  test.each([
    ["<4", 160],
    ["4~13", 140],
    ["14~29", 120],
    ["30~59", 100],
    ["60~119", 90],
    ["120+", 80],
  ])("吨位压制在%s挡位为%i威力", (tier, power) => {
    const weightPressure = snapshot.skills.find(
      (candidate) => candidate.name === "吨位压制",
    );

    expect(getSkillEffectInputs(weightPressure)).toEqual([
      expect.objectContaining({
        contextKey: "targetWeightTier",
        defaultValue: "30~59",
        label: "敌方体重挡位",
        type: "choice",
      }),
    ]);
    expect(
      resolveSkillPower(weightPressure, { targetWeightTier: tier }),
    ).toMatchObject({ status: "exact", value: power });
  });

  test.each([
    ["<4", 80],
    ["4~13", 90],
    ["14~29", 100],
    ["30~59", 120],
    ["60~119", 140],
    ["120+", 160],
  ])("以重制重在%s挡位为%i威力", (tier, power) => {
    const weightReversal = snapshot.skills.find(
      (candidate) => candidate.name === "以重制重",
    );

    expect(
      resolveSkillPower(weightReversal, { targetWeightTier: tier }),
    ).toMatchObject({ status: "exact", value: power });
  });

  test.each([
    ["0~10", 20],
    ["11~20", 40],
    ["21~30", 60],
    ["31~60", 80],
    ["61~100", 100],
    ["101+", 120],
  ])("砂糖弹球在%s挡位为%i威力", (tier, power) => {
    const sugarPinball = snapshot.skills.find(
      (candidate) => candidate.name === "砂糖弹球",
    );

    expect(
      resolveSkillPower(sugarPinball, { weightDifferenceTier: tier }),
    ).toMatchObject({ status: "exact", value: power });
  });

  test.each([
    ["吨位压制", 100],
    ["以重制重", 120],
    ["砂糖弹球", 80],
  ])("%s默认使用官方名义威力%i", (name, power) => {
    const reviewedSkill = snapshot.skills.find((candidate) => candidate.name === name);

    expect(resolveSkillPower(reviewedSkill, {})).toMatchObject({
      status: "exact",
      value: power,
    });
  });

  test.each([
    [0, 45],
    [1, 70],
    [2, 90],
    [3, 110],
    [4, 135],
    [5, 155],
    [6, 165],
    [7, 180],
    [8, 190],
    [9, 200],
    [10, 210],
  ])("resolves Mana Burst at %i energy to %i power", (energy, power) => {
    expect(
      resolveSkillPower(
        skill({ name: "魔能爆", ruleId: "mana_burst" }),
        { energy },
      ),
    ).toMatchObject({ status: "exact", value: power });
  });

  test("resolves Ice Sweep from the defender's four carried skill costs", () => {
    expect(
      resolveSkillPower(
        skill({ basePower: 1, name: "冰锋横扫" }),
        { enemyTotalSkillCost: 10 },
      ),
    ).toMatchObject({ status: "exact", value: 100 });
  });

  test("boosts Wish Power when the target uses a status skill", () => {
    const wishPower = skill({ basePower: 80, name: "愿力冲击" });

    expect(resolveSkillPower(wishPower, {})).toMatchObject({
      status: "exact",
      value: 80,
    });
    expect(
      resolveSkillPower(wishPower, { enemyUsedStatusSkill: true }),
    ).toMatchObject({
      status: "exact",
      value: 200,
    });
  });

  test("composes Wish Power target-status multiplier with manual base power", () => {
    const wishPower = skill({ basePower: 80, name: "愿力冲击" });

    expect(
      resolveSkillPower(wishPower, {
        basePowerOverride: 100,
        enemyUsedStatusSkill: false,
      }),
    ).toMatchObject({ status: "exact", value: 100 });
    expect(
      resolveSkillPower(wishPower, {
        basePowerOverride: 100,
        enemyUsedStatusSkill: true,
      }),
    ).toMatchObject({ status: "exact", value: 250 });
  });

  test("resolves Head-on Blow from the reviewed skill effect without a snapshot rule id", () => {
    const headOnBlow = skill({
      name: "当头棒喝",
      description: "造成物伤，若敌方本回合更换精灵，本次技能威力+100。",
    });

    expect(resolveSkillPower(headOnBlow, {})).toMatchObject({
      status: "exact",
      value: 80,
    });
    expect(
      resolveSkillPower(headOnBlow, { enemySwitchedThisTurn: true }),
    ).toMatchObject({
      status: "exact",
      value: 180,
    });
  });

  test("uses the current BWIKI value for Bottom-out Strike instead of the stale original-site tip", () => {
    const bottomOutStrike = skill({
      basePower: 95,
      name: "触底强击",
      description: "造成魔伤，使用后若能量耗尽，本次技能威力+120。",
    });

    expect(
      resolveSkillPower(bottomOutStrike, { energyDepletedAfterUse: true }),
    ).toMatchObject({
      status: "exact",
      value: 215,
    });
  });

  test.each([
    [0, false, 75],
    [1, false, 85],
    [3, false, 105],
    [0, true, 75],
    [1, true, 115],
    [3, true, 195],
  ])(
    "adds Poison power per poison stack (stacks=%i, counter=%s)",
    (enemyPoisonStacks, counterTriggered, expectedPower) => {
      const poison = skill({ basePower: 75, name: "鸩毒" });

      expect(
        resolveSkillPower(poison, {
          counterTriggered,
          enemyPoisonStacks,
        }),
      ).toMatchObject({ status: "exact", value: expectedPower });
    },
  );

  test.each([
    [
      "钢铁洪流",
      70,
      { skillPosition: 1 },
      { status: "exact", value: 160 },
    ],
    [
      "偷袭",
      85,
      { counterTriggered: true },
      { status: "exact", value: 255 },
    ],
    [
      "垂死反击",
      80,
      { attackerHpPercent: 80 },
      { status: "exact", value: 100 },
    ],
    [
      "碎冰冰",
      40,
      { enemyFreezeStacks: 2 },
      { status: "exact", value: 80 },
    ],
    [
      "逆袭",
      55,
      { actualSkillCost: 3 },
      { status: "exact", value: 155 },
      { cost: 1 },
    ],
  ])(
    "resolves reviewed %s effect conditions",
    (name, basePower, context, expected, overrides = {}) => {
      expect(
        resolveSkillPower(skill({ name, basePower, ...overrides }), context),
      ).toMatchObject(expected);
    },
  );

  test("returns automatic hit count and resistance handling with dynamic effects", () => {
    expect(
      resolveSkillPower(
        skill({ basePower: 15, name: "多维击打" }),
        { enemyStarfallMarks: 3 },
      ),
    ).toMatchObject({
      hitCount: 4,
      status: "exact",
      value: 15,
    });
    expect(
      resolveSkillPower(
        skill({ basePower: 75, name: "草虫冲击" }),
        { enemySwitchedThisTurn: true },
      ),
    ).toMatchObject({
      ignoreResistance: true,
      status: "exact",
      value: 165,
    });
    expect(
      resolveSkillPower(
        skill({ basePower: 85, name: "雪原狩猎" }),
        { blizzardWeather: true },
      ),
    ).toMatchObject({
      ruleSource: "feishu-doc:season-announcement-revision-11",
      status: "exact",
      value: 135,
    });
    expect(
      resolveSkillPower(
        skill({ basePower: 85, name: "雪原狩猎" }),
        { blizzardWeather: false },
      ),
    ).toMatchObject({ status: "exact", value: 85 });
    expect(
      resolveSkillPower(
        skill({ basePower: 85, name: "流星火雨" }),
        { defeatedEnemyCount: 1 },
      ),
    ).toMatchObject({ status: "exact", value: 170 });
    expect(
      resolveSkillPower(
        skill({ basePower: 30, name: "孢子爆散" }),
        { skillUseCount: 1 },
      ),
    ).toMatchObject({ hitCount: 4, status: "exact", value: 30 });
  });

  test("流星火雨和孢子爆散按新版永久增量处理零次与多次", () => {
    expect(
      resolveSkillPower(
        skill({ basePower: 85, name: "流星火雨" }),
        { defeatedEnemyCount: 0 },
      ),
    ).toMatchObject({ status: "exact", value: 85 });
    expect(
      resolveSkillPower(
        skill({ basePower: 85, name: "流星火雨" }),
        { defeatedEnemyCount: 2 },
      ),
    ).toMatchObject({ status: "exact", value: 255 });
    expect(
      resolveSkillPower(
        skill({ basePower: 30, name: "孢子爆散" }),
        { skillUseCount: 0 },
      ),
    ).toMatchObject({ hitCount: 2, status: "exact", value: 30 });
    expect(
      resolveSkillPower(
        skill({ basePower: 30, name: "孢子爆散" }),
        { skillUseCount: 2 },
      ),
    ).toMatchObject({ hitCount: 6, status: "exact", value: 30 });
  });

  test.each([
    [
      "友谊满溢",
      70,
      { friendshipMode: "growth", skillUseCount: 3 },
      { status: "exact", value: 130 },
    ],
    [
      "友谊满溢",
      70,
      { counterTriggered: true, friendshipMode: "counter" },
      { status: "exact", value: 140 },
    ],
    [
      "撒花",
      95,
      { attackerHpPercent: 81, flowerMode: "power" },
      { status: "exact", value: 145 },
    ],
    [
      "撒花",
      95,
      { counterTriggered: true, flowerMode: "heal" },
      { status: "exact", value: 95 },
    ],
    [
      "轮班",
      70,
      { shiftMode: "power", skillPosition: 1 },
      { status: "exact", value: 135 },
    ],
    [
      "轮班",
      70,
      { shiftMode: "drive", skillPosition: 1 },
      { status: "exact", value: 70 },
    ],
    [
      "驱赶",
      70,
      { driveOutMode: "steady" },
      { status: "exact", value: 90 },
    ],
    [
      "驱赶",
      70,
      { counterTriggered: true, driveOutMode: "counter" },
      { status: "exact", value: 210 },
    ],
    [
      "试飞",
      20,
      { flightMode: "power", skillUseCount: 3 },
      { hitCount: 2, status: "exact", value: 50 },
    ],
    [
      "试飞",
      20,
      { flightMode: "hits", skillUseCount: 3 },
      { hitCount: 5, status: "exact", value: 20 },
    ],
    [
      "下注",
      85,
      { betMode: "fixed" },
      { status: "exact", value: 125 },
    ],
    [
      "下注",
      85,
      { attackerHpPercent: 49, betMode: "lowHp" },
      { status: "exact", value: 185 },
    ],
  ])(
    "resolves reviewed choice branch for %s",
    (name, basePower, context, expected) => {
      expect(
        resolveSkillPower(skill({ name, basePower }), context),
      ).toMatchObject(expected);
    },
  );

  test("applies Friendship Overflow counter doubling after a manual base-power override", () => {
    const friendshipOverflow = skill({
      basePower: 20,
      category: "magical",
      name: "友谊满溢",
    });

    expect(
      resolveSkillPower(friendshipOverflow, {
        basePowerOverride: 100,
        counterTriggered: false,
        friendshipMode: "counter",
      }),
    ).toMatchObject({ status: "exact", value: 100 });
    expect(
      resolveSkillPower(friendshipOverflow, {
        basePowerOverride: 100,
        counterTriggered: true,
        friendshipMode: "counter",
      }),
    ).toMatchObject({ status: "exact", value: 200 });
    expect(
      resolveSkillPower(
        skill({ basePower: 70, name: "暗突袭" }),
        {
          basePowerOverride: 100,
          counterTriggered: true,
        },
      ),
    ).toMatchObject({ status: "exact", value: 200 });
  });

  test("友谊满溢不读取萌芽固定威力", () => {
    expect(
      resolveSkillPower(skill({ basePower: 70, name: "友谊满溢" }), {
        friendshipMode: "growth",
        skillUseCount: 3,
        sproutFixedPowerBonus: 10,
      }),
    ).toMatchObject({ status: "exact", value: 130 });

  });

  test("撒娇不再读取旧版单槽萌化次数，避免与全技能增益重复", () => {
    const coax = snapshot.skills.find((candidate) => candidate.name === "撒娇");
    expect(getSkillEffectInputs(coax)).toEqual([]);
    expect(
      resolveSkillPower(skill({ basePower: 30, name: "撒娇" }), {
        moeGainCount: 3,
      }),
    ).toMatchObject({ status: "exact", value: 30 });
  });

  test("超级糖果不读取萌芽加成", () => {
    expect(
      resolveSkillPower(skill({ basePower: 40, name: "超级糖果" }), {
        attackerMoeActive: true,
        sproutStacks: 2,
      }),
    ).toMatchObject({ status: "exact", value: 100 });
  });

  test("幼态延续保留现有萌芽兼容规则", () => {
    expect(
      resolveSkillPower(skill({ basePower: 40, name: "幼态延续" }), {
        attackerMoeActive: true,
        sproutStacks: 2,
      }),
    ).toMatchObject({ status: "exact", value: 120 });
  });

  test("only resolves Calamity against the enemy after its counter condition", () => {
    const calamity = skill({ basePower: 60, name: "灾厄" });

    expect(resolveSkillPower(calamity, {})).toMatchObject({
      status: "needs_input",
      reason: "默认对自身造成伤害，开启应对后计算对敌伤害",
    });
    expect(
      resolveSkillPower(calamity, { counterTriggered: true }),
    ).toMatchObject({
      status: "exact",
      target: "enemy",
      value: 180,
    });
  });

  test("registers all 105 reviewed dynamic skills in the current snapshot", () => {
    expect(
      snapshot.skills.filter((entry) => getSkillEffectRule(entry)).length,
    ).toBe(105);
  });

  test("keeps every reviewed rule default-safe and every choice default valid", () => {
    const reviewedSkills = snapshot.skills.filter((entry) =>
      getSkillEffectRule(entry),
    );

    for (const reviewedSkill of reviewedSkills) {
      const inputs = getSkillEffectInputs(reviewedSkill);
      const context = Object.fromEntries(
        inputs
          .filter(({ defaultValue }) => defaultValue !== undefined)
          .map(({ defaultValue, key }) => [key, defaultValue]),
      );

      for (const input of inputs.filter(({ type }) => type === "choice")) {
        expect(
          input.options.map(({ value }) => value),
          `${reviewedSkill.name} 的 ${input.label} 默认值`,
        ).toContain(input.defaultValue);
      }

      const resolution = resolveSkillPower(reviewedSkill, context);
      expect(
        ["exact", "needs_input"],
        `${reviewedSkill.name} 的规则状态`,
      ).toContain(resolution.status);
      if (resolution.status === "exact") {
        expect(
          Number.isFinite(Number(resolution.value)),
          `${reviewedSkill.name} 的静态威力`,
        ).toBe(true);
        if (resolution.hitCount !== undefined) {
          expect(
            Number.isInteger(resolution.hitCount) &&
              resolution.hitCount > 0,
            `${reviewedSkill.name} 的连击数`,
          ).toBe(true);
        }
      }
    }
  });

  test.each([
    [
      "迫近攻击",
      90,
      { skillUseCount: 2 },
      { status: "exact", value: 180 },
    ],
    [
      "山火",
      15,
      { otherFireSkillUseCount: 3 },
      { status: "exact", value: 120 },
    ],
    [
      "穿膛",
      65,
      { enemyEnergy: 2 },
      { status: "exact", value: 325 },
    ],
    [
      "甜蜜陷阱",
      50,
      { energy: 11 },
      { status: "exact", value: 160 },
    ],
    [
      "血契",
      75,
      { attackerHpPercent: 55 },
      { status: "exact", value: 115 },
    ],
  ])(
    "resolves newly reviewed %s power rules",
    (name, basePower, context, expected) => {
      expect(
        resolveSkillPower(skill({ name, basePower }), context),
      ).toMatchObject(expected);
    },
  );

  test.each([
    [
      "连续爪击",
      { counterTriggered: true },
      { hitCount: 4, status: "exact", value: 30 },
      { basePower: 30 },
    ],
    [
      "散手",
      { counterTriggered: true },
      { hitCount: 6, status: "exact", value: 35 },
      { basePower: 35 },
    ],
    [
      "埋伏",
      { enemySwitchedThisTurn: true },
      { hitCount: 6, status: "exact", value: 30 },
      { basePower: 30 },
    ],
  ])(
    "resolves newly reviewed %s hit-count rules",
    (name, context, expected, overrides) => {
      expect(
        resolveSkillPower(skill({ name, ...overrides }), context),
      ).toMatchObject(expected);
    },
  );

  test("uses safe input defaults instead of blocking a newly selected cumulative skill", () => {
    expect(
      resolveSkillPower(skill({ name: "迫近攻击", basePower: 90 }), {}),
    ).toMatchObject({ status: "exact", value: 90 });
  });

  test("虫群的累计威力奉献每层增加20威力", () => {
    const swarm = snapshot.skills.find((candidate) => candidate.name === "虫群");

    expect(getSkillEffectInputs(swarm)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextKey: "donationPowerCount",
          label: "威力奉献层数",
          type: "number",
        }),
      ]),
    );
    expect(
      resolveSkillPower(swarm, { donationPowerCount: 2 }),
    ).toMatchObject({ status: "exact", value: 60 });
  });

  test("啃咬的威力奉献每层增加20威力且不改连击", () => {
    const bite = snapshot.skills.find((candidate) => candidate.name === "啃咬");
    const resolution = resolveSkillPower(bite, { donationPowerCount: 3 });

    expect(resolution).toMatchObject({ status: "exact", value: 100 });
    expect(resolution).not.toHaveProperty("hitCount");
    expect(getDefaultHitCount(bite)).toBe(1);
  });

  test("飞断按奉献次数增加威力并兼容旧布尔字段", () => {
    const sever = snapshot.skills.find((candidate) => candidate.name === "飞断");

    expect(resolveSkillPower(sever, { teamDonationCount: 3 })).toMatchObject({
      status: "exact",
      value: 80,
    });
    expect(resolveSkillPower(sever, { teamDonationActive: true })).toMatchObject({
      status: "exact",
      value: 40,
    });
  });

  test("虫群的累计连击奉献沿用旧donationHitBonus并每层增加1连击", () => {
    const swarm = snapshot.skills.find((candidate) => candidate.name === "虫群");

    expect(getSkillEffectInputs(swarm)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextKey: "donationHitBonus",
          label: "连击奉献层数",
          type: "number",
        }),
      ]),
    );
    expect(
      resolveSkillPower(swarm, { donationHitBonus: 2 }),
    ).toMatchObject({ hitCount: 3, status: "exact", value: 20 });
  });

  test("虫鸣输入值就是最终连击数，最少为1且不设上限", () => {
    const bugChirp = snapshot.skills.find(
      (candidate) => candidate.name === "虫鸣",
    );
    const countInput = getSkillEffectInputs(bugChirp).find(
      (input) => input.contextKey === "teamBugChantCount",
    );

    expect(countInput).toMatchObject({
      defaultValue: 1,
      min: 1,
      type: "number",
    });
    expect(countInput).not.toHaveProperty("max");
    expect(resolveSkillPower(bugChirp, {})).toMatchObject({ hitCount: 1 });
    expect(resolveSkillPower(bugChirp, { teamBugChantCount: 6 }))
      .toMatchObject({ hitCount: 6 });
    expect(resolveSkillPower(bugChirp, { teamBugChantCount: 21 }))
      .toMatchObject({ hitCount: 21 });
  });

  test("虫群的累计中毒奉献每层记录1层中毒", () => {
    const swarm = snapshot.skills.find((candidate) => candidate.name === "虫群");

    expect(getSkillEffectInputs(swarm)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextKey: "donationPoisonCount",
          label: "中毒奉献层数",
          type: "number",
        }),
      ]),
    );
    expect(
      resolveSkillPower(swarm, { donationPoisonCount: 3 }),
    ).toMatchObject({ donationPoisonStacks: 3, status: "exact", value: 20 });
  });

  test("虫群暂时只计算威力、连击和中毒三类奉献", () => {
    const swarm = snapshot.skills.find((candidate) => candidate.name === "虫群");

    expect(
      getSkillEffectInputs(swarm).map((input) => input.contextKey),
    ).toEqual([
      "donationPowerCount",
      "donationHitBonus",
      "donationPoisonCount",
    ]);
    const result = resolveSkillPower(swarm, {
      donationCostReductionCount: 2,
      donationLifestealCount: 3,
    });
    expect(result).toMatchObject({ status: "exact", value: 20 });
    expect(result).not.toHaveProperty("donationLifestealPercent");
    expect(result).not.toHaveProperty("resolvedCost");
  });

  test("does not guess unknown enemy energy for threshold skills", () => {
    expect(
      resolveSkillPower(skill({ name: "穿膛", basePower: 65 }), {}),
    ).toMatchObject({
      inputs: [{ key: "enemyEnergy" }],
      status: "needs_input",
    });
  });

  test("uses a manual power override before a dynamic rule", () => {
    expect(
      resolveSkillPower(
        skill({ name: "魔能爆", ruleId: "mana_burst" }),
        { basePowerOverride: 222 },
      ),
    ).toMatchObject({ status: "exact", value: 222 });
  });

  test("does not treat a null manual override as zero power", () => {
    expect(
      resolveSkillPower(skill(), { basePowerOverride: null }),
    ).toMatchObject({ status: "exact", value: 80 });
  });

  test("does not fake an unsupported rule", () => {
    expect(
      resolveSkillPower(
        skill({ name: "未知规则技能", ruleId: "not_reviewed" }),
        {},
      ),
    ).toMatchObject({ status: "unsupported" });
  });

  test("does not turn a status skill into direct damage", () => {
    expect(
      resolveSkillPower(
        skill({ category: "status", basePower: 0 }),
        {},
      ),
    ).toMatchObject({ status: "unsupported" });
  });
});
