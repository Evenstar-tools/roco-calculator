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

  test("resolves Tailwind from the supplied panel speeds", () => {
    expect(
      resolveTraitMultipliers(
        input({ attackerTraits: [{ id: "tailwind", name: "顺风" }] }),
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
