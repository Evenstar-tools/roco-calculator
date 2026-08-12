import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";

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
    {
      id: "skill_listen_bridge",
      name: "听桥",
      type: "武",
      category: "defense",
      cost: 4,
      basePower: 0,
      description:
        "减伤60%，应对攻击：对敌方造成武系物理伤害，威力与被应对技能相等。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_hard_gate",
      name: "硬门",
      type: "武",
      category: "defense",
      cost: 2,
      basePower: 0,
      description: "应对攻击：打断被应对技能，并造成90威力物伤。",
      ruleId: null,
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

const beastFlowerTrait = {
  id: "trait_beast_flower",
  name: "稀兽花宝",
  description: "根据自己的血脉，入场时获得不同效果。",
};

function beastFlowerSnapshot({ combo = false } = {}) {
  return {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) => ({
      ...spirit,
      traitIds: [beastFlowerTrait.id],
    })),
    skills: snapshot.skills.map((skill) =>
      combo && skill.id === "skill_wind"
        ? { ...skill, description: "造成物理伤害，3连击。" }
        : skill,
    ),
    traits: [beastFlowerTrait],
  };
}

function bloodlineContext(role, bloodlineType) {
  const controls = getTraitEffectInputs(beastFlowerTrait, role);
  return Object.fromEntries(controls.map((control) => [
    control.id,
    control.contextKey === "bloodlineType" ? bloodlineType : true,
  ]));
}

const contractShapeTrait = {
  id: "trait_contract_shape",
  name: "契约的形状",
  description: "根据捕捉所用的咕噜球，入场时获得不同效果。",
};

function contractShapeSnapshot({ combo = false, skill = null } = {}) {
  return {
    ...snapshot,
    spirits: snapshot.spirits.map((spirit) => ({
      ...spirit,
      traitIds: [contractShapeTrait.id],
    })),
    skills: snapshot.skills.map((entry) => {
      if (skill && entry.id === "skill_wind") return skill;
      return combo && entry.id === "skill_wind"
        ? { ...entry, description: "造成物理伤害，3连击。" }
        : entry;
    }),
    traits: [contractShapeTrait],
  };
}

function contractContext(role, ballType, prismEffect = "") {
  const controls = getTraitEffectInputs(contractShapeTrait, role);
  return Object.fromEntries(controls.map((control) => [
    control.id,
    control.contextKey === "contractBallType" ? ballType : prismEffect,
  ]));
}

describe("calculateMatchup", () => {
  test("换碟为午夜噪音的每一段先增加5点固定基础威力，再结算5连击", () => {
    const trait = {
      id: "trait-disc-swap",
      name: "换碟",
      description: "指定音波技能增加固定基础威力。",
    };
    const midnightNoise = {
      id: "skill-midnight-noise",
      name: "午夜噪音",
      type: "幽",
      category: "magical",
      cost: 4,
      basePower: 20,
      description: "造成魔法伤害，5连击。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    };
    const discSwapSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      skills: [...snapshot.skills, midnightNoise],
      traits: [trait],
    };

    const result = calculateMatchup(
      discSwapSnapshot,
      battleInput({
        directions: { forward: { hitCount: 5 } },
        sides: {
          attacker: side("spirit_sonic_dog", midnightNoise.id, [
            midnightNoise.id,
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(25);
    expect(result.totalDamage % 5).toBe(0);
    expect(result.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          after: 5,
          label: expect.stringContaining("换碟"),
        }),
      ]),
    );
  });

  test("勾选固定速度特性后向面板暴露最终速度", () => {
    const warningTrait = {
      description: "敌方技能足以击败自己时，速度+50。",
      id: "trait_warning",
      name: "预警",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [warningTrait.id] }
          : spirit,
      ),
      traits: [warningTrait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: {
          forward: {
            context: {
              "attackerTrait.attackerTraitEffect.fff35f45": 50,
              "attackerTrait.traitActivated.8c9e2197": true,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.combatPanel).toMatchObject({
      attacker: { speed: 271 },
    });
  });

  test("选择状态技能时仍向面板暴露已触发的速度特性", () => {
    const warningTrait = {
      description: "敌方技能足以击败自己时，速度+50。",
      id: "trait_warning_status",
      name: "预警",
    };
    const statusSkill = {
      basePower: 0,
      category: "status",
      id: "skill_status_only",
      name: "状态测试",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "普通",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, statusSkill],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [warningTrait.id] }
          : spirit,
      ),
      traits: [warningTrait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", statusSkill.id, [
            statusSkill.id,
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: {
            context: {
              "attackerTrait.attackerTraitEffect.fff35f45": 50,
              "attackerTrait.traitActivated.8c9e2197": true,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      combatPanel: { attacker: { speed: 271 } },
      status: "unsupported",
    });
  });

  test("硬门按固定90威力结算武系物理伤害", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_wind", [
          "skill_hard_gate",
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
          overrides: {
            attackerStat: 100,
            defenderDefense: 100,
            stabMultiplier: 1,
            typeMultiplier: 1,
          },
        },
      },
    });

    expect(calculateMatchup(snapshot, input).forward.results[0]).toMatchObject({
      hitCount: 1,
      skillName: "硬门",
      skillPower: 90,
      status: "exact",
      totalDamage: 81,
      typeLabel: "武",
    });
  });

  test("听桥继承对方增益后的技能面板威力并按单段武系物理伤害反弹", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_wind", [
          {
            skillId: "skill_wind",
            hitCount: 5,
          },
          null,
          null,
          null,
        ]),
        defender: side("spirit_water", "skill_water", [
          "skill_listen_bridge",
          null,
          null,
          null,
        ]),
      },
      directions: {
        forward: {
          selectedSkillIndex: 0,
          overrides: {
            fixedPowerAdd: 20,
            skillPowerPercentAdds: [0.5],
          },
        },
        reverse: {
          selectedSkillIndex: 0,
          overrides: {
            attackerStat: 100,
            defenderDefense: 100,
            stabMultiplier: 1,
            typeMultiplier: 1,
          },
        },
      },
    });

    const result = calculateMatchup(snapshot, input).reverse.results[0];

    expect(result).toMatchObject({
      hitCount: 1,
      reflectedPower: 150,
      reflectedSourceSkillName: "风力冲击",
      skillName: "听桥",
      skillPower: 150,
      status: "exact",
      totalDamage: 135,
    });
  });

  test("稀兽花宝普通血脉只增加一次固定威力", () => {
    const input = battleInput({
      directions: {
        forward: { context: bloodlineContext("attacker", "normal") },
      },
    });
    const result = calculateMatchup(beastFlowerSnapshot(), input).forward.selectedResult;

    expect(result.skillPower).toBe(120);
    expect(result.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ bloodlineType: "normal", side: "attacker" }),
    ]));
    expect(result.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "普通血脉", input: "+40 固定威力" }),
    ]));
  });

  test("稀兽花宝按当前技能类别应用攻防能力等级", () => {
    const martial = calculateMatchup(beastFlowerSnapshot(), battleInput({
      directions: {
        forward: { context: bloodlineContext("attacker", "martial") },
      },
    })).forward.selectedResult;
    const light = calculateMatchup(beastFlowerSnapshot(), battleInput({
      directions: {
        forward: { context: bloodlineContext("attacker", "light") },
      },
    })).forward.selectedResult;
    const machine = calculateMatchup(beastFlowerSnapshot(), battleInput({
      directions: {
        forward: { context: bloodlineContext("defender", "machine") },
      },
    })).forward.selectedResult;
    const base = calculateMatchup(beastFlowerSnapshot(), battleInput()).forward.selectedResult;

    expect(martial.totalDamage).toBeGreaterThan(base.totalDamage);
    expect(light.totalDamage).toBe(base.totalDamage);
    expect(machine.totalDamage).toBeLessThan(base.totalDamage);
  });

  test("稀兽花宝翼与地血脉只修正明确声明的连击", () => {
    const wing = calculateMatchup(beastFlowerSnapshot({ combo: true }), battleInput({
      directions: {
        forward: { context: bloodlineContext("attacker", "wing"), hitCount: 3 },
      },
    })).forward.selectedResult;
    const earth = calculateMatchup(beastFlowerSnapshot({ combo: true }), battleInput({
      directions: {
        forward: { context: bloodlineContext("defender", "earth"), hitCount: 3 },
      },
    })).forward.selectedResult;
    const singleWing = calculateMatchup(beastFlowerSnapshot(), battleInput({
      directions: {
        forward: { context: bloodlineContext("attacker", "wing") },
      },
    })).forward.selectedResult;

    expect(wing.hitCount).toBe(6);
    expect(earth.hitCount).toBe(1);
    expect(singleWing.hitCount).toBe(1);
  });

  test("稀兽花宝电与地血脉先修正速度再计算动态威力", () => {
    const speedSkill = {
      id: "skill_beast_speed",
      name: "闪击",
      type: "翼",
      category: "physical",
      basePower: 60,
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const fixture = {
      ...beastFlowerSnapshot(),
      skills: [...snapshot.skills, speedSkill],
    };
    const attackerSide = side("spirit_sonic_dog", speedSkill.id, [
      speedSkill.id,
      null,
      null,
      null,
    ]);
    const baseInput = battleInput({ sides: { attacker: attackerSide } });
    const base = calculateMatchup(fixture, baseInput).forward.selectedResult;
    const electric = calculateMatchup(fixture, battleInput({
      sides: { attacker: attackerSide },
      directions: {
        forward: { context: bloodlineContext("attacker", "electric") },
      },
    })).forward.selectedResult;
    const earth = calculateMatchup(fixture, battleInput({
      sides: { attacker: attackerSide },
      directions: {
        forward: { context: bloodlineContext("defender", "earth") },
      },
    })).forward.selectedResult;

    expect(electric.effectivePower).toBeGreaterThan(base.effectivePower);
    expect(earth.effectivePower).toBeLessThan(base.effectivePower);
  });

  test("稀兽花宝幻血脉把两层星陨加到当前目标且幻系技能不触发", () => {
    const marked = battleInput({
      marks: {
        attacker: { negative: { id: null, stacks: 0 }, positive: { id: null, stacks: 0 } },
        defender: { negative: { id: "starfall", stacks: 3 }, positive: { id: null, stacks: 0 } },
      },
      directions: {
        forward: { context: bloodlineContext("attacker", "illusion") },
      },
    });
    const nonIllusion = calculateMatchup(beastFlowerSnapshot(), marked).forward.selectedResult;
    const illusionInput = battleInput({
      ...marked,
      sides: {
        ...marked.sides,
        attacker: side("spirit_sonic_dog", "skill_mana", ["skill_mana", null, null, null]),
      },
    });
    const illusion = calculateMatchup(beastFlowerSnapshot(), illusionInput).forward.selectedResult;

    expect(nonIllusion.additionalDamage).toBeGreaterThan(0);
    expect(nonIllusion.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "星陨追加伤害", input: expect.objectContaining({ stacks: 5 }) }),
    ]));
    expect(nonIllusion.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        bloodlineType: "illusion",
        text: `幻系血脉｜星陨 ×2 · 追加 ${nonIllusion.additionalDamage} 伤害`,
      }),
    ]));
    expect(illusion.additionalDamage).toBe(0);
    expect(illusion.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "not-triggered", text: expect.stringContaining("幻系技能不触发") }),
    ]));
  });

  test("契约的形状美妙球增加固定威力且不进入百分比乘区两次", () => {
    const fixture = contractShapeSnapshot();
    const base = calculateMatchup(fixture, battleInput()).forward.selectedResult;
    const result = calculateMatchup(fixture, battleInput({
      directions: {
        forward: { context: contractContext("attacker", "beautiful") },
      },
    })).forward.selectedResult;

    expect(result.skillPower).toBe(100);
    expect(result.totalDamage).toBeGreaterThan(base.totalDamage);
    expect(result.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ ballType: "beautiful", side: "attacker" }),
    ]));
    expect(result.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "美妙球", input: "+20 固定威力" }),
    ]));
  });

  test("契约的形状按双方角色应用攻防等级", () => {
    const fixture = contractShapeSnapshot();
    const base = calculateMatchup(fixture, battleInput()).forward.selectedResult;
    const attackerKing = calculateMatchup(fixture, battleInput({
      directions: { forward: { context: contractContext("attacker", "king") } },
    })).forward.selectedResult;
    const defenderKing = calculateMatchup(fixture, battleInput({
      directions: { forward: { context: contractContext("defender", "king") } },
    })).forward.selectedResult;

    expect(attackerKing.totalDamage).toBeGreaterThan(base.totalDamage);
    expect(defenderKing.totalDamage).toBeLessThan(base.totalDamage);
  });

  test("契约的形状光合与绝缘只修正声明连击的技能", () => {
    const fixture = contractShapeSnapshot({ combo: true });
    const photosynthesis = calculateMatchup(fixture, battleInput({
      directions: {
        forward: {
          context: contractContext("attacker", "photosynthesis"),
          hitCount: 3,
        },
      },
    })).forward.selectedResult;
    const insulation = calculateMatchup(fixture, battleInput({
      directions: {
        forward: {
          context: contractContext("defender", "insulation"),
          hitCount: 3,
        },
      },
    })).forward.selectedResult;

    expect(photosynthesis.hitCount).toBe(4);
    expect(insulation.hitCount).toBe(1);
  });

  test("契约的形状速度效果先进入动态威力，淘沙球增加星陨", () => {
    const speedSkill = {
      ...snapshot.skills[0],
      id: "skill_wind",
      name: "闪击",
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const fixture = contractShapeSnapshot({ skill: speedSkill });
    const base = calculateMatchup(fixture, battleInput()).forward.selectedResult;
    const net = calculateMatchup(fixture, battleInput({
      directions: { forward: { context: contractContext("attacker", "net") } },
    })).forward.selectedResult;
    const marked = calculateMatchup(fixture, battleInput({
      marks: {
        attacker: { negative: { id: null, stacks: 0 }, positive: { id: null, stacks: 0 } },
        defender: { negative: { id: "starfall", stacks: 2 }, positive: { id: null, stacks: 0 } },
      },
      directions: { forward: { context: contractContext("attacker", "sand") } },
    })).forward.selectedResult;

    expect(net.effectivePower).toBeGreaterThan(base.effectivePower);
    expect(marked.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "星陨追加伤害", input: expect.objectContaining({ stacks: 3 }) }),
    ]));
  });

  test("契约的形状棱镜按指定效果半值接入伤害", () => {
    const fixture = contractShapeSnapshot();
    const base = calculateMatchup(fixture, battleInput()).forward.selectedResult;
    const prism = calculateMatchup(fixture, battleInput({
      directions: {
        forward: { context: contractContext("attacker", "prism", "beautiful") },
      },
    })).forward.selectedResult;

    expect(prism.skillPower).toBe(90);
    expect(prism.totalDamage).toBeGreaterThan(base.totalDamage);
    expect(prism.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ballType: "prism",
        effectiveBallType: "beautiful",
        text: expect.stringContaining("半值"),
      }),
    ]));
  });
  test("persistent hit-count bonuses only affect skills with a declared combo", () => {
    const comboSnapshot = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? { ...skill, description: "造成物伤，1连击。" }
          : skill,
      ),
    };
    const base = calculateMatchup(
      comboSnapshot,
      battleInput(),
    ).forward.selectedResult;
    const buffed = calculateMatchup(
      comboSnapshot,
      battleInput({
        directions: { forward: { overrides: { hitCountAdd: 3 } } },
      }),
    ).forward.selectedResult;
    const noCombo = calculateMatchup(
      snapshot,
      battleInput({
        directions: { forward: { overrides: { hitCountAdd: 3 } } },
      }),
    ).forward.selectedResult;

    expect(buffed.hitCount).toBe(4);
    expect(buffed.totalDamage).toBe(base.totalDamage * 4);
    expect(noCombo.hitCount).toBe(1);
    expect(noCombo.totalDamage).toBe(base.totalDamage);
  });

  test("暴风眼的连击百分比在固定连击加成后统一结算", () => {
    const comboSnapshot = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? { ...skill, description: "造成物伤，5连击。" }
          : skill,
      ),
    };
    const result = calculateMatchup(
      comboSnapshot,
      battleInput({
        directions: {
          forward: {
            hitCount: 5,
            overrides: { hitCountAdd: 1, hitCountPercentAdd: 2 },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.hitCount).toBe(18);
  });

  test("allows persistent hit-count reductions but never drops below one hit", () => {
    const comboSnapshot = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? { ...skill, description: "造成物伤，5连击。" }
          : skill,
      ),
    };
    const reduced = calculateMatchup(
      comboSnapshot,
      battleInput({
        directions: {
          forward: { hitCount: 5, overrides: { hitCountAdd: -2 } },
        },
      }),
    ).forward.selectedResult;
    const minimum = calculateMatchup(
      comboSnapshot,
      battleInput({
        directions: {
          forward: { hitCount: 5, overrides: { hitCountAdd: -99 } },
        },
      }),
    ).forward.selectedResult;

    expect(reduced.hitCount).toBe(3);
    expect(minimum.hitCount).toBe(1);
  });

  test("侵蚀把中毒层数加到攻击与状态技能的明确连击数", () => {
    const erosionTrait = {
      description: "敌方每有1层中毒效果，自己获得连击数+1。",
      id: "trait_erosion",
      name: "侵蚀",
    };
    const comboAttack = {
      ...snapshot.skills[0],
      description: "造成物伤，3连击。",
      id: "skill_combo_attack",
      name: "撕咬",
    };
    const comboStatus = {
      basePower: 0,
      category: "status",
      cost: 1,
      description: "自己获得物攻+30%，3连击。",
      id: "skill_combo_status",
      name: "三连破",
      type: "普通",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit, index) =>
        index === 0 ? { ...spirit, traitIds: [erosionTrait.id] } : spirit,
      ),
      skills: [...snapshot.skills, comboAttack, comboStatus],
      traits: [erosionTrait],
    };
    const controls = getTraitEffectInputs(erosionTrait, "attacker");
    const context = Object.fromEntries(
      controls.map((control) => [
        control.id,
        control.contextKey === "enemyPoisonStacks" ? 2 : true,
      ]),
    );
    const attackerWith = (skill) =>
      side("spirit_sonic_dog", skill.id, [skill.id, null, null, null]);
    const base = calculateMatchup(
      fixture,
      battleInput({
        sides: { attacker: attackerWith(comboAttack) },
      }),
    ).forward.selectedResult;
    const attack = calculateMatchup(
      fixture,
      battleInput({
        sides: { attacker: attackerWith(comboAttack) },
        directions: { forward: { context } },
      }),
    ).forward.selectedResult;
    const status = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: { attacker: attackerWith(comboStatus) },
        directions: { forward: { context } },
      }),
    ).forward.selectedResult;

    expect(base.hitCount).toBe(3);
    expect(attack.hitCount).toBe(5);
    expect(attack.automaticHitCountAdd).toBe(2);
    expect(attack.totalDamage).toBe((base.totalDamage / 3) * 5);
    expect(attack.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "侵蚀连击", after: 2 }),
    ]));
    expect(status).toMatchObject({
      automaticHitCountAdd: 2,
      hitCount: 5,
      status: "unsupported",
      totalDamage: null,
    });
  });

  test("嫁祸读取攻击方实时生命百分比并增加明确连击", () => {
    const blameShift = {
      description: "自己每失去25%生命，连击数+2。",
      id: "trait_blame_shift",
      name: "嫁祸",
    };
    const comboAttack = {
      ...snapshot.skills[0],
      description: "造成物伤，3连击。",
      id: "skill_blame_combo",
      name: "撕咬",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit, index) =>
        index === 0 ? { ...spirit, traitIds: [blameShift.id] } : spirit,
      ),
      skills: [...snapshot.skills, comboAttack],
      traits: [blameShift],
    };
    const trigger = getTraitEffectInputs(blameShift, "attacker").find(
      (control) => control.contextKey === "traitHitCountActivated",
    );
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", comboAttack.id, [
            comboAttack.id,
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: { context: { [trigger.id]: true } },
          reverse: { context: { currentHpPercent: 50 } },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      automaticHitCountAdd: 4,
      hitCount: 7,
      status: "exact",
    });
    expect(result.formulaSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "嫁祸连击",
        after: 4,
        input: { currentHpPercent: 50 },
      }),
    ]));
  });

  test("无差别过滤勾选后将攻防双方最终连击固定为2，取消后恢复原值", () => {
    const filterTrait = {
      description: "在场时，所有精灵连击数固定为2。",
      id: "trait_indiscriminate_filter",
      name: "无差别过滤",
    };
    const comboAttack = {
      ...snapshot.skills[0],
      description: "造成物伤，5连击。",
      id: "skill_filter_combo",
      name: "五连击",
    };
    const singleAttack = {
      ...snapshot.skills[0],
      description: "造成物理伤害。",
      id: "skill_filter_single",
      name: "单段攻击",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit, index) =>
        index === 0 ? { ...spirit, traitIds: [filterTrait.id] } : spirit,
      ),
      skills: [...snapshot.skills, comboAttack, singleAttack],
      traits: [filterTrait],
    };
    const attackerControl = getTraitEffectInputs(filterTrait, "attacker")[0];
    const defenderControl = getTraitEffectInputs(filterTrait, "defender")[0];
    const configuredSides = {
      attacker: side("spirit_sonic_dog", comboAttack.id, [
        comboAttack.id,
        null,
        null,
        null,
      ]),
      defender: side("spirit_water", singleAttack.id, [
        singleAttack.id,
        null,
        null,
        null,
      ]),
    };
    const baseline = calculateMatchup(
      fixture,
      battleInput({ mode: "four", sides: configuredSides }),
    );
    const filtered = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: configuredSides,
        directions: {
          forward: { context: { [attackerControl.id]: true } },
          reverse: { context: { [defenderControl.id]: true } },
        },
      }),
    );

    expect(baseline.forward.selectedResult.hitCount).toBe(5);
    expect(baseline.reverse.selectedResult.hitCount).toBe(1);
    expect(filtered.forward.selectedResult.hitCount).toBe(2);
    expect(filtered.reverse.selectedResult.hitCount).toBe(1);
    expect(filtered.forward.selectedResult.totalDamage).toBe(
      (baseline.forward.selectedResult.totalDamage / 5) * 2,
    );
    expect(filtered.reverse.selectedResult.totalDamage).toBe(
      baseline.reverse.selectedResult.totalDamage,
    );
  });

  test("calculates Skin Spikes as neutral fixed-power trait damage and rounds each hit first", () => {
    const traitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit, index) =>
        index === 0 ? { ...spirit, traitIds: ["trait_skin_spikes"] } : spirit,
      ),
      traits: [
        {
          description: "每受到1次攻击伤害，对攻击自己的精灵造成50威力物理伤害。",
          id: "trait_skin_spikes",
          name: "刺肤",
        },
      ],
    };
    const oneHit = calculateMatchup(
      traitSnapshot,
      battleInput({
        mode: "four",
        directions: {
          forward: {
            selectedDamageSource: "trait",
            traitDamageHitCount: 1,
            context: { weatherRainTurns: 8 },
          },
        },
      }),
    ).forward;
    const threeHits = calculateMatchup(
      traitSnapshot,
      battleInput({
        mode: "four",
        directions: {
          forward: {
            selectedDamageSource: "trait",
            traitDamageHitCount: 3,
            context: { weatherRainTurns: 8 },
          },
        },
      }),
    ).forward;

    expect(oneHit.selectedResult).toBe(oneHit.traitResult);
    expect(oneHit.traitResult).toMatchObject({
      category: "physical",
      effectivePower: 50,
      hitCount: 1,
      skillName: "刺肤",
      sourceKind: "trait",
      typeLabel: "无·特性",
      typeMultiplier: 1,
      weatherMultiplier: 1,
    });
    expect(threeHits.traitResult.totalDamage).toBe(
      oneHit.traitResult.totalDamage * 3,
    );
  });

  test("calculates direct trait damage in both battle directions", () => {
    const traitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) => ({
        ...spirit,
        traitIds: ["trait_skin_spikes"],
      })),
      traits: [
        {
          description: "每受到1次攻击伤害，对攻击自己的精灵造成50威力物理伤害。",
          id: "trait_skin_spikes",
          name: "刺肤",
        },
      ],
    };
    const matchup = calculateMatchup(
      traitSnapshot,
      battleInput({ mode: "four" }),
    );

    expect(matchup.forward.traitResult?.skillName).toBe("刺肤");
    expect(matchup.reverse.traitResult?.skillName).toBe("刺肤");
  });

  test("uses status-applied flat speed when resolving speed-difference power", () => {
    const speedSkill = {
      id: "skill_speed_difference",
      name: "闪击",
      type: "翼",
      category: "physical",
      basePower: 60,
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, speedSkill],
    };
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", speedSkill.id, [
          speedSkill.id,
          null,
          null,
          null,
        ]),
      },
    });
    const before = calculateMatchup(fixture, input).forward.selectedResult;
    const after = calculateMatchup(
      fixture,
      {
        ...input,
        directions: {
          ...input.directions,
          forward: {
            ...input.directions.forward,
            overrides: { attackerSpeedFlat: 60 },
          },
        },
      },
    ).forward.selectedResult;

    expect(after.effectivePower).toBeGreaterThan(before.effectivePower);
    const beforeStep = before.formulaSteps.find(
      (step) => step.label === "速度差威力",
    );
    const afterStep = after.formulaSteps.find(
      (step) => step.label === "速度差威力",
    );
    expect(afterStep).toMatchObject({
      input: {
        attacker: expect.any(Number),
        defender: expect.any(Number),
      },
    });
    expect(afterStep.input.attacker - beforeStep.input.attacker).toBe(60);
  });

  test("keeps difference-table power separate from Tailwind's damage multiplier", () => {
    const speedSkill = {
      id: "skill_speed_difference_tailwind",
      name: "闪击",
      type: "翼",
      category: "physical",
      basePower: 60,
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const tailwind = {
      id: "trait_tailwind",
      name: "顺风",
      description: "若先于敌方攻击，本次技能威力+50%。",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, speedSkill],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [tailwind.id] }
          : spirit,
      ),
      traits: [tailwind],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", speedSkill.id, [
            speedSkill.id,
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: {
            context: {
              actedBeforeEnemy: true,
              attackerSpeed: 254,
              defenderSpeed: 143,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      resolvedPower: 140,
      skillPower: 210,
    });
  });

  test("applies a direction fixed-power status bonus to every selected skill", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_wind", [
          "skill_wind",
          "skill_color_dispersion",
          null,
          null,
        ]),
      },
    });
    const before = calculateMatchup(snapshot, input).forward.results;
    const after = calculateMatchup(
      snapshot,
      {
        ...input,
        directions: {
          ...input.directions,
          forward: {
            ...input.directions.forward,
            overrides: { fixedPowerAdd: 20 },
          },
        },
      },
    ).forward.results;

    expect(after[0].effectivePower - before[0].effectivePower).toBe(20);
    expect(after[1].effectivePower - before[1].effectivePower).toBe(20);
  });

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

  test("calculates every configured slot when a spirit carries seven skills", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_wind", Array(7).fill("skill_wind")),
        defender: side("spirit_water", "skill_water", [
          "skill_water", null, null, null,
        ]),
      },
    });

    expect(calculateMatchup(snapshot, input).forward.results).toHaveLength(7);
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

  test.each([
    {
      expectedPowers: [70, 90],
      mode: "growth",
      response: false,
      traitName: "有求必应",
    },
    {
      expectedPowers: [140, 70],
      mode: "counter",
      response: true,
      traitName: "有求必应",
    },
    {
      expectedPowers: [70, 90],
      mode: "growth",
      response: false,
      traitName: "一意孤行",
    },
    {
      expectedPowers: [140, 70],
      mode: "counter",
      response: true,
      traitName: "一意孤行",
    },
  ])(
    "calculates choice trait damage as two rounded passes: $traitName $mode",
    ({ expectedPowers, mode, response, traitName }) => {
      const traitId = `trait-${traitName}`;
      const choiceSnapshot = {
        ...snapshot,
        spirits: snapshot.spirits.map((spirit) =>
          spirit.id === "spirit_sonic_dog"
            ? { ...spirit, traitIds: [traitId] }
            : spirit,
        ),
        traits: [
          {
            description: "选择技能额外执行一次。",
            id: traitId,
            name: traitName,
          },
        ],
      };
      const entry = {
        context: {
          choiceTraitTriggered: true,
          counterTriggered: response,
          friendshipMode: mode,
          skillUseCount: 0,
        },
        overrides: { basePower: 70 },
        skillId: "skill_friendship_overflow",
      };
      const result = calculateMatchup(
        choiceSnapshot,
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

      expect(result.choiceTraitSequence.executions.map((pass) => pass.power)).toEqual(
        expectedPowers,
      );
      expect(result.totalDamage).toBe(
        result.choiceTraitSequence.executions.reduce(
          (total, pass) => total + pass.damage,
          0,
        ),
      );
      expect(result.choiceTraitSequence.text).toContain("第一段");
      expect(result.choiceTraitSequence.text).toContain("第二段");
      if (response) {
        expect(result.choiceTraitSequence.text).toContain("仅第一段触发应对");
      }
    },
  );

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

  test("uses trait speed bonuses before resolving speed-difference skill power", () => {
    const speedSkill = {
      id: "skill_trait_speed_difference",
      name: "闪击",
      type: "翼",
      category: "physical",
      basePower: 60,
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const trait = {
      id: "trait_dimo_speed",
      name: "裁决",
      description: "造成克制伤害后，获得攻防速+20%。",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, speedSkill],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const baseInput = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", speedSkill.id, [
          speedSkill.id,
          null,
          null,
          null,
        ]),
      },
    });
    const withoutStacks = calculateMatchup(fixture, baseInput).forward
      .selectedResult;
    const withStacks = calculateMatchup(fixture, {
      ...baseInput,
      directions: {
        ...baseInput.directions,
        forward: {
          ...baseInput.directions.forward,
          context: { attackerTraitStacks: 1 },
        },
      },
    }).forward.selectedResult;

    expect(withStacks.resolvedPower).toBeGreaterThan(withoutStacks.resolvedPower);
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

  test("保守派触发后同时降低受到的物理和魔法伤害", () => {
    const traitSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_water"
          ? { ...spirit, traitIds: ["trait_conservative"] }
          : spirit,
      ),
      traits: [
        {
          affectsDamage: true,
          description: "总技能能耗小于4时，自己获得双防+80%。",
          id: "trait_conservative",
          name: "保守派",
        },
      ],
    };
    const activated = {
      directions: {
        forward: { context: { traitActivated: true } },
      },
    };

    const physicalBase = calculateMatchup(
      traitSnapshot,
      battleInput(),
    ).forward.selectedResult.totalDamage;
    const physicalBuffed = calculateMatchup(
      traitSnapshot,
      battleInput(activated),
    ).forward.selectedResult.totalDamage;
    const magicalInput = {
      sides: {
        attacker: side("spirit_sonic_dog", "skill_water", [
          "skill_water",
          null,
          null,
          null,
        ]),
      },
    };
    const magicalBase = calculateMatchup(
      traitSnapshot,
      battleInput(magicalInput),
    ).forward.selectedResult.totalDamage;
    const magicalBuffed = calculateMatchup(
      traitSnapshot,
      battleInput({ ...magicalInput, ...activated }),
    ).forward.selectedResult.totalDamage;

    expect(physicalBuffed).toBeLessThan(physicalBase);
    expect(magicalBuffed).toBeLessThan(magicalBase);
  });

  test("张弛有度按周末勾选在双攻和双防之间切换", () => {
    const trait = {
      affectsDamage: true,
      description: "周末时自己获得双攻+40%，其他时间获得双防+40%。",
      id: "trait_flexible_tempo",
      name: "张弛有度",
    };
    const attackerSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const defenderSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_water"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const weekend = {
      directions: { forward: { context: { traitActivated: true } } },
    };

    const weekdayAttack = calculateMatchup(
      attackerSnapshot,
      battleInput(),
    ).forward.selectedResult.totalDamage;
    const weekendAttack = calculateMatchup(
      attackerSnapshot,
      battleInput(weekend),
    ).forward.selectedResult.totalDamage;
    const weekdayDefense = calculateMatchup(
      defenderSnapshot,
      battleInput(),
    ).forward.selectedResult.totalDamage;
    const weekendDefense = calculateMatchup(
      defenderSnapshot,
      battleInput(weekend),
    ).forward.selectedResult.totalDamage;

    expect(weekendAttack).toBeGreaterThan(weekdayAttack);
    expect(weekdayDefense).toBeLessThan(weekendDefense);
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
      after: 80,
      before: 20,
      input: { attacker: 120, defender: 100 },
    });
    expect(result.skillPower).toBe(80);
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

  test("展翅只把持有者自己的普通技能按翼系结算", () => {
    const traitId = "trait-wing-extension";
    const normalSkill = {
      id: "skill-normal-strike",
      name: "先发制人",
      type: "普通",
      category: "physical",
      cost: 2,
      basePower: 55,
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    };
    const wingSnapshot = {
      ...snapshot,
      spirits: [
        {
          ...snapshot.spirits[0],
          fullName: "凡鹰",
          types: ["翼"],
          traitIds: [traitId],
        },
        { ...snapshot.spirits[1], types: ["草"] },
      ],
      skills: [...snapshot.skills, normalSkill],
      traits: [{ id: traitId, name: "展翅", description: "普通转翼。" }],
    };
    const result = calculateMatchup(
      wingSnapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill-normal-strike", [
            "skill-normal-strike",
            null,
            null,
            null,
          ]),
          defender: side("spirit_water", "skill-normal-strike", [
            "skill-normal-strike",
            null,
            null,
            null,
          ]),
        },
      }),
    );

    expect(result.forward.selectedResult).toMatchObject({
      skillName: "先发制人",
      typeLabel: "翼",
      typeMultiplier: 2,
    });
    expect(result.reverse.selectedResult).toMatchObject({
      skillName: "先发制人",
      typeLabel: "普通",
      typeMultiplier: 1,
    });
    expect(normalSkill.type).toBe("普通");
  });

  test("展翅防御开关只在勾选时增加25%最终承伤", () => {
    const traitId = "trait-wing-extension";
    const wingSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_water"
          ? { ...spirit, traitIds: [traitId] }
          : spirit,
      ),
      traits: [{ id: traitId, name: "展翅", description: "后手承伤+25%。" }],
    };
    const calculate = (triggered) =>
      calculateMatchup(
        wingSnapshot,
        battleInput({
          mode: "four",
          sides: {
            attacker: side("spirit_sonic_dog", "skill_wind", [
              {
                context: { actedAfterEnemy: triggered },
                skillId: "skill_wind",
              },
              null,
              null,
              null,
            ]),
          },
        }),
      ).forward.selectedResult;

    const inactive = calculate(false);
    const active = calculate(true);
    expect(active.totalDamage).toBe(Math.floor(inactive.totalDamage * 1.25));
  });

  test("疾风涡轮把前置翼系攻击与自身伤害分别取整后相加", () => {
    const traitId = "trait-wing-extension";
    const normalAttack = {
      id: "skill-normal-strike",
      name: "先发制人",
      type: "普通",
      category: "physical",
      cost: 2,
      basePower: 55,
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    };
    const wingStatus = {
      id: "skill-wing-status",
      name: "羽化加速",
      type: "翼",
      category: "status",
      cost: 2,
      basePower: 0,
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    };
    const turbine = {
      id: "skill-gale-turbine",
      name: "疾风涡轮",
      type: "翼",
      category: "physical",
      cost: 0,
      basePower: 100,
      description:
        "造成物伤，无法主动使用，在使用3次翼系技能后会自动使用此技能。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    };
    const wingSnapshot = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? {
              ...spirit,
              fullName: "凡鹰",
              types: ["翼"],
              traitIds: [traitId],
            }
          : spirit,
      ),
      skills: [...snapshot.skills, normalAttack, wingStatus, turbine],
      traits: [{ id: traitId, name: "展翅", description: "普通转翼。" }],
    };
    const calculate = (companionSlot) =>
      calculateMatchup(
        wingSnapshot,
        battleInput({
          mode: "four",
          directions: { forward: { selectedSkillIndex: 2 } },
          sides: {
            attacker: side("spirit_sonic_dog", "skill-gale-turbine", [
              "skill-normal-strike",
              "skill-wing-status",
              {
                context: companionSlot
                  ? { galeTurbineCompanionSlot: companionSlot }
                  : {},
                skillId: "skill-gale-turbine",
              },
              null,
            ]),
          },
        }),
      ).forward.selectedResult;

    const turbineOnly = calculate(null);
    const withAttack = calculate(1);
    const withStatus = calculate(2);

    expect(turbineOnly.skillName).toBe("疾风涡轮");
    expect(turbineOnly.choiceTraitSequence).toBeUndefined();
    expect(withAttack.choiceTraitSequence.executions).toMatchObject([
      { skillName: "先发制人" },
      { skillName: "疾风涡轮" },
    ]);
    expect(withAttack.totalDamage).toBe(
      withAttack.choiceTraitSequence.executions.reduce(
        (sum, execution) => sum + execution.damage,
        0,
      ),
    );
    expect(withAttack.choiceTraitSequence.text).toContain("先发制人");
    expect(withAttack.choiceTraitSequence.text).toContain("疾风涡轮");
    expect(withStatus.totalDamage).toBe(turbineOnly.totalDamage);
    expect(withStatus.choiceTraitSequence).toBeUndefined();
  });
});
