import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";

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
      id: "skill_pressure_valve",
      name: "减压阀",
      type: "机械",
      category: "status",
      cost: 1,
      basePower: 0,
      description:
        "主动：本技能被动永久额外+20威力，被动：两侧技能威力+10，传动1。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_caltrop",
      name: "铁蒺藜",
      type: "机械",
      category: "magical",
      cost: 3,
      basePower: 85,
      description: "造成魔伤，应对状态：本次伤害翻倍。",
      ruleId: null,
      provenance: { basePower: { source: "fixture" } },
    },
    {
      id: "skill_weight_pressure",
      name: "吨位压制",
      type: "普通",
      category: "physical",
      cost: 3,
      basePower: 100,
      description: "造成物伤，敌方体重越低，威力越高。",
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
      id: "skill_swarm",
      name: "虫群",
      type: "虫",
      category: "physical",
      cost: 7,
      basePower: 20,
      description: "造成物伤，1连击，本技能会受奉献影响。",
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

function transmissionSnapshot() {
  const dancer = {
    id: "spirit-centrifugal-dancer",
    fullName: "离心舞者",
    types: ["幻", "机械"],
    raceStats: {
      physicalAttack: 50,
      magicalAttack: 110,
      speed: 125,
      hp: 114,
      physicalDefense: 77,
      magicalDefense: 120,
    },
    traitIds: [],
  };
  const target = {
    id: "spirit-transmission-target",
    fullName: "传动测试靶",
    types: ["普通"],
    raceStats: {
      physicalAttack: 100,
      magicalAttack: 100,
      speed: 100,
      hp: 150,
      physicalDefense: 100,
      magicalDefense: 100,
    },
    traitIds: [],
  };
  return {
    ...snapshot,
    spirits: [...snapshot.spirits, dancer, target],
    skills: [
      ...snapshot.skills,
      {
        id: "skill-transmission-status",
        name: "传动状态",
        type: "机械",
        category: "status",
        cost: 1,
        basePower: 0,
      },
      {
        id: "skill-transmission-200",
        name: "面板二百",
        type: "普通",
        category: "magical",
        cost: 1,
        basePower: 200,
      },
      {
        id: "skill-transmission-90",
        name: "面板九十",
        type: "普通",
        category: "physical",
        cost: 1,
        basePower: 90,
      },
      {
        id: "skill-transmission-150",
        name: "面板一百五",
        type: "普通",
        category: "physical",
        cost: 1,
        basePower: 150,
      },
      {
        id: "skill-six-degrees",
        name: "六自由度",
        type: "机械",
        category: "magical",
        cost: 4,
        basePower: 30,
        description: "造成魔伤，威力额外增加两侧技能威力差的四分之一，传动1。",
      },
      {
        id: "skill-steel-drill",
        name: "钢钻",
        type: "机械",
        category: "physical",
        cost: 4,
        basePower: 1,
        description: "造成物伤，技能威力为两侧技能威力和的三分之一，传动1。",
      },
    ],
  };
}

function transmissionSide(skillIds) {
  return {
    spiritId: "spirit-centrifugal-dancer",
    displayIvs: { ...allFullIvs },
    skills: { single: skillIds[0], four: skillIds },
  };
}

describe("calculateMatchup", () => {
  test("六自由度读取相邻最终显示威力，变化技能按 0，并在离心舞者本系后结算", () => {
    const result = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        sides: {
          attacker: transmissionSide([
            "skill-transmission-status",
            "skill-six-degrees",
            "skill-transmission-200",
            null,
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results[1];

    expect(result.status).toBe("exact");
    expect(result.resolvedPower).toBe(80);
    expect(result.effectivePower).toBe(100);
    expect(result.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "相邻技能显示威力",
          input: {
            left: { name: "传动状态", power: 0 },
            right: { name: "面板二百", power: 200 },
          },
          after: 80,
        }),
      ]),
    );
  });

  test("钢钻使用两侧最终显示威力之和的三分之一，不叠加占位基础威力", () => {
    const result = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        sides: {
          attacker: transmissionSide([
            "skill-transmission-90",
            "skill-steel-drill",
            "skill-transmission-150",
            null,
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results[1];

    expect(result.status).toBe("exact");
    expect(result.resolvedPower).toBe(80);
    expect(result.effectivePower).toBe(100);
  });

  test("六自由度读取的是相邻技能包含克制与能力等级后的界面威力", () => {
    const result = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        directions: {
          forward: {
            attackLevelStage: 5,
            overrides: { typeEffectiveness: 2 },
          },
        },
        sides: {
          attacker: transmissionSide([
            "skill-transmission-status",
            "skill-six-degrees",
            "skill-transmission-200",
            null,
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results[1];

    expect(result.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "相邻技能显示威力",
          input: {
            left: { name: "传动状态", power: 0 },
            right: { name: "面板二百", power: 600 },
          },
          after: 180,
        }),
      ]),
    );
  });

  test("传动技能在1号位读取4和2，在4号位读取3和1", () => {
    const firstSlot = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        sides: {
          attacker: transmissionSide([
            "skill-six-degrees",
            "skill-transmission-150",
            null,
            "skill-transmission-90",
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results[0];
    const fourthSlot = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        sides: {
          attacker: transmissionSide([
            "skill-transmission-150",
            null,
            "skill-transmission-90",
            "skill-steel-drill",
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results[3];

    expect(firstSlot.status).toBe("exact");
    expect(firstSlot.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "相邻技能显示威力",
          input: {
            left: { name: "面板九十", power: 90 },
            right: { name: "面板一百五", power: 150 },
          },
          after: 45,
        }),
      ]),
    );
    expect(fourthSlot.status).toBe("exact");
    expect(fourthSlot.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "相邻技能显示威力",
          input: {
            left: { name: "面板九十", power: 90 },
            right: { name: "面板一百五", power: 150 },
          },
          after: 80,
        }),
      ]),
    );
  });

  test("相邻传动技能互相依赖时不静默按零计算", () => {
    const cycle = calculateMatchup(
      transmissionSnapshot(),
      battleInput({
        mode: "four",
        sides: {
          attacker: transmissionSide([
            "skill-transmission-90",
            "skill-six-degrees",
            "skill-steel-drill",
            "skill-transmission-150",
          ]),
          defender: {
            ...transmissionSide([null, null, null, null]),
            spiritId: "spirit-transmission-target",
          },
        },
      }),
    ).forward.results;

    expect(cycle[1].status).toBe("needs_input");
    expect(cycle[2].status).toBe("needs_input");
  });

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

  test("听桥继承对方增益后的技能显示威力并按单段武系物理伤害反弹", () => {
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

  test("虫群三类奉献结果进入完整伤害计算", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_swarm", [
          {
            skillId: "skill_swarm",
            context: {
              donationHitBonus: 2,
              donationPoisonCount: 2,
              donationPowerCount: 1,
            },
          },
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

    const result = calculateMatchup(snapshot, input).forward.results[0];

    expect(result).toMatchObject({
      donationPoisonStacks: 2,
      hitCount: 3,
      skillCost: 7,
      staticPower: 40,
      totalDamage: 108,
    });
    expect(result).not.toHaveProperty("donationLifestealPercent");
  });

  test("参考站实战口径下虫群显示威力613并由听桥重算为245和544伤害", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_swarm", [
          {
            skillId: "skill_swarm",
            context: { donationPowerCount: 6 },
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
            attackerStat: 148,
            attackDefenseLevelMultiplier: 1.75,
            defenderDefense: 160,
            stabMultiplier: 1.25,
            typeMultiplier: 2,
          },
        },
        reverse: {
          selectedSkillIndex: 0,
          overrides: {
            attackerStat: 261,
            attackDefenseLevelMultiplier: 1.6,
            defenderDefense: 106,
            stabMultiplier: 1,
            typeMultiplier: 0.25,
          },
        },
      },
    });

    const result = calculateMatchup(snapshot, input);

    expect(result.forward.results[0]).toMatchObject({
      displayPower: 613,
      panelPower: 613,
      staticPower: 140,
      totalDamage: 511,
    });
    expect(result.reverse.results[0]).toMatchObject({
      displayPower: 245,
      hitCount: 1,
      panelPower: 245,
      reflectedPower: 613,
      skillPower: 613,
      totalDamage: 544,
    });
    expect(result.reverse.results[0].formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          after: 613,
          label: "继承显示威力",
        }),
      ]),
    );
  });

  test("听桥继承来源显示威力后继续结算自身固定与百分比威力乘区", () => {
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", "skill_wind", [
          {
            skillId: "skill_wind",
            overrides: { powerOverride: { mode: "panel", value: 85 } },
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
        forward: { selectedSkillIndex: 0 },
        reverse: {
          selectedSkillIndex: 0,
          overrides: {
            attackerStat: 100,
            attackDefenseLevelMultiplier: 1.8,
            defenderDefense: 100,
            fixedPowerAdd: 20,
            otherPowerMultipliers: [2],
            skillPowerPercentAdds: [0.5],
            stabMultiplier: 1.25,
            typeMultiplier: 0.25,
          },
        },
      },
    });

    const result = calculateMatchup(snapshot, input).reverse.results[0];

    expect(result).toMatchObject({
      displayPower: 177,
      panelPower: 177,
      reflectedPower: 85,
      skillPower: 157,
      totalDamage: 159,
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

  test("契约的形状网兜与淘沙只修正声明连击的技能", () => {
    const fixture = contractShapeSnapshot({ combo: true });
    const net = calculateMatchup(fixture, battleInput({
      directions: {
        forward: {
          context: contractContext("attacker", "net"),
          hitCount: 3,
        },
      },
    })).forward.selectedResult;
    const sand = calculateMatchup(fixture, battleInput({
      directions: {
        forward: {
          context: contractContext("attacker", "sand"),
          hitCount: 3,
        },
      },
    })).forward.selectedResult;

    expect(net.hitCount).toBe(4);
    expect(sand.hitCount).toBe(5);
  });

  test("契约的形状绝缘球速度先进入动态威力，变幻球增加星陨", () => {
    const speedSkill = {
      ...snapshot.skills[0],
      id: "skill_wind",
      name: "闪击",
      ruleId: "speed_difference",
      provenance: { ruleId: { source: "fixture" } },
    };
    const fixture = contractShapeSnapshot({ skill: speedSkill });
    const base = calculateMatchup(fixture, battleInput()).forward.selectedResult;
    const insulation = calculateMatchup(fixture, battleInput({
      directions: { forward: { context: contractContext("attacker", "insulation") } },
    })).forward.selectedResult;
    const marked = calculateMatchup(fixture, battleInput({
      marks: {
        attacker: { negative: { id: null, stacks: 0 }, positive: { id: null, stacks: 0 } },
        defender: { negative: { id: "starfall", stacks: 2 }, positive: { id: null, stacks: 0 } },
      },
      directions: { forward: { context: contractContext("attacker", "transform") } },
    })).forward.selectedResult;

    expect(insulation.effectivePower).toBeGreaterThan(base.effectivePower);
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

  test("虫鸣的手动连击数会叠加热身运动的连击增益", () => {
    const bugChirpSnapshot = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? {
              ...skill,
              basePower: 45,
              category: "magical",
              description: "造成魔伤，队伍中的精灵每携带1个虫鸣，本次技能连击数+1。",
              name: "虫鸣",
              type: "虫",
            }
          : skill,
      ),
    };
    const result = calculateMatchup(
      bugChirpSnapshot,
      battleInput({
        directions: {
          forward: {
            context: { teamBugChantCount: 6 },
            overrides: { hitCountAdd: 3 },
          },
        },
      }),
    ).forward.selectedResult;
    const unbounded = calculateMatchup(
      bugChirpSnapshot,
      battleInput({
        directions: {
          forward: {
            context: { teamBugChantCount: 120 },
            overrides: { hitCountAdd: 3 },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.hitCount).toBe(9);
    expect(unbounded.hitCount).toBe(123);
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
    const staged = calculateMatchup(
      traitSnapshot,
      battleInput({
        mode: "four",
        directions: {
          forward: {
            selectedDamageSource: "trait",
            traitDamageHitCount: 1,
            overrides: {
              attackerStat: 30,
              attackLevelStage: 18,
              defenderDefense: 31,
              defenseLevelStage: 5,
            },
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
    expect(staged.traitResult.totalDamage).toBe(80);
    expect(
      staged.traitResult.formulaSteps.find(
        (step) => step.label === "每段伤害",
      ),
    ).toMatchObject({ input: { attackerStat: 84, defenderDefense: 47 } });
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

  test("adds Fan, Tailwind and Wind mark bonuses in one power zone", () => {
    const fan = {
      id: "skill_fan_additive",
      name: "扇风",
      type: "翼",
      category: "physical",
      basePower: 75,
      provenance: { basePower: { source: "fixture" } },
    };
    const tailwind = {
      id: "trait_tailwind_additive",
      name: "顺风",
      description: "若先于敌方攻击，本次技能威力+50%。",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, fan],
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
        sides: {
          attacker: side("spirit_sonic_dog", fan.id, [fan.id, null, null, null]),
        },
        marks: {
          attacker: {
            negative: { id: null, stacks: 0 },
            positive: { id: "tailwind", stacks: 1 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: null, stacks: 0 },
          },
        },
        directions: {
          forward: { context: { actedBeforeEnemy: true } },
        },
      }),
    ).forward.selectedResult;
    const manualResult = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", fan.id, [fan.id, null, null, null]),
        },
        marks: {
          attacker: {
            negative: { id: null, stacks: 0 },
            positive: { id: "tailwind", stacks: 1 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: null, stacks: 0 },
          },
        },
        directions: {
          forward: {
            context: { actedBeforeEnemy: true },
            overrides: { basePower: 100 },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(165);
    expect(manualResult.skillPower).toBe(220);
    expect(
      result.formulaSteps.find((step) => step.label === "技能威力百分比")?.input,
    ).toEqual(expect.arrayContaining([0.5, 0.5, 0.2]));
  });

  test("adds Snowfield Hunt fixed power before the remaining percentage zone", () => {
    const snowfieldHunt = {
      id: "skill_snowfield_hunt_additive",
      name: "雪原狩猎",
      type: "冰",
      category: "physical",
      basePower: 85,
      provenance: { basePower: { source: "fixture" } },
    };
    const iceSoul = {
      id: "trait_ice_soul_additive",
      name: "冰雪魂魄",
      description: "天气为暴风雪时，冰系技能威力+100%。",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, snowfieldHunt],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [iceSoul.id] }
          : spirit,
      ),
      traits: [iceSoul],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", snowfieldHunt.id, [
            snowfieldHunt.id,
            null,
            null,
            null,
          ]),
        },
        marks: {
          attacker: {
            negative: { id: null, stacks: 0 },
            positive: { id: "momentum", stacks: 1 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: null, stacks: 0 },
          },
        },
        directions: {
          forward: { context: { blizzardWeather: true } },
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(310);
    expect(result.panelPower).toBe(310);
    expect(
      result.formulaSteps.find((step) => step.label === "当前为暴风雪天气"),
    ).toMatchObject({
      after: 135,
      before: 85,
      input: true,
      source: "reviewed-rule:boolean-power-add-v1",
    });
    expect(
      result.formulaSteps.find((step) => step.label === "技能威力百分比")?.input,
    ).toEqual([1, 0.3]);
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

  test("adds fixed power after a counter replacement and before percentage bonuses", () => {
    const flashBurn = {
      id: "skill_flash_burn_power_order",
      name: "闪燃",
      type: "火",
      category: "physical",
      basePower: 40,
      provenance: { basePower: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, flashBurn],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", flashBurn.id, [
            flashBurn.id,
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: {
            context: { counterTriggered: true },
            overrides: {
              fixedPowerAdd: 20,
              skillPowerPercentAdds: [0.5],
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(270);
    expect(
      result.formulaSteps.find((step) => step.label === "应对倍率")?.after,
    ).toBe(160);
    expect(
      result.formulaSteps.find((step) => step.label === "固定威力增加")?.after,
    ).toBe(180);
    expect(
      result.formulaSteps.find((step) => step.label === "技能威力百分比")?.after,
    ).toBe(270);
  });

  test("正面印记按层数进入显示威力并报告结算", () => {
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

    expect(after.actualPower).toBe(Math.round(before.actualPower * 1.4));
    expect(after.panelPower).toBe(Math.round(before.panelPower * 1.4));
    expect(after.totalDamage).toBeGreaterThan(before.totalDamage);
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

  test("applies charge fixed power only when the current skill triggers burst", () => {
    const electricArc = {
      id: "skill_electric_arc_charge_mark",
      name: "电弧",
      type: "电",
      category: "magical",
      basePower: 80,
      provenance: { basePower: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, electricArc],
    };
    const burstControl = getSkillEffectInputs(electricArc).find(
      (input) => input.contextKey === "burstTriggered",
    );
    const result = (marked, burstTriggered) =>
      calculateMatchup(
        fixture,
        battleInput({
          sides: {
            attacker: side("spirit_sonic_dog", electricArc.id, [
              electricArc.id,
              null,
              null,
              null,
            ]),
          },
          marks: {
            attacker: {
              negative: { id: null, stacks: 0 },
              positive: marked
                ? { id: "charge", stacks: 2 }
                : { id: null, stacks: 0 },
            },
            defender: {
              negative: { id: null, stacks: 0 },
              positive: { id: null, stacks: 0 },
            },
          },
          directions: {
            forward: {
              context: { [burstControl.id]: burstTriggered },
            },
          },
        }),
      ).forward.selectedResult;

    const unmarkedInactive = result(false, false);
    const markedInactive = result(true, false);
    const unmarkedActive = result(false, true);
    const markedActive = result(true, true);

    expect(markedInactive.skillPower).toBe(unmarkedInactive.skillPower);
    expect(markedActive.skillPower - unmarkedActive.skillPower).toBe(20);
    expect(markedActive.markSettlements).toContainEqual(
      expect.objectContaining({
        markId: "charge",
        status: "applied",
        text: "蓄电 ×2 迸发威力 +20",
      }),
    );
  });

  test("lets an attacker trait burst trigger consume charge stacks", () => {
    const currentStimulus = {
      id: "trait_current_stimulus_charge_mark",
      name: "电流刺激",
      description: "触发迸发时，本次技能威力+40。",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [currentStimulus.id] }
          : spirit,
      ),
      traits: [currentStimulus],
    };
    const burstControl = getTraitEffectInputs(
      currentStimulus,
      "attacker",
    ).find((input) => input.contextKey === "burstTriggered");
    const result = (burstTriggered) =>
      calculateMatchup(
        fixture,
        battleInput({
          marks: {
            attacker: {
              negative: { id: null, stacks: 0 },
              positive: { id: "charge", stacks: 3 },
            },
            defender: {
              negative: { id: null, stacks: 0 },
              positive: { id: null, stacks: 0 },
            },
          },
          directions: {
            forward: {
              context: { [burstControl.id]: burstTriggered },
            },
          },
        }),
      ).forward.selectedResult;

    expect(result(true).skillPower - result(false).skillPower).toBe(70);
    expect(result(true).markSettlements).toContainEqual(
      expect.objectContaining({
        markId: "charge",
        status: "applied",
      }),
    );
  });

  test("雷暴区分本次电流刺激与此前已生效的迸发种类", () => {
    const thunderstorm = {
      id: "skill_thunderstorm_fixture",
      name: "雷暴",
      type: "电",
      category: "magical",
      cost: 1,
      basePower: 55,
      description: "获得所有已生效迸发，每种使本技能能耗+1、威力+10。",
      provenance: { basePower: { source: "fixture" } },
    };
    const currentStimulus = {
      id: "trait_current_stimulus_thunderstorm",
      name: "电流刺激",
      description: "攻击时获得迸发：本次技能威力+40。",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, thunderstorm],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [currentStimulus.id] }
          : spirit,
      ),
      traits: [currentStimulus],
    };
    const skillInputs = getSkillEffectInputs(thunderstorm);
    const traitInput = getTraitEffectInputs(
      currentStimulus,
      "attacker",
    ).find((input) => input.contextKey === "burstTriggered");
    const sourceInput = (contextKey) =>
      skillInputs.find((input) => input.contextKey === contextKey);
    const resultFor = (context, powerOverride = null) => calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", thunderstorm.id, [
            {
              context,
              ...(powerOverride
                ? { overrides: { powerOverride } }
                : {}),
              skillId: thunderstorm.id,
            },
            null,
            null,
            null,
          ]),
        },
        directions: {
          forward: { context },
        },
      }),
    ).forward.selectedResult;
    const ordinarySources = resultFor({
      [traitInput.id]: true,
      [sourceInput("burstSourceBioelectric").id]: true,
      [sourceInput("burstSourceDoublePulse").id]: true,
    });
    const previousAndCurrentStimulus = resultFor({
      [traitInput.id]: true,
      [sourceInput("burstSourceBioelectric").id]: true,
      [sourceInput("burstSourceCurrentStimulus").id]: true,
      [sourceInput("burstSourceDoublePulse").id]: true,
    });
    const manualPreviousAndCurrentStimulus = resultFor({
      [traitInput.id]: true,
      [sourceInput("burstSourceBioelectric").id]: true,
      [sourceInput("burstSourceCurrentStimulus").id]: true,
      [sourceInput("burstSourceDoublePulse").id]: true,
    }, { mode: "static", value: 125 });
    const superconductAndOrdinary = resultFor({
      [traitInput.id]: true,
      [sourceInput("burstSourceDoublePulse").id]: true,
      [sourceInput("burstSourceSuperconduct").id]: true,
    });
    const sourcePower = (contextKey) => resultFor({
      [traitInput.id]: false,
      [sourceInput(contextKey).id]: true,
    });

    expect(ordinarySources).toMatchObject({
      skillCost: 1,
      skillPower: 115,
      staticPower: 75,
    });
    expect(previousAndCurrentStimulus).toMatchObject({
      skillCost: 2,
      skillPower: 165,
      staticPower: 125,
    });
    expect(manualPreviousAndCurrentStimulus).toMatchObject({
      skillCost: 2,
      skillPower: 165,
      staticPower: 125,
    });
    expect(superconductAndOrdinary).toMatchObject({
      skillCost: 1,
      skillPower: 115,
      staticPower: 75,
    });
    expect(sourcePower("burstSourceHeavenSpin")).toMatchObject({
      skillPower: 95,
      staticPower: 95,
    });
    expect(sourcePower("burstSourceArc")).toMatchObject({
      skillPower: 105,
      staticPower: 105,
    });
    expect(sourcePower("burstSourceLightningGuide")).toMatchObject({
      skillPower: 85,
      staticPower: 85,
    });
  });

  test("超导只在迸发开启时把结果能耗从3降为1", () => {
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      description: "造成魔伤，迸发：本次能耗-2。",
      id: "skill_superconduct_fixture",
      name: "超导",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, superconduct],
    };
    const result = (burstTriggered) => calculateMatchup(
      fixture,
      battleInput({
        sides: {
          attacker: side("spirit_sonic_dog", superconduct.id, [
            { context: { burstTriggered }, skillId: superconduct.id },
            null,
            null,
            null,
          ]),
        },
        directions: { forward: { context: { burstTriggered } } },
      }),
    ).forward.selectedResult;

    expect(result(true)).toMatchObject({ skillCost: 1, skillPower: 90 });
    expect(result(false)).toMatchObject({ skillCost: 3, skillPower: 90 });
  });

  test.each(["挺起胸脯", "“国王”的威严"])(
    "%s按超导的本次结算能耗1触发威力加成",
    (traitName) => {
      const superconduct = {
        basePower: 90,
        category: "magical",
        cost: 3,
        id: `skill_superconduct_${traitName}`,
        name: "超导",
        provenance: { basePower: { source: "fixture" } },
        type: "电",
      };
      const trait = {
        description: "使用1能耗技能时，本次技能威力+50%。",
        id: `trait_cost_one_${traitName}`,
        name: traitName,
      };
      const fixture = {
        ...snapshot,
        skills: [...snapshot.skills, superconduct],
        spirits: snapshot.spirits.map((spirit) =>
          spirit.id === "spirit_sonic_dog"
            ? { ...spirit, traitIds: [trait.id] }
            : spirit,
        ),
        traits: [trait],
      };
      const calculate = (burstTriggered) => calculateMatchup(
        fixture,
        battleInput({
          directions: { forward: { context: { burstTriggered } } },
          sides: {
            attacker: side("spirit_sonic_dog", superconduct.id, [
              { context: { burstTriggered }, skillId: superconduct.id },
              null,
              null,
              null,
            ]),
          },
        }),
      ).forward.selectedResult;

      expect(calculate(true)).toMatchObject({ skillCost: 1, skillPower: 135 });
      expect(calculate(false)).toMatchObject({ skillCost: 3, skillPower: 90 });
    },
  );

  test("逐魂鸟按超导的本次结算能耗1免疫伤害", () => {
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      id: "skill_superconduct_soul_bird",
      name: "超导",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const soulBird = {
      description: "免疫能耗不高于1的攻击技能伤害。",
      id: "trait_soul_bird_dynamic_cost",
      name: "逐魂鸟",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, superconduct],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_water"
          ? { ...spirit, traitIds: [soulBird.id] }
          : spirit,
      ),
      traits: [soulBird],
    };
    const calculate = (burstTriggered) => calculateMatchup(
      fixture,
      battleInput({
        directions: { forward: { context: { burstTriggered } } },
        sides: {
          attacker: side("spirit_sonic_dog", superconduct.id, [
            { context: { burstTriggered }, skillId: superconduct.id },
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(calculate(true)).toMatchObject({ skillCost: 1, totalDamage: 0 });
    expect(calculate(false)).toMatchObject({ skillCost: 3 });
    expect(calculate(false).totalDamage).toBeGreaterThan(0);
  });

  test("勇敢按雷暴增加后的本次结算能耗触发", () => {
    const thunderstorm = {
      basePower: 55,
      category: "magical",
      cost: 1,
      id: "skill_thunderstorm_brave_dynamic_cost",
      name: "雷暴",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const brave = {
      description: "使用能耗大于3的技能时，本次技能威力+40%。",
      id: "trait_brave_dynamic_cost",
      name: "勇敢",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, thunderstorm],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [brave.id] }
          : spirit,
      ),
      traits: [brave],
    };
    const calculate = (burstTriggered) => {
      const context = { activeBurstKinds: 4, burstTriggered };
      return calculateMatchup(
        fixture,
        battleInput({
          directions: { forward: { context } },
          sides: {
            attacker: side("spirit_sonic_dog", thunderstorm.id, [
              { context, skillId: thunderstorm.id },
              null,
              null,
              null,
            ]),
          },
        }),
      ).forward.selectedResult;
    };

    expect(calculate(true)).toMatchObject({ skillCost: 5, skillPower: 133 });
    expect(calculate(false)).toMatchObject({ skillCost: 1, skillPower: 55 });
  });

  test("雷暴继承超导后以最终0费判断精确1费与不高于1费特性", () => {
    const thunderstorm = {
      basePower: 55,
      category: "magical",
      cost: 1,
      id: "skill_thunderstorm_superconduct_final_cost",
      name: "雷暴",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const exactOneCost = {
      description: "使用1能耗技能时，本次技能威力+50%。",
      id: "trait_exact_one_final_cost",
      name: "挺起胸脯",
    };
    const atMostOneCost = {
      description: "免疫能耗不高于1的攻击技能伤害。",
      id: "trait_at_most_one_final_cost",
      name: "逐魂鸟",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, thunderstorm],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [exactOneCost.id] }
          : { ...spirit, traitIds: [atMostOneCost.id] },
      ),
      traits: [exactOneCost, atMostOneCost],
    };
    const calculate = (context) => calculateMatchup(
      fixture,
      battleInput({
        directions: { forward: { context } },
        sides: {
          attacker: side("spirit_sonic_dog", thunderstorm.id, [
            { context, skillId: thunderstorm.id },
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(calculate({ burstSourceSuperconduct: true })).toMatchObject({
      skillCost: 0,
      skillPower: 65,
      totalDamage: 0,
    });
    expect(calculate({
      burstSourceDoublePulse: true,
      burstSourceSuperconduct: true,
    })).toMatchObject({
      skillCost: 1,
      skillPower: 112,
      totalDamage: 0,
    });
  });

  test("超导的动态能耗不被手动威力覆盖或继承显示威力路径吞掉", () => {
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      id: "skill_superconduct_power_override",
      name: "超导",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const dynamicListenBridge = {
      ...snapshot.skills.find((skill) => skill.id === "skill_listen_bridge"),
      cost: 3,
      ruleId: "burst_cost_reduction",
      ruleParams: { contextKey: "burstTriggered", reduction: 2 },
    };
    const fixture = {
      ...snapshot,
      skills: [
        ...snapshot.skills.filter((skill) => skill.id !== dynamicListenBridge.id),
        superconduct,
        dynamicListenBridge,
      ],
    };
    const manualOverride = calculateMatchup(
      fixture,
      battleInput({
        directions: { forward: { context: { burstTriggered: true } } },
        sides: {
          attacker: side(
            "spirit_sonic_dog",
            {
              context: { burstTriggered: true },
              overrides: { powerOverride: { mode: "static", value: 120 } },
              skillId: superconduct.id,
            },
            [superconduct.id, null, null, null],
          ),
        },
      }),
    ).forward.selectedResult;
    const inheritedPower = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        directions: {
          forward: { selectedSkillIndex: 0 },
          reverse: {
            context: { burstTriggered: true },
            selectedSkillIndex: 0,
          },
        },
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            null,
            null,
            null,
          ]),
          defender: side("spirit_water", dynamicListenBridge.id, [
            dynamicListenBridge.id,
            null,
            null,
            null,
          ]),
        },
      }),
    ).reverse.results[0];

    expect(manualOverride).toMatchObject({ skillCost: 1, skillPower: 120 });
    expect(inheritedPower).toMatchObject({
      reflectedPower: expect.any(Number),
      skillCost: 1,
      skillName: "听桥",
    });
  });

  test("本次动态能耗不改写四技能静态总能耗", () => {
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      id: "skill_superconduct_static_loadout_cost",
      name: "超导",
      provenance: { basePower: { source: "fixture" } },
      type: "电",
    };
    const iceDrill = {
      description: "技能威力按敌方四技能总能耗增加。",
      id: "trait_ice_drill_static_loadout_cost",
      name: "冰钻",
    };
    const fixture = {
      ...snapshot,
      skills: [...snapshot.skills, superconduct],
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [iceDrill.id] }
          : spirit,
      ),
      traits: [iceDrill],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        directions: { forward: { context: { burstTriggered: true } } },
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            null,
            null,
            null,
          ]),
          defender: side("spirit_water", superconduct.id, [
            { context: { burstTriggered: true }, skillId: superconduct.id },
            superconduct.id,
            superconduct.id,
            superconduct.id,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result.skillPower).toBe(176);
    expect(
      result.formulaSteps.find((step) => step.label === "冰钻")?.input,
    ).toEqual({ effect: 10, stacks: 12 });
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

  test("减压阀按使用次数增加相邻技能的固定威力", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            {
              context: { pressureValveUseCount: 2 },
              skillId: "skill_pressure_valve",
            },
            null,
            null,
          ]),
        },
      }),
    ).forward.results[0];

    expect(result).toMatchObject({ resolvedPower: 80, staticPower: 130 });
  });

  test("减压阀按四技能首尾相邻并累计多个相邻来源", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            { skillId: "skill_pressure_valve" },
            null,
            { skillId: "skill_pressure_valve" },
          ]),
        },
      }),
    ).forward.results[0];

    expect(result).toMatchObject({ resolvedPower: 80, staticPower: 100 });
  });

  test("减压阀不影响非相邻槽位且不覆盖既有分槽固定威力", () => {
    const nonAdjacent = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            null,
            { skillId: "skill_pressure_valve" },
            null,
          ]),
        },
      }),
    ).forward.results[0];
    const additive = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        directions: {
          forward: { overrides: { fixedPowerAddsBySlot: { 1: 5 } } },
        },
        sides: {
          attacker: side("spirit_sonic_dog", "skill_wind", [
            "skill_wind",
            { skillId: "skill_pressure_valve" },
            null,
            null,
          ]),
        },
      }),
    ).forward.results[0];

    expect(nonAdjacent).toMatchObject({ resolvedPower: 80, staticPower: 80 });
    expect(additive).toMatchObject({ resolvedPower: 80, staticPower: 95 });
  });

  test("铁蒺藜应对成功翻倍最终伤害但保持显示威力", () => {
    const input = (counterTriggered) => battleInput({
      directions: { forward: { context: { counterTriggered } } },
      sides: {
        attacker: side("spirit_sonic_dog", "skill_caltrop", [
          "skill_caltrop",
          null,
          null,
          null,
        ]),
      },
    });
    const normal = calculateMatchup(snapshot, input(false)).forward.selectedResult;
    const countered = calculateMatchup(snapshot, input(true)).forward.selectedResult;

    expect(countered).toMatchObject({
      displayPower: normal.displayPower,
      skillPower: normal.skillPower,
      totalDamage: normal.totalDamage * 2,
    });
  });

  test("铁蒺藜多段时逐段应用最终伤害翻倍和向下取整", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            context: { counterTriggered: true },
            hitCount: 3,
          },
        },
        sides: {
          attacker: side("spirit_sonic_dog", "skill_caltrop", [
            "skill_caltrop",
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;
    const finalStep = result.formulaSteps.find(
      ({ label }) => label === "减伤、连击与最终倍率",
    );

    expect(result.hitCount).toBe(3);
    expect(result.totalDamage).toBe(finalStep.input.oneHitAfterFinal * 3);
    expect(finalStep.input.finalDamageMultiplier).toBe(2);
    expect(finalStep.input.oneHitAfterFinal).toBe(
      Math.floor(finalStep.before * 2),
    );
  });

  test("体重挡位技能允许手动显示威力直接覆盖完整面板结算", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", "skill_weight_pressure", [
            {
              context: { targetWeightTier: "4~13" },
              overrides: { powerOverride: { mode: "panel", value: 281 } },
              skillId: "skill_weight_pressure",
            },
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      panelPower: 281,
      powerSource: "manual-panel",
      resolvedPower: 140,
    });
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

  test("蒸汽革命把同一入场前火系次数结算为固定威力和仅物理生效的物防", () => {
    const trait = {
      id: "trait_steam_revolution",
      name: "蒸汽革命",
      description:
        "己方精灵每使用1次火系技能，自己入场时获得全技能威力+10和物防+5%。",
    };
    const fixtureWithTraitOn = (spiritId) => ({
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === spiritId ? { ...spirit, traitIds: [trait.id] } : spirit,
      ),
      traits: [trait],
    });
    const resultFor = (fixture, skillId, context = {}) =>
      calculateMatchup(
        fixture,
        battleInput({
          directions: { forward: { context } },
          sides: {
            attacker: side("spirit_sonic_dog", skillId, [
              skillId,
              null,
              null,
              null,
            ]),
          },
        }),
      ).forward.selectedResult;

    const attackerFixture = fixtureWithTraitOn("spirit_sonic_dog");
    const basePower = resultFor(attackerFixture, "skill_wind");
    const stackedPower = resultFor(attackerFixture, "skill_wind", {
      attackerTraitStacks: 3,
    });
    expect(stackedPower.skillPower - basePower.skillPower).toBe(30);
    expect(stackedPower.totalDamage).toBeGreaterThan(basePower.totalDamage);

    const defenderFixture = fixtureWithTraitOn("spirit_water");
    const basePhysical = resultFor(defenderFixture, "skill_wind");
    const stackedPhysical = resultFor(defenderFixture, "skill_wind", {
      defenderTraitStacks: 3,
    });
    expect(stackedPhysical.combatPanel.defender.physicalDefense).toBeGreaterThan(
      basePhysical.combatPanel.defender.physicalDefense,
    );
    expect(stackedPhysical.totalDamage).toBeLessThan(basePhysical.totalDamage);

    const baseMagical = resultFor(defenderFixture, "skill_water");
    const stackedMagical = resultFor(defenderFixture, "skill_water", {
      defenderTraitStacks: 3,
    });
    expect(stackedMagical.combatPanel.defender.magicalDefense).toBe(
      baseMagical.combatPanel.defender.magicalDefense,
    );
    expect(stackedMagical.totalDamage).toBe(baseMagical.totalDamage);
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

    expect(result.effectivePower).toBe(200);
    expect(labels).toContain("手动显示威力");
    expect(labels).not.toContain("属性克制");
    expect(labels).not.toContain("攻防等级");
    expect(labels).not.toContain("其他威力乘区");
  });

  test("keeps automatic static, actual, and panel power aliases explicit", () => {
    const result = calculateMatchup(snapshot, battleInput()).forward.selectedResult;

    expect(result).toMatchObject({
      actualPower: 80,
      effectivePower: 80,
      panelPower: 80,
      powerSource: "automatic",
      staticPower: 80,
      skillPower: 80,
    });
  });

  test("manual static power includes status adjustments already and keeps panel multipliers", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            skillPowerPercentAdds: [0.5],
            overrides: {
              attackDefenseLevelMultiplier: 1.1,
              fixedPowerAdd: 20,
              otherPowerMultipliers: [1.5],
              powerOverride: { mode: "static", value: 100 },
              stabMultiplier: 1.25,
              typeMultiplier: 2,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      actualPower: 100,
      panelPower: 413,
      powerSource: "manual-static",
      staticPower: 100,
      skillPower: 100,
      effectivePower: 413,
    });
    expect(result.formulaSteps.map((step) => step.label)).toContain(
      "手动静态威力",
    );
  });

  test("automatic static power follows fixed adjustments after a manual override is cleared", () => {
    const automatic = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: { overrides: { fixedPowerAdd: 20 } },
        },
      }),
    ).forward.selectedResult;
    const manual = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              fixedPowerAdd: 20,
              powerOverride: { mode: "static", value: 55 },
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(automatic.staticPower).toBe(100);
    expect(manual.staticPower).toBe(55);
    expect(manual.actualPower).toBe(55);
  });

  test("automatic static power follows status percentage bonuses", () => {
    const base = calculateMatchup(snapshot, battleInput()).forward.selectedResult;
    const boosted = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: { skillPowerPercentAdds: [0.5] },
        },
      }),
    ).forward.selectedResult;

    expect(boosted.staticPower).toBe(120);
    expect(boosted.actualPower).toBe(120);
    expect(boosted.panelPower).toBeGreaterThan(base.panelPower);
  });

  test("manual panel power enters damage without reapplying any panel multiplier", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            skillPowerPercentAdds: [0.5],
            overrides: {
              attackDefenseLevelMultiplier: 1.8,
              fixedPowerAdd: 20,
              otherPowerMultipliers: [2],
              powerOverride: { mode: "panel", value: 281 },
              stabMultiplier: 1.25,
              typeMultiplier: 2,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      effectivePower: 281,
      panelPower: 281,
      powerSource: "manual-panel",
    });
    const labels = result.formulaSteps.map((step) => step.label);
    expect(labels).toContain("手动显示威力");
    expect(labels).not.toContain("本系");
    expect(labels).not.toContain("属性克制");
    expect(labels).not.toContain("攻防等级");
    expect(labels).not.toContain("其他威力乘区");
  });

  test("manual static power still accepts later mark bonuses", () => {
    const mode = "static";
    const value = 88;
    const baseInput = battleInput({
      directions: {
        forward: {
          overrides: { powerOverride: { mode, value } },
        },
      },
    });
    const markedInput = battleInput({
      directions: baseInput.directions,
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
    });
    const base = calculateMatchup(snapshot, baseInput).forward.selectedResult;
    const marked = calculateMatchup(snapshot, markedInput).forward.selectedResult;

    expect(marked.staticPower).toBe(base.staticPower);
    expect(marked.actualPower).toBeGreaterThan(base.actualPower);
    expect(marked.totalDamage).toBeGreaterThan(base.totalDamage);
  });

  test("manual panel power is not multiplied by a hidden mark bonus", () => {
    const overrides = { powerOverride: { mode: "panel", value: 281 } };
    const baseInput = battleInput({ directions: { forward: { overrides } } });
    const markedInput = battleInput({
      directions: baseInput.directions,
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
    });
    const base = calculateMatchup(snapshot, baseInput).forward.selectedResult;
    const marked = calculateMatchup(snapshot, markedInput).forward.selectedResult;

    expect(marked.effectivePower).toBe(base.effectivePower);
    expect(marked.totalDamage).toBe(base.totalDamage);
  });

  test("重组把下一次攻击拆成原属性与幻系两段独立伤害", () => {
    const withReassembly = (stacks) => battleInput({
      marks: {
        attacker: {
          negative: { id: null, stacks: 0 },
          positive: { id: "reassembly", stacks },
        },
        defender: {
          negative: { id: "starfall", stacks: 2 },
          positive: { id: null, stacks: 0 },
        },
      },
    });
    const normal = calculateMatchup(snapshot, withReassembly(1)).forward.selectedResult;
    const countered = calculateMatchup(snapshot, withReassembly(3)).forward.selectedResult;

    expect(normal).toMatchObject({
      status: "exact",
    });
    const normalExtra = normal.totalDamage - normal.mainDamage - normal.additionalDamage;
    const counteredExtra =
      countered.totalDamage - countered.mainDamage - countered.additionalDamage;
    expect(normalExtra).toBeGreaterThan(0);
    expect(counteredExtra).toBeGreaterThan(normalExtra);
    expect(normal.reassemblyDamage).toBe(normalExtra);
    expect(countered.reassemblyDamage).toBe(counteredExtra);
    expect(normal.markSettlements).toContainEqual(
      expect.objectContaining({
        damage: normalExtra,
        markId: "reassembly",
        status: "applied",
        text: `重组：追加 100% 幻系伤害 ${normalExtra}`,
      }),
    );
    expect(countered.markSettlements).toContainEqual(
      expect.objectContaining({
        damage: counteredExtra,
        markId: "reassembly",
        status: "applied",
        text: `重组（应对防御）：追加 300% 幻系伤害 ${counteredExtra}`,
      }),
    );
    expect(countered.formulaSteps).toContainEqual(
      expect.objectContaining({ label: "重组追加伤害" }),
    );
  });

  test("new power override wins over every legacy manual power field", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              basePower: 123,
              basePowerOverride: 124,
              displayedPower: 300,
              powerMode: "displayed",
              powerOverride: { mode: "static", value: 90 },
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      actualPower: 90,
      powerSource: "manual-static",
      skillPower: 90,
    });
  });

  test("power override keeps declared hit count and other non-power effects", () => {
    const comboSkill = {
      ...snapshot.skills[0],
      description: "造成物理伤害，3连击。",
      id: "skill_combo_override",
      name: "覆盖连击",
    };
    const fixture = { ...snapshot, skills: [...snapshot.skills, comboSkill] };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        sides: {
          attacker: side("spirit_sonic_dog", comboSkill.id, [
            {
              hitCount: 3,
              overrides: { powerOverride: { mode: "static", value: 90 } },
              skillId: comboSkill.id,
            },
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      actualPower: 90,
      hitCount: 3,
      powerSource: "manual-static",
    });
  });

  test("显示威力四舍五入后才进入伤害公式", () => {
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
    expect(result.totalDamage).toBe(97);
  });

  test("先发制人的半点威力向下取整后进入伤害公式", () => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? { ...skill, basePower: 55, name: "先发制人" }
          : skill,
      ),
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: {
          forward: {
            skillPowerPercentAdds: [0.5],
            overrides: {
              attackerStat: 271,
              defenderDefense: 170,
              stabMultiplier: 1,
              typeMultiplier: 1,
            },
          },
        },
      }),
    ).forward.selectedResult;
    const steps = Object.fromEntries(
      result.formulaSteps.map((step) => [step.label, step]),
    );

    expect(result).toMatchObject({
      actualPower: 82,
      displayPower: 82,
      effectivePower: 82,
      totalDamage: 117,
    });
    expect(steps["技能威力百分比"]).toMatchObject({
      before: 55,
      after: 82,
      input: [0.5],
    });
    expect(steps["显示威力"]).toMatchObject({
      before: 82,
      after: 82,
      input: { method: "round" },
    });
    expect(steps["等级系数与攻防比"]).toMatchObject({
      after: 117,
      input: {
        attackerStat: 271,
        calculationPower: 82,
        displayedPower: 82,
        defenderDefense: 170,
        roundedNumerator: 20054,
      },
    });
  });

  test("多维击打按目标星陨印记同步额外连击并忽略旧技能条件", () => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind" || skill.id === "skill_water"
          ? { ...skill, basePower: 15, name: "多维击打" }
          : skill,
      ),
    };
    const staleInputId = getSkillEffectInputs(
      fixture.skills.find((skill) => skill.id === "skill_wind"),
    ).find((input) => input.contextKey === "enemyStarfallMarks").id;
    const input = battleInput({
      directions: {
        forward: { context: { [staleInputId]: 1, enemyStarfallMarks: 1 } },
        reverse: { context: { [staleInputId]: 1, enemyStarfallMarks: 1 } },
      },
      marks: {
        attacker: {
          negative: { id: "starfall", stacks: 2 },
          positive: { id: null, stacks: 0 },
        },
        defender: {
          negative: { id: "starfall", stacks: 3 },
          positive: { id: null, stacks: 0 },
        },
      },
    });

    expect(calculateMatchup(fixture, input).forward.selectedResult.hitCount).toBe(4);
    expect(calculateMatchup(fixture, input).reverse.selectedResult.hitCount).toBe(3);

    input.marks.defender.negative.stacks = 5;
    expect(calculateMatchup(fixture, input).forward.selectedResult.hitCount).toBe(6);
  });

  test("雷暴的蓄电来源跟随己方印记层数且不重复计数", () => {
    const fixture = {
      ...snapshot,
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? {
              ...skill,
              basePower: 55,
              category: "magical",
              cost: 1,
              name: "雷暴",
              type: "电",
            }
          : skill,
      ),
    };
    const thunderstorm = fixture.skills.find((skill) => skill.id === "skill_wind");
    const chargeInputId = getSkillEffectInputs(thunderstorm).find(
      (input) => input.contextKey === "burstSourceChargeMark",
    ).id;
    const calculate = (chargeStacks, staleSelected) =>
      calculateMatchup(
        fixture,
        battleInput({
          directions: {
            forward: {
              context: {
                [chargeInputId]: staleSelected,
                burstSourceChargeMark: staleSelected,
              },
            },
          },
          marks: {
            attacker: {
              negative: { id: null, stacks: 0 },
              positive: chargeStacks > 0
                ? { id: "charge", stacks: chargeStacks }
                : { id: null, stacks: 0 },
            },
            defender: {
              negative: { id: null, stacks: 0 },
              positive: { id: null, stacks: 0 },
            },
          },
        }),
      ).forward.selectedResult;

    expect(calculate(3, false)).toMatchObject({
      skillCost: 2,
      skillPower: 95,
      staticPower: 95,
    });
    expect(calculate(3, true)).toMatchObject({
      skillCost: 2,
      skillPower: 95,
      staticPower: 95,
    });
    expect(calculate(0, true)).toMatchObject({
      skillCost: 1,
      skillPower: 55,
    });
  });

  test.each([
    [0, 55, 79],
    [0.2, 66, 94],
    [0.33, 73, 105],
    [0.499, 82, 117],
  ])(
    "有效威力在百分比加成 %s 后统一向下取整为 %s",
    (powerPercentAdd, expectedPower, expectedDamage) => {
      const fixture = {
        ...snapshot,
        skills: snapshot.skills.map((skill) =>
          skill.id === "skill_wind"
            ? { ...skill, basePower: 55, name: "取整边界技能" }
            : skill,
        ),
      };
      const result = calculateMatchup(
        fixture,
        battleInput({
          directions: {
            forward: {
              skillPowerPercentAdds: [powerPercentAdd],
              overrides: {
                attackerStat: 271,
                defenderDefense: 170,
                stabMultiplier: 1,
                typeMultiplier: 1,
              },
            },
          },
        }),
      ).forward.selectedResult;

      expect(result).toMatchObject({
        displayPower: expectedPower,
        effectivePower: expectedPower,
        totalDamage: expectedDamage,
      });
    },
  );

  test("本系结算后的显示威力四舍五入展示但伤害沿用未取整值", () => {
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

  test("普通伤害统一使用取整后的实际攻防面板并保留内部威力小数", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              attackerStat: 50,
              attackLevelStage: 18,
              defenderDefense: 55,
              defenseLevelStage: 5,
              stabMultiplier: 1,
              typeMultiplier: 1,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      displayPower: 149,
      totalDamage: 121,
    });
    expect(
      result.formulaSteps.find((step) => step.label === "等级系数与攻防比"),
    ).toMatchObject({
      input: {
        attackerStat: 140,
        calculationPower: 80,
        defenderDefense: 83,
        roundedNumerator: 10107,
      },
    });
  });

  test("caps calculated attack and defense ability stages at positive and negative 99", () => {
    const calculateAtStages = (attackLevelStage, defenseLevelStage) =>
      calculateMatchup(
        snapshot,
        battleInput({
          directions: {
            forward: {
              overrides: { attackLevelStage, defenseLevelStage },
            },
          },
        }),
      ).forward.selectedResult;

    const capped = calculateAtStages(99, -99);
    const overflow = calculateAtStages(100, -100);

    expect(overflow.damage).toBe(capped.damage);
    expect(overflow.effectivePower).toBe(capped.effectivePower);
    expect(
      overflow.formulaSteps.find((step) => step.label === "攻防等级"),
    ).toMatchObject({ input: 20.8 });
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

  test("特性提供的半层能力等级按实际百分比结算而不向下截断", () => {
    const result = calculateMatchup(
      snapshot,
      battleInput({
        directions: {
          forward: {
            overrides: {
              attackLevelStage: 7.5,
              defenseLevelStage: 0,
            },
          },
        },
      }),
    ).forward.selectedResult;

    expect(result.effectivePower).toBe(140);
    expect(
      result.formulaSteps.find((step) => step.label === "攻防等级"),
    ).toMatchObject({ input: 1.75 });
  });

  test("攻击百分比特性进入实际面板，显示威力仍保留能力等级结果", () => {
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

    expect(panelStep).toMatchObject({ before: 271, after: 542 });
    expect(result.effectivePower).toBe(160);
    expect(
      result.formulaSteps.find((step) => step.label === "等级系数与攻防比"),
    ).toMatchObject({ input: { attackerStat: 542, calculationPower: 80 } });
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

  test("does not calculate an S4 preview skill whose parameters are pending", () => {
    const previewSkill = {
      basePower: null,
      calculationStatus: "pending-skill-data",
      category: null,
      cost: null,
      id: "skill-s4-preview",
      name: "广播",
      type: null,
    };
    const input = battleInput({
      sides: {
        attacker: side("spirit_sonic_dog", previewSkill.id, [
          previewSkill.id,
          null,
          null,
          null,
        ]),
      },
    });
    const result = calculateMatchup(
      { ...snapshot, skills: [...snapshot.skills, previewSkill] },
      input,
    ).forward.selectedResult;

    expect(result).toMatchObject({
      reason: "技能参数待确认，暂不可计算",
      status: "unsupported",
      totalDamage: null,
    });
  });

  test("calculates a partially known S4 attack from manual power without reviving a stored cost override", () => {
    const previewSkill = {
      basePower: null,
      calculationStatus: "pending-skill-data",
      category: "magical",
      cost: null,
      id: "skill-s4-preview-broadcast",
      name: "广播",
      type: "机械",
    };
    const input = battleInput({
      mode: "four",
      sides: {
        attacker: side("spirit_sonic_dog", previewSkill.id, [
          {
            skillId: previewSkill.id,
            overrides: {
              costOverride: 4,
              powerOverride: { mode: "static", value: 90 },
            },
          },
          null,
          null,
          null,
        ]),
      },
    });
    const result = calculateMatchup(
      { ...snapshot, skills: [...snapshot.skills, previewSkill] },
      input,
    ).forward.selectedResult;

    expect(result).toMatchObject({
      staticPower: 90,
      status: "exact",
    });
    expect(result.skillCost).toBeUndefined();
    expect(result.totalDamage).toBeGreaterThan(0);
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

  test("applies Focus to Wish Power when physical attack is the selected stat", () => {
    const wishPower = {
      basePower: 80,
      category: "dual",
      cost: 2,
      id: "skill_wish_power_focus",
      name: "愿力冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "草",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_focus"] }
          : spirit,
      ),
      skills: [...snapshot.skills, wishPower],
      traits: [
        {
          affectsDamage: true,
          description: "入场首回合，获得物攻+100%。",
          id: "trait_focus",
          name: "专注力",
        },
      ],
    };
    const attacker = side("spirit_sonic_dog", wishPower.id, [
      wishPower.id,
      null,
      null,
      null,
    ]);
    const base = calculateMatchup(
      fixture,
      battleInput({ sides: { attacker } }),
    ).forward.selectedResult;
    const activated = calculateMatchup(
      fixture,
      battleInput({
        sides: { attacker },
        directions: {
          forward: { context: { traitActivated: true } },
        },
      }),
    ).forward.selectedResult;

    expect(activated.effectivePower).toBe(base.effectivePower * 2);
    expect(activated.totalDamage).toBeGreaterThan(base.totalDamage);
  });

  test("applies Focus only to physical attack in the projected panel", () => {
    const wishPower = {
      basePower: 80,
      category: "dual",
      cost: 2,
      id: "skill_wish_power_focus_panel",
      name: "愿力冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "草",
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: ["trait_focus"] }
          : spirit,
      ),
      skills: [...snapshot.skills, wishPower],
      traits: [
        {
          affectsDamage: true,
          description: "入场首回合，获得物攻+100%。",
          id: "trait_focus",
          name: "专注力",
        },
      ],
    };
    const attacker = side("spirit_sonic_dog", wishPower.id, [
      wishPower.id,
      null,
      null,
      null,
    ]);
    const base = calculateMatchup(
      fixture,
      battleInput({ sides: { attacker } }),
    ).forward.selectedResult;
    const activated = calculateMatchup(
      fixture,
      battleInput({
        sides: { attacker },
        directions: {
          forward: { context: { traitActivated: true } },
        },
      }),
    ).forward.selectedResult;

    expect(activated.combatPanel.attacker.physicalAttack).toBe(
      base.combatPanel.attacker.physicalAttack * 2,
    );
    expect(activated.combatPanel.attacker.magicalAttack).toBe(
      base.combatPanel.attacker.magicalAttack,
    );
  });

  test("chooses Wish Power attack channel after category-specific trait bonuses", () => {
    const wishPower = {
      basePower: 80,
      category: "dual",
      cost: 2,
      id: "skill_wish_power_focus_crossover",
      name: "愿力冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "草",
    };
    const crossoverSpirit = {
      id: "spirit_wish_crossover",
      fullName: "愿力测试精灵",
      types: ["火"],
      raceStats: {
        physicalAttack: 80,
        magicalAttack: 110,
        speed: 100,
        hp: 100,
        physicalDefense: 100,
        magicalDefense: 100,
      },
      traitIds: ["trait_focus"],
    };
    const fixture = {
      ...snapshot,
      spirits: [...snapshot.spirits, crossoverSpirit],
      skills: [...snapshot.skills, wishPower],
      traits: [
        {
          affectsDamage: true,
          description: "入场首回合，获得物攻+100%。",
          id: "trait_focus",
          name: "专注力",
        },
      ],
    };
    const attacker = {
      ...side(crossoverSpirit.id, wishPower.id, [
        wishPower.id,
        null,
        null,
        null,
      ]),
      natureMultipliers: {},
    };
    const base = calculateMatchup(
      fixture,
      battleInput({ sides: { attacker } }),
    ).forward.selectedResult;
    const activated = calculateMatchup(
      fixture,
      battleInput({
        sides: { attacker },
        directions: {
          forward: { context: { traitActivated: true } },
        },
      }),
    ).forward.selectedResult;

    expect(
      base.formulaSteps.find(({ label }) => label === "攻击面板")?.input,
    ).toBe("magicalAttack");
    expect(
      activated.formulaSteps.find(({ label }) => label === "攻击面板")?.input,
    ).toBe("physicalAttack");
    expect(activated.combatPanel.attacker.physicalAttack).toBeGreaterThan(
      activated.combatPanel.attacker.magicalAttack,
    );
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
      basePower: 75,
      category: "physical",
      cost: 3,
      description: "若敌方本回合更换精灵，本次技能威力+90，且无视抵抗。",
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

    expect(normal.effectivePower).toBe(38);
    expect(triggered).toMatchObject({
      effectivePower: 165,
      skillPower: 165,
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

  test("戏耍把蝙蝠实际吸血量作为特性真伤加入总伤害", () => {
    const trait = { id: "trait-clown", name: "戏耍" };
    const bat = {
      id: "skill-bat",
      name: "蝙蝠",
      type: "恶",
      category: "physical",
      basePower: 65,
      description: "造成物伤，并吸血100%。",
      provenance: { basePower: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      skills: [...snapshot.skills, bat],
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: { reverse: { currentHp: 358 } },
        sides: {
          attacker: side("spirit_sonic_dog", bat.id, [bat.id, null, null, null]),
        },
      }),
    ).forward.selectedResult;

    expect(result.status).toBe("exact");
    expect(result.traitDamage).toBe(50);
    expect(result.totalDamage).toBe(result.mainDamage + 50);
    expect(result.traitSettlements[0].text).toContain("实际回复 50");
  });

  test("戏耍让休息回复按缺失生命直接显示特性真伤", () => {
    const trait = { id: "trait-clown", name: "戏耍" };
    const rest = {
      id: "skill-rest-heal",
      name: "休息回复",
      type: "普通",
      category: "status",
      basePower: 0,
      description: "自己回复30%生命。",
      provenance: { basePower: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      skills: [...snapshot.skills, rest],
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: { reverse: { currentHp: 300 } },
        sides: {
          attacker: side("spirit_sonic_dog", rest.id, [rest.id, null, null, null]),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      mainDamage: 0,
      status: "exact",
      totalDamage: 108,
      traitDamage: 108,
    });

    const fullHpResult = calculateMatchup(
      fixture,
      battleInput({
        directions: { reverse: { currentHp: 408 } },
        sides: {
          attacker: side("spirit_sonic_dog", rest.id, [rest.id, null, null, null]),
        },
      }),
    ).forward.selectedResult;
    expect(fullHpResult).toMatchObject({
      status: "exact",
      totalDamage: 0,
      traitDamage: 0,
    });
    expect(fullHpResult.traitSettlements[0].text).toContain("溢出治疗不计伤害");
  });

  test("戏耍把光合治愈拆成独立真伤，并与当前技能伤害合并", () => {
    const trait = { id: "trait-clown", name: "戏耍" };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const input = battleInput({
      mode: "four",
      directions: {
        forward: {
          context: {
            bloodlineMagicId: "photosynthetic-healing",
            bloodlineMagicTriggered: true,
          },
        },
        reverse: { currentHp: 300 },
      },
    });
    const result = calculateMatchup(fixture, input).forward;

    expect(result.bloodlineResult).toMatchObject({
      skillName: "戏耍·光合治愈",
      sourceKind: "bloodline",
      status: "exact",
      totalDamage: 61,
      traitDamage: 61,
    });
    expect(result.bloodlineResult.formulaSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          after: 183,
          before: 61,
          label: "血脉魔法后续回复",
        }),
      ]),
    );
    expect(result.results[0].totalDamage).toBe(
      result.results[0].mainDamage + 61,
    );
    expect(result.results[0].traitSettlements.at(-1).text).toContain(
      "光合治愈 61",
    );

    input.directions.forward.selectedDamageSource = "bloodline";
    const selected = calculateMatchup(fixture, input).forward;
    expect(selected.selectedResult).toBe(selected.bloodlineResult);
  });

  test("贪得无厌根据当前生命和本次吸血计算后续物攻等级", () => {
    const trait = { id: "trait-baron", name: "贪得无厌" };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: { reverse: { currentHp: 400 } },
      }),
    ).forward.selectedResult;

    expect(result.postAttackEffects).toMatchObject({
      attackLevelStageAdd: expect.any(Number),
      source: "贪得无厌",
    });
    expect(result.traitSettlements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining("本次加攻"),
      }),
    ]));
  });

  test("贪得无厌在整套计算中只吸取目标实际损失的生命", () => {
    const trait = { id: "trait-baron", name: "贪得无厌" };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: {
          forward: { currentHp: 10 },
          reverse: { currentHp: 408 },
        },
      }),
    ).forward.selectedResult;
    const settlement = result.formulaSteps.find(
      (step) => step.label === "贪得无厌溢出回复",
    );

    expect(result.mainDamage).toBeGreaterThan(10);
    expect(settlement.input).toMatchObject({
      lifestealPercent: 50,
      requestedHealing: 5,
    });
  });

  test("贪得无厌把直接回复的溢出生命换算为后续物攻等级", () => {
    const trait = { id: "trait-baron", name: "贪得无厌" };
    const rest = {
      id: "skill-baron-rest",
      name: "休息回复",
      type: "普通",
      category: "status",
      basePower: 0,
      description: "自己回复30%生命。",
      provenance: { basePower: { source: "fixture" } },
    };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      skills: [...snapshot.skills, rest],
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: { reverse: { currentHp: 408 } },
        sides: {
          attacker: side(
            "spirit_sonic_dog",
            rest.id,
            [rest.id, null, null, null],
          ),
        },
      }),
    ).forward.selectedResult;

    expect(result).toMatchObject({
      mainDamage: 0,
      status: "exact",
      totalDamage: 0,
      postAttackEffects: {
        attackLevelStageAdd: 5,
        source: "贪得无厌",
      },
    });
    expect(result.traitSettlements[0].text).toContain("溢出122");
    expect(result.traitSettlements[0].text).toContain("本次加攻+50%");
  });

  test("铭记于月亮前瞻版不结算攻击后自损", () => {
    const trait = { id: "trait-moon-memory", name: "铭记于月亮" };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [trait.id] }
          : spirit,
      ),
      skills: snapshot.skills.map((skill) =>
        skill.id === "skill_wind"
          ? { ...skill, description: "造成物理伤害，3连击。" }
          : skill
      ),
      traits: [trait],
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        directions: {
          forward: { hitCount: 3 },
          reverse: { currentHp: 100 },
        },
      }),
    ).forward.selectedResult;

    expect(result.hitCount).toBe(3);
    expect(result.postAttackEffects?.moonMemorySelfDamage).toBeUndefined();
    expect(
      result.formulaSteps.some((step) => step.label.includes("铭记于月亮")),
    ).toBe(false);
  });

  test("铭记于月亮在选择技能额外执行时也不结算前瞻自损", () => {
    const moonMemory = { id: "trait-moon-memory", name: "铭记于月亮" };
    const choiceTrait = { id: "trait-choice", name: "有求必应" };
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [moonMemory.id, choiceTrait.id] }
          : spirit,
      ),
      traits: [moonMemory, choiceTrait],
    };
    const entry = {
      context: {
        choiceTraitTriggered: true,
        friendshipMode: "growth",
        skillUseCount: 0,
      },
      overrides: { basePower: 70 },
      skillId: "skill_friendship_overflow",
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        mode: "four",
        directions: { reverse: { currentHp: 100 } },
        sides: {
          attacker: side("spirit_sonic_dog", entry.skillId, [
            entry,
            null,
            null,
            null,
          ]),
        },
      }),
    ).forward.selectedResult;

    expect(result.choiceTraitSequence.executions).toHaveLength(2);
    expect(
      result.formulaSteps.filter((step) =>
        step.label.includes("铭记于月亮")
      ),
    ).toHaveLength(0);
    expect(
      (result.traitSettlements ?? []).filter(
        (settlement) => settlement.kind === "moon-memory",
      ),
    ).toHaveLength(0);
    expect(result.postAttackEffects?.moonMemorySelfDamage).toBeUndefined();
  });

  test("吞噬的电流刺激使用自己的迸发开关且不会误消耗蓄电", () => {
    const moonMemory = { id: "trait-moon-memory", name: "铭记于月亮" };
    const currentStimulus = { id: "trait-current-stimulus", name: "电流刺激" };
    const burstControl = getTraitEffectInputs(
      currentStimulus,
      "attacker",
    ).find((control) => control.contextKey === "burstTriggered");
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((spirit) =>
        spirit.id === "spirit_sonic_dog"
          ? { ...spirit, traitIds: [moonMemory.id] }
          : spirit,
      ),
      traits: [moonMemory, currentStimulus],
    };
    const attacker = side("spirit_sonic_dog", "skill_wind", [
      "skill_wind",
      null,
      null,
      null,
    ]);
    attacker.acquiredTraitIds = [currentStimulus.id];
    attacker.acquiredTraitValues = {
      [currentStimulus.id]: {
        [canonicalTraitControlKey(burstControl)]: false,
      },
    };
    const result = calculateMatchup(
      fixture,
      battleInput({
        marks: {
          attacker: {
            negative: { id: null, stacks: 0 },
            positive: { id: "charge", stacks: 3 },
          },
          defender: {
            negative: { id: null, stacks: 0 },
            positive: { id: null, stacks: 0 },
          },
        },
        sides: { attacker },
      }),
    ).forward.selectedResult;

    expect(result.markSettlements).not.toContainEqual(
      expect.objectContaining({ markId: "charge", status: "applied" }),
    );
  });
});
