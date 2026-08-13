import { describe, expect, test } from "vitest";
import { resolveTraitMultipliers } from "../../src/domain/traits.js";

function input(overrides = {}) {
  return {
    attackerTraits: [],
    defenderTraits: [],
    skill: { type: "翼", category: "physical", cost: 3 },
    attacker: { types: ["翼"], panelStats: { speed: 260 } },
    defender: {
      types: ["水"],
      panelStats: { speed: 180 },
      skillTypes: ["水"],
    },
    context: {},
    ...overrides,
  };
}

describe("resolveTraitMultipliers", () => {
  test("守护之心每种不同增益只提高持有者20%物防", () => {
    const trait = [{ id: "guardian-heart", name: "守护之心" }];
    const physicalDefense = resolveTraitMultipliers(
      input({
        defenderTraits: trait,
        context: { defenderTraitStacks: 2 },
        skill: { type: "武", category: "physical", cost: 2 },
      }),
    );
    const magicalDefense = resolveTraitMultipliers(
      input({
        defenderTraits: trait,
        context: { defenderTraitStacks: 2 },
        skill: { type: "魔", category: "magical", cost: 2 },
      }),
    );
    const ownerDefense = resolveTraitMultipliers(
      input({
        attackerTraits: trait,
        context: { attackerTraitStacks: 2 },
      }),
    );

    expect(physicalDefense).toMatchObject({
      defenseLevelBonus: 4,
      defenderDefenseLevelBonus: 4,
    });
    expect(magicalDefense).toMatchObject({
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 4,
    });
    expect(ownerDefense).toMatchObject({
      attackMultiplier: 1,
      attackerDefenseLevelBonus: 4,
    });
  });

  test("derives Tundra stacks from carried ice skills for ground attacks", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "tundra", name: "冻土" }],
          attacker: {
            panelStats: { speed: 180 },
            skillTypes: ["冰", "地", "冰", "普通"],
            types: ["地"],
          },
          context: { attackerTraitEffect: 10, attackerTraitStacks: 4 },
          skill: { category: "physical", cost: 3, type: "地" },
        }),
      ),
    ).toMatchObject({ status: "exact", powerMultiplier: 1.2 });
  });

  test("applies the fixed Saint Fire Knight doubling only when checked", () => {
    const attackerTraits = [{ id: "holy-fire-knight", name: "圣火骑士" }];

    expect(resolveTraitMultipliers(input({ attackerTraits }))).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: { "attackerTrait.counterTriggered": true },
        }),
      ),
    ).toMatchObject({ status: "exact", powerMultiplier: 2 });
  });

  test("uses neutral exact multipliers when neither side has a trait", () => {
    expect(resolveTraitMultipliers(input())).toMatchObject({
      status: "exact",
      attackMultiplier: 1,
      fixedPowerAdd: 0,
      powerMultiplier: 1,
      damageReductionMultiplier: 1,
      finalDamageMultiplier: 1,
    });
  });

  test("resolves Tailwind only after the acted-first condition is confirmed", () => {
    expect(
      resolveTraitMultipliers(
        input({ attackerTraits: [{ id: "tailwind", name: "顺风" }] }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "tailwind", name: "顺风" }],
          context: { actedBeforeEnemy: true },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1.5,
    });
  });

  test("keeps Skybreaker exact and applies its reviewed acted-first multiplier", () => {
    const attackerTraits = [{ id: "skybreaker", name: "破空" }];

    expect(
      resolveTraitMultipliers(input({ attackerTraits })),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            actedBeforeEnemy: true,
            attackerTraitEffect: 90,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1.9,
    });

    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            "attackerTrait.actedBeforeEnemy": true,
            "attackerTrait.attackerTraitEffect": 90,
          },
        }),
      ),
    ).toMatchObject({ status: "exact", powerMultiplier: 1.9 });
  });

  test("turns Prowling Claw gift stacks into editable physical attack levels", () => {
    const attackerTraits = [
      { id: "cat_gift", name: "猫精灵的礼物" },
    ];

    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            attackerTraitEffect: 40,
            attackerTraitStacks: 2,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackLevelBonus: 8,
      attackMultiplier: 1.8,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            attackerTraitEffect: 50,
            attackerTraitStacks: 2,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackLevelBonus: 10,
      attackMultiplier: 2,
    });
  });

  test("turns Blazing Guardian fire stacks into editable fixed skill power", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [
            { id: "steam_expansion", name: "蒸汽膨胀" },
          ],
          context: {
            attackerTraitEffect: 12,
            attackerTraitStacks: 3,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      fixedPowerAdd: 36,
    });
  });

  test("turns restored energy before attacking into editable dual attack", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [
            { id: "grass_awakes", name: "草木苏醒时" },
          ],
          context: {
            attackerTraitEffect: 20,
            attackerTraitStacks: 3,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1.6,
    });
  });

  test("applies Prophet's fifty-percent attack bonus for every trigger stack", () => {
    const attackerTraits = [{ id: "prophet", name: "先知" }];

    expect(
      resolveTraitMultipliers(input({ attackerTraits })),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: { attackerTraitStacks: 2 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 2,
    });
  });

  test.each(["最好的伙伴", "裁决", "滋养", "点燃", "净化"])(
    "applies %s's twenty-percent attack bonus for every trigger stack",
    (name) => {
      expect(
        resolveTraitMultipliers(
          input({
            attackerTraits: [{ id: `dimo-${name}`, name }],
            context: { attackerTraitStacks: 2 },
          }),
        ),
      ).toMatchObject({
        status: "exact",
        attackLevelBonus: 4,
        attackMultiplier: 1.4,
      });
    },
  );

  test.each([
    ["助燃", 1.4],
    ["爆燃", 1.6],
    ["鼓气", 1.4],
  ])(
    "applies %s once for every accumulated trigger",
    (name, attackMultiplier) => {
      expect(
        resolveTraitMultipliers(
          input({
            attackerTraits: [{ id: `stacked-${name}`, name }],
            context: { attackerTraitStacks: 2 },
          }),
        ),
      ).toMatchObject({
        status: "exact",
        attackMultiplier,
      });
    },
  );

  test("applies penetration stacks to both offense and physical defense", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "penetration", name: "渗透" }],
          context: { attackerTraitStacks: 4 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackLevelBonus: 2,
      attackerDefenseLevelBonus: 2,
      attackMultiplier: 1.2,
    });

    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [{ id: "penetration", name: "渗透" }],
          context: { defenderTraitStacks: 4 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      defenseLevelBonus: 2,
      defenderDefenseLevelBonus: 2,
    });
  });

  test("保守派勾选后只增加自身双防80%", () => {
    const attackerTraits = [{ id: "conservative", name: "保守派" }];
    const defenderTraits = [{ id: "conservative", name: "保守派" }];

    expect(resolveTraitMultipliers(input({ attackerTraits }))).toMatchObject({
      attackMultiplier: 1,
      attackerDefenseLevelBonus: 0,
    });
    expect(
      resolveTraitMultipliers(
        input({ attackerTraits, context: { traitActivated: true } }),
      ),
    ).toMatchObject({
      attackMultiplier: 1,
      attackLevelBonus: 0,
      attackerDefenseLevelBonus: 8,
    });
    expect(
      resolveTraitMultipliers(
        input({ defenderTraits, context: { traitActivated: true } }),
      ),
    ).toMatchObject({
      defenseLevelBonus: 8,
      defenderDefenseLevelBonus: 8,
    });
  });

  test("张弛有度周末加双攻，平日加双防", () => {
    const trait = { id: "flexible-tempo", name: "张弛有度" };

    expect(
      resolveTraitMultipliers(
        input({ attackerTraits: [trait], context: { traitActivated: true } }),
      ),
    ).toMatchObject({
      attackLevelBonus: 4,
      attackMultiplier: 1.4,
      attackerDefenseLevelBonus: 0,
      steps: [
        expect.objectContaining({
          after: 1.4,
          label: "张弛有度 · 周末双攻",
        }),
      ],
    });
    expect(
      resolveTraitMultipliers(
        input({ attackerTraits: [trait], context: { traitActivated: false } }),
      ),
    ).toMatchObject({
      attackLevelBonus: 0,
      attackMultiplier: 1,
      attackerDefenseLevelBonus: 4,
    });
    expect(
      resolveTraitMultipliers(
        input({ defenderTraits: [trait], context: { traitActivated: false } }),
      ),
    ).toMatchObject({
      defenseLevelBonus: 4,
      defenderDefenseLevelBonus: 4,
      steps: [
        expect.objectContaining({
          after: 1.4,
          label: "张弛有度 · 平日双防",
        }),
      ],
    });
    expect(
      resolveTraitMultipliers(
        input({ defenderTraits: [trait], context: { traitActivated: true } }),
      ),
    ).toMatchObject({
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
    });
  });

  test.each([
    "最好的伙伴",
    "裁决",
    "滋养",
    "点燃",
    "净化",
    "虫群鼓舞",
    "虫群突袭",
    "鼓气",
    "三鼓作气",
    "淬炼火",
  ])("applies %s stacks on both attack and defense", (name) => {
    const attacker = resolveTraitMultipliers(
      input({
        attackerTraits: [{ id: `attack-defense-${name}`, name }],
        context: { attackerTraitStacks: 2 },
      }),
    );
    const defender = resolveTraitMultipliers(
      input({
        defenderTraits: [{ id: `attack-defense-${name}`, name }],
        context: { defenderTraitStacks: 2 },
      }),
    );

    expect(attacker.attackerDefenseLevelBonus).toBeGreaterThan(0);
    expect(attacker.attackMultiplier).toBeGreaterThan(1);
    expect(defender.defenderDefenseLevelBonus).toBeGreaterThan(0);
    expect(defender.defenseLevelBonus).toBeGreaterThan(0);
  });

  test("applies Centripetal Force only to the first two skill slots", () => {
    const attackerTraits = [{ id: "centripetal", name: "向心力" }];

    expect(
      resolveTraitMultipliers(
        input({ attackerTraits, context: { skillPosition: 2 } }),
      ),
    ).toMatchObject({ fixedPowerAdd: 30 });
    expect(
      resolveTraitMultipliers(
        input({ attackerTraits, context: { skillPosition: 3 } }),
      ),
    ).toMatchObject({ fixedPowerAdd: 0 });
  });

  test("does not apply Bug Resonance to unrelated skills", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "resonance", name: "共鸣" }],
          skill: {
            name: "普通攻击",
            type: "普通",
            category: "physical",
            cost: 1,
          },
        }),
      ),
    ).toMatchObject({ fixedPowerAdd: 0 });
  });

  test("lets the Archive Governor toggle and edit Guardian of the Library", () => {
    const attackerTraits = [
      { id: "library_guardian", name: "图书守卫者" },
    ];

    expect(
      resolveTraitMultipliers(input({ attackerTraits })),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            attackerTraitEffect: 80,
            traitActivated: true,
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1.8,
    });
  });

  test("keeps Focus neutral until its trigger is checked", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "focus", name: "专注力" }],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1,
    });
  });

  test("doubles physical attack when Focus is active", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "focus", name: "专注力" }],
          context: { traitActivated: true },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 2,
    });
  });

  test("doubles Wish Power when its dual category selects physical attack", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "focus", name: "专注力" }],
          attacker: {
            types: ["火"],
            panelStats: {
              physicalAttack: 271,
              magicalAttack: 105,
              speed: 225,
            },
          },
          skill: { type: "草", category: "dual", cost: 2 },
          context: { traitActivated: true },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 2,
    });
  });

  test("does not apply physical-only Focus when Wish Power selects magical attack", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "focus", name: "专注力" }],
          attacker: {
            types: ["火"],
            panelStats: {
              physicalAttack: 105,
              magicalAttack: 271,
              speed: 225,
            },
          },
          skill: { type: "草", category: "dual", cost: 2 },
          context: { traitActivated: true },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      attackMultiplier: 1,
    });
  });

  test("月光审判勾选后只应用一次技能威力加成", () => {
    const attackerTraits = [{ id: "moon-judgment", name: "月光审判" }];

    expect(resolveTraitMultipliers(input({ attackerTraits }))).toMatchObject({
      powerMultiplier: 1,
    });
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits,
          context: {
            attackerTraitEffect: 100,
            traitActivated: true,
          },
        }),
      ),
    ).toMatchObject({
      powerMultiplier: 2,
    });
  });

  test("treats an attacker-only trait as neutral on the defending side", () => {
    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [{ id: "focus", name: "专注力" }],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
    });
  });

  test("asks whether Polarization matches when move slots are unavailable", () => {
    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [{ id: "polarization", name: "偏振" }],
          defender: { types: ["水"], panelStats: { speed: 180 } },
        }),
      ),
    ).toMatchObject({
      status: "needs_input",
      inputs: [{ key: "defenderCarriesSameType" }],
    });
  });

  test("applies Polarization reduction when the defender carries the skill type", () => {
    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [{ id: "polarization", name: "偏振" }],
          defender: {
            types: ["水"],
            panelStats: { speed: 180 },
            skillTypes: ["水", "翼"],
          },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      damageReductionMultiplier: 0.6,
    });
  });

  test("uses the editable Polarization reduction value", () => {
    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [{ id: "polarization", name: "偏振" }],
          defender: {
            types: ["水"],
            panelStats: { speed: 180 },
            skillTypes: ["水", "翼"],
          },
          context: { defenderTraitEffect: 25 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      damageReductionMultiplier: 0.75,
    });
  });

  test("uses the editable Absolute Order reduction value", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attacker: { types: ["火"], panelStats: { speed: 260 } },
          defenderTraits: [{ id: "absolute_order", name: "绝对秩序" }],
          context: { defenderTraitEffect: 35 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      damageReductionMultiplier: 0.65,
    });
  });

  test("scales Ice Drill power from the defender's four carried skill costs", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [{ id: "ice_drill", name: "冰钻" }],
          context: { enemyTotalSkillCost: 10 },
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 2,
    });
  });

  test("keeps an unflagged trait neutral instead of blocking all damage", () => {
    expect(
      resolveTraitMultipliers(
        input({
          defenderTraits: [
            {
              id: "energy_trait",
              name: "噼啪噼啪！",
              description: "行动后回复能量。",
            },
          ],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
      damageReductionMultiplier: 1,
    });
  });

  test("keeps an unverified damage trait neutral and reports it as unapplied", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [
            { id: "unknown_trait", name: "尚未验证", affectsDamage: true },
          ],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
      warnings: ["未计入特性：尚未验证"],
    });
  });

  test("keeps base damage when a reviewed multiplier is incomplete", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [
            {
              id: "broken_review",
              name: "缺失倍率",
              ruleId: "power_multiplier",
              multiplier: null,
            },
          ],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
      warnings: ["未计入特性：缺失倍率"],
    });
  });

  test("keeps base damage when a trait rule id is unknown", () => {
    expect(
      resolveTraitMultipliers(
        input({
          attackerTraits: [
            {
              id: "future_rule",
              name: "未来规则",
              ruleId: "future_rule_v2",
            },
          ],
        }),
      ),
    ).toMatchObject({
      status: "exact",
      powerMultiplier: 1,
      warnings: ["未计入特性：未来规则"],
    });
  });
});
