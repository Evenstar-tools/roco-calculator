import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";

const allFullIvs = {
  physicalAttack: 60,
  magicalAttack: 60,
  speed: 60,
  hp: 60,
  physicalDefense: 60,
  magicalDefense: 60,
};

const snapshot = {
  meta: {
    id: "s3-fixture",
    rulesVersion: "2026-07-23",
  },
  spirits: [
    {
      id: "spirit_sonic_dog",
      fullName: "音速犬",
      types: ["火"],
      raceStats: {
        physicalAttack: 128,
        magicalAttack: 82,
        speed: 116,
        hp: 110,
        physicalDefense: 95,
        magicalDefense: 90,
      },
      traitIds: [],
    },
    {
      id: "spirit_water",
      fullName: "水灵",
      types: ["水"],
      raceStats: {
        physicalAttack: 100,
        magicalAttack: 115,
        speed: 90,
        hp: 125,
        physicalDefense: 100,
        magicalDefense: 105,
      },
      traitIds: [],
    },
  ],
  skills: [
    {
      id: "skill_wind",
      name: "风力冲击",
      type: "翼",
      category: "physical",
      basePower: 80,
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_water",
      name: "水流冲击",
      type: "水",
      category: "magical",
      basePower: 70,
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_mana",
      name: "魔能爆",
      type: "幻",
      category: "magical",
      basePower: 45,
      ruleId: "mana_burst",
      provenance: { ruleId: { source: "fixture" } },
    },
    {
      id: "skill_color_dispersion",
      name: "色散",
      type: "光",
      category: "magical",
      basePower: 80,
      description: "造成魔伤，对混血精灵造成伤害+50%。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_friendship_overflow",
      name: "友谊满溢",
      type: "普通",
      category: "magical",
      cost: 2,
      basePower: 20,
      description:
        "造成魔伤，选择：每次使用后威力永久+20或应对状态下威力翻倍。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_comet",
      name: "彗星",
      type: "普通",
      category: "magical",
      cost: 0,
      basePower: 240,
      ruleId: "hp_scaled",
      ruleParams: {
        changePerInterval: 10,
        contextKey: "attackerHpPercent",
        direction: "decrease",
        interval: 5,
        label: "自身生命百分比",
      },
      provenance: { basePower: { source: "fixture" } },
    },
  ],
  traits: [],
  typeChart: null,
};

function side(spiritId, singleSkillId, fourSkillIds) {
  return {
    spiritId,
    natureMultipliers:
      spiritId === "spirit_sonic_dog" ? { physicalAttack: 1.2 } : {},
    displayIvs: { ...allFullIvs },
    skills: {
      single: singleSkillId,
      four: fourSkillIds,
    },
  };
}

function battleInput(overrides = {}) {
  const base = {
    schemaVersion: 1,
    versions: { data: "s3-fixture", rules: "1.0.0" },
    mode: "single",
    marks: {
      attacker: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
      defender: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
    },
    level: 60,
    sides: {
      attacker: side("spirit_sonic_dog", "skill_wind", [
        "skill_wind",
        null,
        null,
        null,
      ]),
      defender: side("spirit_water", "skill_water", [
        "skill_water",
        null,
        null,
        null,
      ]),
    },
    directions: {
      forward: {
        selectedSkillIndex: 0,
        reduction: 1,
        hitCount: 1,
        starfallStacks: 0,
        finalDamageMultiplier: 1,
        currentHp: 434,
        context: {},
        overrides: {},
      },
      reverse: {
        selectedSkillIndex: 0,
        reduction: 1,
        hitCount: 1,
        starfallStacks: 0,
        finalDamageMultiplier: 1,
        currentHp: 403,
        context: {},
        overrides: {},
      },
    },
  };

  return {
    ...base,
    ...overrides,
    sides: { ...base.sides, ...overrides.sides },
    directions: {
      forward: {
        ...base.directions.forward,
        ...overrides.directions?.forward,
      },
      reverse: {
        ...base.directions.reverse,
        ...overrides.directions?.reverse,
      },
    },
  };
}

function legacyBattleInput(overrides = {}) {
  const input = battleInput(overrides);
  delete input.marks;
  return input;
}

describe("calculateMatchup", () => {
  test("applies the active side's positive mark by stack and reports the settlement", () => {
    const before = calculateMatchup(snapshot, battleInput()).forward.selectedResult;
    const after = calculateMatchup(
      snapshot,
      battleInput({
        marks: {
          attacker: {
            negative: { id: null, stacks: 0 },
            positive: { id: "tailwind", stacks: 2 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: null, stacks: 0 },
          },
        },
      }),
    ).forward.selectedResult;

    expect(after.effectivePower).toBe(Math.round(before.effectivePower * 1.4));
    expect(after.markSettlements).toContainEqual(
      expect.objectContaining({
        markId: "tailwind",
        side: "attacker",
        stacks: 2,
        status: "applied",
        text: "风起 ×2 技能威力 +40%",
      }),
    );
  });

  test("uses the target side's starfall mark and does not trigger it for phantom skills", () => {
    const marked = battleInput({
      marks: {
        attacker: {
          negative: { id: null, stacks: 0 },
          positive: { id: null, stacks: 0 },
        },
        defender: {
          negative: { id: "starfall", stacks: 3 },
          positive: { id: null, stacks: 0 },
        },
      },
    });
    const nonPhantom = calculateMatchup(snapshot, marked).forward.selectedResult;
    const phantom = calculateMatchup(snapshot, {
      ...marked,
      sides: {
        ...marked.sides,
        attacker: {
          ...marked.sides.attacker,
          skills: {
            single: "skill_mana",
            four: ["skill_mana", null, null, null],
          },
        },
      },
      directions: {
        ...marked.directions,
        forward: {
          ...marked.directions.forward,
          context: { energy: 3 },
        },
      },
    }).forward.selectedResult;

    expect(nonPhantom.additionalDamage).toBeGreaterThan(0);
    expect(nonPhantom.markSettlements).toContainEqual(
      expect.objectContaining({
        markId: "starfall",
        side: "defender",
        stacks: 3,
        status: "applied",
      }),
    );
    expect(phantom.additionalDamage).toBe(0);
    expect(phantom.markSettlements).toContainEqual(
      expect.objectContaining({
        markId: "starfall",
        side: "defender",
        stacks: 3,
        status: "inactive",
        text: "星陨 ×3 幻系不触发",
      }),
    );
  });

  test("keeps attack and defense marks independent when calculating the reverse direction", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        marks: {
          attacker: {
            negative: { id: "starfall", stacks: 2 },
            positive: { id: null, stacks: 0 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: "attack", stacks: 3 },
          },
        },
      }),
    ).reverse.selectedResult;

    expect(result.markSettlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          markId: "attack",
          side: "defender",
          stacks: 3,
          status: "applied",
        }),
        expect.objectContaining({
          markId: "starfall",
          side: "attacker",
          stacks: 2,
          status: "applied",
        }),
      ]),
    );
  });

  test("uses the original-site 1.25 same-type bonus by default", () => {
    const result = calculateMatchup(snapshot, battleInput()).reverse.selectedResult;
    const stab = result.formulaSteps.find((step) => step.label === "本系");

    expect(stab).toMatchObject({ input: 1.25 });
  });

  test("routes single and four-skill selections through the same engine", () => {
    const single = calculateMatchup(snapshot, battleInput());
    const four = calculateMatchup(
      snapshot,
      battleInput({ mode: "four" }),
    );

    expect(single.forward.selectedResult.totalDamage).toEqual(
      expect.any(Number),
    );
    expect(four.forward.results).toHaveLength(4);
    expect(four.forward.selectedResult.totalDamage).toBe(
      single.forward.selectedResult.totalDamage,
    );
    expect(four.reverse.selectedResult.totalDamage).toBe(
      single.reverse.selectedResult.totalDamage,
    );
  });

  test("derives Comet power from the attacker's current and maximum HP", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_comet", [
            {
              context: { attackerHpPercent: 0 },
              skillId: "skill_comet",
            },
            null,
            null,
            null,
          ]),
        },
        directions: {
          reverse: {
            currentHp: 204,
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(140);
    expect(result.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: 50,
          label: "生命比例威力",
          after: 140,
        }),
      ]),
    );
  });

  test("applies Color Dispersion's mixed-blood bonus as final damage without changing power", () => {
    const base = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_color_dispersion", [
            "skill_color_dispersion",
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;
    const boosted = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_color_dispersion", [
            {
              context: { enemyIsMixedBloodline: true },
              skillId: "skill_color_dispersion",
            },
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;
    const finalStep = boosted.formulaSteps.find(
      ({ label }) => label === "减伤、连击与最终倍率",
    );

    expect(base).toMatchObject({
      skillPower: 80,
      totalDamage: 63,
    });
    expect(boosted).toMatchObject({
      skillPower: 80,
      totalDamage: 94,
    });
    expect(finalStep.input.finalDamageMultiplier).toBe(1.5);
  });

  test("applies Friendship Overflow counter doubling after editable four-skill power", () => {
    const baseEntry = {
      context: {
        counterTriggered: false,
        friendshipMode: "counter",
      },
      overrides: { basePower: 100 },
      skillId: "skill_friendship_overflow",
    };
    const counterEntry = {
      ...baseEntry,
      context: {
        ...baseEntry.context,
        counterTriggered: true,
      },
    };
    const calculate = (entry) =>
      calculateMatchup(
        snapshot,
        battleInput({
          mode: "four",
          sides: {
            attacker: side("spirit_sonic_dog", "skill_friendship_overflow", [
              entry,
              null,
              null,
              null,
            ]),
          },
        }),
      ).forward.selectedResult;

    expect(calculate(baseEntry)).toMatchObject({
      skillPower: 100,
      totalDamage: 79,
    });
    expect(calculate(counterEntry)).toMatchObject({
      skillPower: 200,
      totalDamage: 158,
    });
  });

  test("returns damage first for Skybreaker and applies its condition per skill", () => {
    const skybreakerSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_skybreaker"] }
          : spirit,
      ),
      traits: [
        {
          id: "trait_skybreaker",
          name: "破空",
          description: "若先于敌方攻击，本次技能威力+75%。",
        },
      ],
    };
    const base = calculateMatchup(
      skybreakerSnapshot,
      battleInput(),
    ).forward.selectedResult;
    const triggered = calculateMatchup(
      skybreakerSnapshot,
      battleInput({
        directions: {
          forward: { context: { actedBeforeEnemy: true } },
        },
      }),
    ).forward.selectedResult;
    const four = calculateMatchup(
      skybreakerSnapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: {
            ...side("spirit_sonic_dog", "skill_wind", [
              {
                context: { actedBeforeEnemy: true },
                skillId: "skill_wind",
              },
              null,
              null,
              null,
            ]),
          },
        },
      }),
    ).forward.results[0];

    expect(base).toMatchObject({
      effectivePower: 80,
      status: "exact",
      totalDamage: expect.any(Number),
    });
    expect(triggered).toMatchObject({
      effectivePower: 140,
      status: "exact",
      totalDamage: expect.any(Number),
    });
    expect(four).toMatchObject({
      effectivePower: 140,
      status: "exact",
      totalDamage: triggered.totalDamage,
    });
  });

  test("applies editable trait stacks to the correct damage component", () => {
    const traitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_stack"] }
          : spirit,
      ),
      traits: [
        {
          id: "trait_stack",
          name: "蒸汽膨胀",
          description:
            "己方精灵每使用1次火系技能，自己入场时获得全技能威力+10。",
        },
      ],
    };
    const base = calculateMatchup(
      traitSnapshot,
      battleInput(),
    ).forward.selectedResult;
    const stacked = calculateMatchup(
      traitSnapshot,
      battleInput({
        directions: {
          forward: {
            context: {
              attackerTraitEffect: 10,
              attackerTraitStacks: 3,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(base).toMatchObject({ skillPower: 80, status: "exact" });
    expect(stacked).toMatchObject({
      skillPower: 110,
      status: "exact",
    });
    expect(stacked.totalDamage).toBeGreaterThan(base.totalDamage);
  });

  test("uses editable per-slot power in bilateral four-skill results", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: {
            ...side("spirit_sonic_dog", "skill_wind", [
              {
                overrides: { basePower: 123 },
                skillId: "skill_wind",
              },
              null,
              null,
              null,
            ]),
          },
          defender: {
            ...side("spirit_water", "skill_water", [
              {
                overrides: { basePower: 97 },
                skillId: "skill_water",
              },
              null,
              null,
              null,
            ]),
          },
        },
      }),
    );

    expect(result.forward.results[0]).toMatchObject({
      skillPower: 123,
      status: "exact",
    });
    expect(result.reverse.results[0]).toMatchObject({
      skillPower: 97,
      status: "exact",
    });
  });

  test("keeps a single-skill manual power without applying it to four-skill slots", () => {
    const input = battleInput({
      directions: {
        forward: { overrides: { basePower: 222 } },
      },
    });
    const single = calculateMatchup(snapshot, input);
    const four = calculateMatchup(snapshot, { ...input, mode: "four" });
    const normalFour = calculateMatchup(
      snapshot,
      battleInput({ mode: "four" }),
    );

    expect(single.forward.selectedResult.totalDamage).not.toBe(
      normalFour.forward.selectedResult.totalDamage,
    );
    expect(four.forward.selectedResult.totalDamage).toBe(
      normalFour.forward.selectedResult.totalDamage,
    );
  });

  test("returns base damage when an unverified trait cannot be applied", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        sides: {
          attacker: {
            ...side("spirit_sonic_dog", "skill_wind", [
              "skill_wind",
              null,
              null,
              null,
            ]),
            traits: [
              {
                affectsDamage: true,
                id: "unreviewed-trait",
                name: "未验证特性",
              },
            ],
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      skillPower: 80,
      status: "exact",
      warnings: ["未计入特性：未验证特性"],
    });
    expect(result.totalDamage).toBeGreaterThan(0);
  });

  test("uses game-displayed power without reapplying type, level, or trait power", () => {
    const input = battleInput({
      sides: {
        attacker: {
          ...side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            null,
            null,
            null,
          ]),
          types: ["翼"],
        },
      },
      directions: {
        forward: {
          overrides: {
            attackDefenseLevelMultiplier: 1.8,
            displayedPower: 200,
            otherPowerMultipliers: [2],
            powerMode: "displayed",
            typeMultiplier: 2,
          },
        },
      },
    });
    const result = calculateMatchup(snapshot, input).forward.selectedResult;
    const labels = result.formulaSteps.map((step) => step.label);

    expect(result.effectivePower).toBe(250);
    expect(labels).toContain("游戏内显示威力");
    expect(labels).not.toContain("属性克制");
    expect(labels).not.toContain("攻防等级");
    expect(labels).not.toContain("其他威力乘区");
  });

  test("keeps fractional effective power until the damage numerator is rounded", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            skillPowerPercentAdds: [0.017],
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.effectivePower).toBe(81);
    expect(result.totalDamage).toBe(98);
  });

  test("keeps fractional same-type power until the damage numerator is rounded", () => {
    const lightSpear = {
      basePower: 30,
      category: "physical",
      cost: 3,
      description: "造成物伤，3连击。",
      id: "skill_light_spear",
      name: "光之矛",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "光",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, lightSpear],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: {
          attacker: {
            ...side("spirit_sonic_dog", lightSpear.id, [
              {
                hitCount: 3,
                skillId: lightSpear.id,
              },
              null,
              null,
              null,
            ]),
            panelStats: {
              hp: 359,
              magicalAttack: 206,
              magicalDefense: 195,
              physicalAttack: 246,
              physicalDefense: 179,
              speed: 209,
            },
            types: ["火", "光"],
          },
          defender: {
            ...side("spirit_water", "skill_water", ["skill_water"]),
            panelStats: {
              hp: 393,
              magicalAttack: 215,
              magicalDefense: 203,
              physicalAttack: 101,
              physicalDefense: 175,
              speed: 254,
            },
            types: ["地", "光"],
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      effectivePower: 38,
      hitCount: 3,
      mainDamage: 141,
      totalDamage: 141,
    });
  });

  test("applies rainy weather as an independent 1.75 multiplier to water skills", () => {
    const dry = calculateMatchup(snapshot, battleInput()).reverse.selectedResult;
    const rainy = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          reverse: {
            context: { weatherRainTurns: 8 },
          },
        },
      }),
    ).reverse.selectedResult;
    const weather = rainy.formulaSteps.find((step) => step.label === "天气");

    expect(weather).toMatchObject({
      input: {
        multiplier: 1.75,
        remainingTurns: 8,
        weather: "雨天",
      },
    });
    expect(weather.after).toBeCloseTo(weather.before * 1.75, 8);
    expect(rainy.totalDamage).toBeGreaterThan(dry.totalDamage);
  });

  test("records formula power and every damage rounding boundary", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            context: { weatherRainTurns: 8 },
            skillPowerPercentAdds: [0.017],
          },
        },
      }),
    ).forward.selectedResult;
    const steps = Object.fromEntries(
      result.formulaSteps.map((step) => [step.label, step]),
    );

    expect(steps["显示威力"]).toMatchObject({
      before: expect.any(Number),
      after: result.effectivePower,
    });
    expect(steps["等级系数与攻防比"].input).toMatchObject({
      calculationPower: expect.any(Number),
      displayedPower: result.effectivePower,
      roundedNumerator: expect.any(Number),
      unroundedNumerator: expect.any(Number),
      unroundedOneHit: expect.any(Number),
    });
    expect(steps["减伤、连击与最终倍率"].input).toMatchObject({
      oneHitAfterFinal: expect.any(Number),
    });
  });

  test("adds fixed power before combining all current-skill percentage bonuses", () => {
    const fixedTraitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_fixed"] }
          : spirit,
      ),
      traits: [
        {
          id: "trait_fixed",
          name: "蒸汽膨胀",
          description:
            "己方精灵每使用1次火系技能，自己入场时获得全技能威力+10。",
        },
      ],
    };
    const percentTraitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_percent"] }
          : spirit,
      ),
      traits: [
        {
          id: "trait_percent",
          name: "破空",
          description: "若先于敌方攻击，本次技能威力+75%。",
        },
      ],
    };
    const fixed = calculateMatchup(
      fixedTraitSnapshot,
      battleInput({
        directions: {
          forward: {
            context: {
              attackerTraitEffect: 10,
              attackerTraitStacks: 3,
            },
            skillPowerPercentAdds: [0.5],
          },
        },
      }),
    ).forward.selectedResult;
    const percent = calculateMatchup(
      percentTraitSnapshot,
      battleInput({
        directions: {
          forward: {
            context: { actedBeforeEnemy: true },
            skillPowerPercentAdds: [0.25],
          },
        },
      }),
    ).forward.selectedResult;

    expect(fixed.skillPower).toBe(165);
    expect(percent.skillPower).toBe(160);
  });

  test("combines attack increases and defense decreases additively in the ability layer", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              attackLevelStage: 10,
              defenseLevelStage: -4,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.effectivePower).toBe(192);
    expect(
      result.formulaSteps.find((step) => step.label === "攻防等级"),
    ).toMatchObject({ input: 2.4 });
  });

  test("uses explicit ability stages once and ignores the legacy combined multiplier", () => {
    const stageOnly = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              attackLevelStage: 7,
              defenseLevelStage: 0,
            },
          },
        },
      }),
    ).forward.selectedResult;
    const withLegacyMultiplier = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              attackDefenseLevelMultiplier: 9,
              attackLevelStage: 7,
              defenseLevelStage: 0,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(withLegacyMultiplier.damage).toBe(stageOnly.damage);
    expect(withLegacyMultiplier.effectivePower).toBe(stageOnly.effectivePower);
    expect(
      withLegacyMultiplier.formulaSteps.find(
        (step) => step.label === "攻防等级",
      ),
    ).toMatchObject({ input: 1.7 });
  });

  test("applies attack-percent traits in the ability layer instead of the panel stat", () => {
    const traitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_focus"] }
          : spirit,
      ),
      traits: [
        {
          affectsDamage: true,
          description: "入场首回合，获得物攻+100%。",
          id: "trait_focus",
          name: "专注力",
        },
      ],
    };
    const result = calculateMatchup(
      traitSnapshot,
      battleInput({
        directions: {
          forward: { context: { traitActivated: true } },
        },
      }),
    ).forward.selectedResult;
    const panelStep = result.formulaSteps.find(
      (step) => step.label === "攻击面板",
    );

    expect(panelStep.after).toBe(panelStep.before);
    expect(result.effectivePower).toBe(160);
  });

  test("reports damage percentage against maximum HP while lethal uses current HP", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: { currentHp: 50 },
        },
      }),
    ).forward.selectedResult;

    expect(result.hpPercent).toBeCloseTo(
      result.totalDamage / 434 * 100,
      10,
    );
    expect(result.lethal).toBe(true);
  });

  test("changing forward reduction does not change reverse results", () => {
    const before = calculateMatchup(snapshot, battleInput());
    const after = calculateMatchup(
      snapshot,
      battleInput({
        directions: { forward: { reduction: 0.5 } },
      }),
    );

    expect(after.forward.results).not.toEqual(before.forward.results);
    expect(after.reverse.results).toEqual(before.reverse.results);
  });

  test("changing forward starfall does not change reverse results", () => {
    const before = calculateMatchup(snapshot, battleInput());
    const after = calculateMatchup(
      snapshot,
      legacyBattleInput({
        directions: { forward: { starfallStacks: 2 } },
      }),
    );

    expect(after.forward.selectedResult.totalDamage).toBeGreaterThan(
      before.forward.selectedResult.totalDamage,
    );
    expect(after.reverse.results).toEqual(before.reverse.results);
  });

  test("keeps fractional starfall power until its damage numerator is rounded", () => {
    const result = calculateMatchup(
      snapshot,
      legacyBattleInput({
        sides: {
          attacker: {
            ...side("spirit_sonic_dog", "skill_wind", ["skill_wind"]),
            panelStats: {
              hp: 100,
              magicalAttack: 100,
              magicalDefense: 100,
              physicalAttack: 100,
              physicalDefense: 100,
              speed: 100,
            },
            types: [],
          },
          defender: {
            ...side("spirit_water", "skill_water", ["skill_water"]),
            panelStats: {
              hp: 100,
              magicalAttack: 100,
              magicalDefense: 100,
              physicalAttack: 100,
              physicalDefense: 2,
              speed: 100,
            },
            types: ["光"],
          },
        },
        directions: {
          forward: { starfallStacks: 1 },
        },
      }),
    ).forward.selectedResult;

    expect(result.additionalDamage).toBe(22);
  });

  test("propagates needs-input rule status instead of inventing damage", () => {
    const unresolvedSkill = {
      id: "skill_enemy_power",
      name: "怨力打击",
      type: "恶",
      category: "physical",
      basePower: 1,
      ruleId: "enemy_skill_power_multiplier",
      ruleParams: {
        contextKey: "enemySkillPower",
        multiplier: 3,
      },
      provenance: { ruleId: { source: "fixture" } },
    };
    const input = battleInput({
      sides: {
        attacker: side("spirit_sonic_dog", unresolvedSkill.id, [
          unresolvedSkill.id,
          null,
          null,
          null,
        ]),
      },
    });
    const result = calculateMatchup(
      { ...snapshot, skills: [...snapshot.skills, unresolvedSkill] },
      input,
    ).forward.selectedResult;

    expect(result).toMatchObject({
      status: "needs_input",
      totalDamage: null,
      inputs: [{ key: "enemySkillPower" }],
    });
  });

  test("treats null direction overrides as absent", () => {
    const before = calculateMatchup(snapshot, battleInput());
    const after = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            currentHp: null,
            reduction: null,
            finalDamageMultiplier: null,
            overrides: { basePower: null },
          },
        },
      }),
    );

    expect(after.forward.selectedResult.totalDamage).toBe(
      before.forward.selectedResult.totalDamage,
    );
    expect(after.forward.selectedResult.hpPercent).toBe(
      before.forward.selectedResult.hpPercent,
    );
  });

  test("records cumulative before-and-after values for power multipliers", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              stabMultiplier: 1.5,
              typeMultiplier: 2,
              attackDefenseLevelMultiplier: 1.2,
              otherPowerMultipliers: [1.1],
            },
          },
        },
      }),
    ).forward.selectedResult;
    const steps = Object.fromEntries(
      result.formulaSteps.map((step) => [step.label, step]),
    );

    expect(steps["本系"]).toMatchObject({ before: 80, after: 120 });
    expect(steps["属性克制"]).toMatchObject({ before: 120, after: 240 });
    expect(steps["攻防等级"]).toMatchObject({ before: 240, after: 288 });
    expect(steps["其他威力乘区"]).toMatchObject({
      before: 288,
      after: 316.8,
    });
    expect(steps["显示威力"]).toMatchObject({ before: 316.8, after: 317 });
  });

  test("accepts the state-layer stab and type-effectiveness override names", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              stab: 1.5,
              typeEffectiveness: 2,
            },
          },
        },
      }),
    ).forward.selectedResult;
    const steps = Object.fromEntries(
      result.formulaSteps.map((step) => [step.label, step]),
    );

    expect(steps["本系"]).toMatchObject({ input: 1.5, after: 120 });
    expect(steps["属性克制"]).toMatchObject({ after: 240 });
  });

  test("applies reviewed conditional power in the complete damage pipeline", () => {
    const headOnBlow = {
      basePower: 80,
      category: "physical",
      cost: 3,
      description: "造成物伤，若敌方本回合更换精灵，本次技能威力+100。",
      id: "skill_head_on_blow",
      name: "当头棒喝",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "普通",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, headOnBlow],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", headOnBlow.id, [
            headOnBlow.id,
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: {
            context: { enemySwitchedThisTurn: true },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      hitCount: 1,
      skillPower: 180,
      status: "exact",
    });
  });

  test("uses the defender's carried four skills for Ice Sweep power", () => {
    const iceSweep = {
      basePower: 1,
      category: "magical",
      cost: 4,
      description: "造成魔伤，本技能威力等于敌方精灵技能总能耗的10倍。",
      id: "skill_ice_sweep",
      name: "冰锋横扫",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "冰",
    };
    const fixture = {
      ...snapshot,
      skills: [
        ...snapshot.skills.map((skill) =>
          skill.id === "skill_water" ? { ...skill, cost: 3 } : skill,
        ),
        iceSweep,
      ],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", iceSweep.id, [
            iceSweep.id,
            null,
            null,
            null,
          ]),
          defender: side("spirit_water", "skill_water", [
            "skill_water",
            "skill_water",
            "skill_water",
            "skill_water",
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      skillPower: 120,
      status: "exact",
    });
  });

  test("uses carried four skills for Polarization in single-skill mode", () => {
    const fixture = {
      ...snapshot,
      traits: [{ id: "polarization", name: "偏振" }],
    };
    const defender = {
      ...side("spirit_water", "skill_water", [
        "skill_wind",
        null,
        null,
        null,
      ]),
      traitIds: ["polarization"],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({ sides: { defender } }),
    ).forward.selectedResult;
    const polarization = result.formulaSteps.find(
      (step) => step.label === "偏振",
    );

    expect(polarization).toMatchObject({
      input: true,
      after: 0.6,
    });
  });

  test("uses the higher attack and its matching defense for dual attacks", () => {
    const dualSkill = {
      basePower: 80,
      category: "dual",
      cost: 3,
      id: "skill_dual",
      name: "愿力冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "普通",
    };
    const physicalSkill = {
      ...dualSkill,
      category: "physical",
      id: "skill_physical_control",
      name: "物攻对照",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, dualSkill, physicalSkill],
    };
    const dual = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", dualSkill.id, [
            dualSkill.id,
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;
    const physical = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", physicalSkill.id, [
            physicalSkill.id,
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(dual).toMatchObject({ status: "exact" });
    expect(dual.totalDamage).toBe(physical.totalDamage);
  });

  test("uses the four-skill slot position for reviewed position bonuses", () => {
    const steelTorrent = {
      basePower: 70,
      category: "physical",
      cost: 4,
      description: "位于技能1时，本次技能威力+90。",
      id: "skill_steel_torrent",
      name: "钢铁洪流",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "机械",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, steelTorrent],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", steelTorrent.id, [
            steelTorrent.id,
            steelTorrent.id,
            null,
            null,
          ]),
        },
      }),
    ).forward.results;

    expect(result[0].skillPower).toBe(160);
    expect(result[1].skillPower).toBe(70);
  });

  test("lets reviewed dynamic hit count override the stored four-skill default", () => {
    const comboClaw = {
      basePower: 30,
      category: "physical",
      cost: 2,
      description: "造成物伤，2连击，应对状态：本次技能连击数翻倍。",
      id: "skill_combo_claw",
      name: "连续爪击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "普通",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, comboClaw],
    };
    const attacker = side("spirit_sonic_dog", comboClaw.id, [
      {
        context: { counterTriggered: true },
        hitCount: 2,
        skillId: comboClaw.id,
      },
      null,
      null,
      null,
    ]);
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: { attacker },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      hitCount: 4,
      skillPower: 30,
      status: "exact",
    });
  });

  test("applies Test Flight's selected permanent growth to four-skill damage", () => {
    const testFlight = {
      basePower: 20,
      category: "physical",
      cost: 2,
      description: "造成物伤，2连击。选择：每次使用后本技能威力永久+10或连击数永久+1。",
      id: "skill_test_flight",
      name: "试飞",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "翼",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, testFlight],
    };
    const attacker = side("spirit_sonic_dog", testFlight.id, [
      {
        context: { flightMode: "hits", skillUseCount: 3 },
        hitCount: 2,
        skillId: testFlight.id,
      },
      null,
      null,
      null,
    ]);
    const result = calculateMatchup(
      fixture,
      battleInput({ mode: "four", sides: { attacker } }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      hitCount: 5,
      skillPower: 20,
      status: "exact",
    });
  });

  test("does not calculate Calamity against the defender before countering", () => {
    const calamity = {
      basePower: 60,
      category: "physical",
      cost: 1,
      description: "对自己造成物伤，应对状态：改为对敌方造成物伤，且本次技能威力+120。",
      id: "skill_calamity",
      name: "灾厄",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "恶",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, calamity],
    };
    const baseAttacker = side("spirit_sonic_dog", calamity.id, [
      calamity.id,
      null,
      null,
      null,
    ]);
    const unresolved = calculateMatchup(
      fixture,
      battleInput({ sides: { attacker: baseAttacker } }),
    ).forward.selectedResult;
    const resolved = calculateMatchup(
      fixture,
      battleInput({
        directions: { forward: { context: { counterTriggered: true } } },
        sides: { attacker: baseAttacker },
      }),
    ).forward.selectedResult;

    expect(unresolved).toMatchObject({
      reason: "默认对自身造成伤害，开启应对后计算对敌伤害",
      status: "needs_input",
    });
    expect(resolved).toMatchObject({
      skillPower: 180,
      status: "exact",
    });
  });

  test("requires an explicit position for position-based skills in single mode", () => {
    const steelTorrent = {
      basePower: 70,
      category: "physical",
      cost: 4,
      description: "位于技能1时，本次技能威力+90。",
      id: "skill_steel_torrent_single",
      name: "钢铁洪流",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "机械",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, steelTorrent],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", steelTorrent.id, [
            steelTorrent.id,
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      status: "needs_input",
      inputs: [{ key: "skillPosition" }],
    });
  });

  test("removes resistance only when the reviewed skill condition is active", () => {
    const grassBugImpact = {
      basePower: 50,
      category: "physical",
      cost: 3,
      description: "若敌方本回合更换精灵，本次技能威力+50，且无视抵抗。",
      id: "skill_grass_bug_impact",
      name: "草虫冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "虫",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, grassBugImpact],
    };
    const shared = {
      sides: {
        attacker: side("spirit_sonic_dog", grassBugImpact.id, [
          grassBugImpact.id,
          null,
          null,
          null,
        ]),
      },
      directions: {
        forward: {
          overrides: { typeMultiplier: 0.5 },
        },
      },
    };
    const normal = calculateMatchup(
      fixture,
      battleInput(shared),
    ).forward.selectedResult;
    const triggered = calculateMatchup(
      fixture,
      battleInput({
        ...shared,
        directions: {
          forward: {
            context: { enemySwitchedThisTurn: true },
            overrides: { typeMultiplier: 0.5 },
          },
        },
      }),
    ).forward.selectedResult;

    expect(normal.effectivePower).toBe(25);
    expect(triggered).toMatchObject({
      effectivePower: 100,
      skillPower: 100,
    });
  });

  test("returns auditable versions and no random state", () => {
    const result = calculateMatchup(snapshot, battleInput());
    const serialized = JSON.stringify(result);

    expect(result.versions).toEqual({
      data: "s3-fixture",
      rules: "2026-07-23",
    });
    expect(result.forward.selectedResult).toEqual(
      expect.objectContaining({
        totalDamage: expect.any(Number),
        hpPercent: expect.any(Number),
        lethal: expect.any(Boolean),
        status: "exact",
        formulaSteps: expect.any(Array),
        sources: expect.any(Array),
      }),
    );
    expect(serialized).not.toMatch(/"random"|"seed"|"minimum"|"maximum"/);
  });
});

describe("inherited penetration stacks", () => {
  const chessSnapshot = {
    meta: {
      id: "chess-fixture",
      rulesVersion: "2026-07-31",
    },
    spirits: [
      {
        id: "spirit_king",
        baseName: "棋契陛下",
        fullName: "棋契陛下（白棋棋绮后分支）",
        variantName: "白棋棋绮后分支",
        types: ["武", "地"],
        raceStats: {
          hp: 100,
          speed: 100,
          physicalAttack: 100,
          magicalAttack: 100,
          physicalDefense: 100,
          magicalDefense: 100,
        },
        traitIds: ["trait_royal"],
      },
      {
        id: "spirit_target",
        fullName: "测试目标",
        types: ["普通"],
        raceStats: {
          hp: 1000,
          speed: 100,
          physicalAttack: 100,
          magicalAttack: 100,
          physicalDefense: 100,
          magicalDefense: 100,
        },
        traitIds: [],
      },
    ],
    skills: [
      {
        id: "skill_sand_trap",
        name: "鸣沙陷阱",
        type: "地",
        category: "physical",
        basePower: 60,
        ruleId: "physical_defense_difference",
      },
      {
        id: "skill_plain",
        name: "测试攻击",
        type: "普通",
        category: "physical",
        basePower: 100,
      },
    ],
    traits: [
      {
        id: "trait_royal",
        name: "御驾亲征",
        description: "棋契陛下大幅提升种族资质。",
      },
    ],
    typeChart: null,
  };

  function chessSide(spiritId, skillId) {
    return {
      spiritId,
      panelStats: {
        hp: spiritId === "spirit_target" ? 1000 : 100,
        speed: 100,
        physicalAttack: 100,
        magicalAttack: 100,
        physicalDefense: 100,
        magicalDefense: 100,
      },
      skills: {
        single: skillId,
        four: [skillId, null, null, null],
      },
    };
  }

  function chessBattle({
    attackerId = "spirit_king",
    attackerSkill = "skill_sand_trap",
    defenderId = "spirit_target",
    forwardContext = {},
  } = {}) {
    return {
      mode: "single",
      level: 60,
      sides: {
        attacker: chessSide(attackerId, attackerSkill),
        defender: chessSide(defenderId, "skill_plain"),
      },
      directions: {
        forward: {
          context: forwardContext,
          currentHp: defenderId === "spirit_target" ? 1000 : 100,
          finalDamageMultiplier: 1,
          hitCount: 1,
          overrides: {},
          reduction: 1,
          selectedSkillIndex: 0,
          starfallStacks: 0,
        },
        reverse: {
          context: {},
          currentHp: attackerId === "spirit_target" ? 1000 : 100,
          finalDamageMultiplier: 1,
          hitCount: 1,
          overrides: {},
          reduction: 1,
          selectedSkillIndex: 0,
          starfallStacks: 0,
        },
      },
    };
  }

  test("uses inherited physical defense when resolving Sand Trap power", () => {
    const result = calculateMatchup(
      chessSnapshot,
      chessBattle({
        forwardContext: { attackerTraitStacks: 4 },
      }),
    ).forward.selectedResult;
    const step = result.formulaSteps.find(
      (candidate) => candidate.label === "物防差威力",
    );

    expect(step).toMatchObject({
      after: 130,
      before: 20,
      input: { attacker: 120, defender: 100 },
    });
    expect(result.skillPower).toBe(130);
  });

  test("uses the same inherited stacks to reduce incoming damage", () => {
    const withoutStacks = calculateMatchup(
      chessSnapshot,
      chessBattle({
        attackerId: "spirit_target",
        attackerSkill: "skill_plain",
        defenderId: "spirit_king",
      }),
    ).forward.selectedResult;
    const withStacks = calculateMatchup(
      chessSnapshot,
      chessBattle({
        attackerId: "spirit_target",
        attackerSkill: "skill_plain",
        defenderId: "spirit_king",
        forwardContext: { defenderTraitStacks: 4 },
      }),
    ).forward.selectedResult;

    expect(withStacks.totalDamage).toBeLessThan(withoutStacks.totalDamage);
  });
});
