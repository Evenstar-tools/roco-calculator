import { describe, expect, test } from "vitest";
import snapshot from "../../public/data/current.json";
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

  test("defaults Mana Burst to zero energy instead of blocking damage", () => {
    expect(
      resolveSkillPower(
        skill({ name: "魔能爆", ruleId: "mana_burst" }),
        {},
      ),
    ).toMatchObject({
      status: "exact",
      value: 45,
      steps: [{ input: 0, after: 45 }],
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
        skill({ basePower: 80, name: "草虫冲击" }),
        { enemySwitchedThisTurn: true },
      ),
    ).toMatchObject({
      ignoreResistance: true,
      status: "exact",
      value: 130,
    });
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

  test("友谊满溢不读取萌芽固定威力，撒娇仍保留追加", () => {
    expect(
      resolveSkillPower(skill({ basePower: 70, name: "友谊满溢" }), {
        friendshipMode: "growth",
        skillUseCount: 3,
        sproutFixedPowerBonus: 10,
      }),
    ).toMatchObject({ status: "exact", value: 130 });

    expect(
      resolveSkillPower(skill({ basePower: 30, name: "撒娇" }), {
        moeGainCount: 3,
        sproutFixedPowerBonus: 20,
      }),
    ).toMatchObject({ status: "exact", value: 80 });
  });

  test("S3季中撒娇每次萌化只增加10威力", () => {
    expect(
      resolveSkillPower(skill({ basePower: 30, name: "撒娇" }), {
        moeGainCount: 3,
      }),
    ).toMatchObject({ status: "exact", value: 60 });
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

  test("registers all 100 reviewed dynamic skills in the current snapshot", () => {
    expect(
      snapshot.skills.filter((entry) => getSkillEffectRule(entry)).length,
    ).toBe(100);
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
