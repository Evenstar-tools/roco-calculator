import { describe, expect, test } from "vitest";
import runtimeSnapshot from "../../public/data/runtime.json";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../../src/domain/skill-status-effects.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import { canonicalTraitControlKey } from "../../src/state/trait-values.js";
import {
  abilityLevelMultiplier,
  applyConfiguration,
  assertSnapshotReferences,
  createProductInitialState,
  migrateSharedConfiguration,
  patchFourSkill,
  rememberSingleSkill,
  replaceConfiguration,
  selectSpirit,
  selectFourSkill,
  selectSingleSkill,
  shareHashFromInput,
  updateMirroredTraitContext,
} from "../../src/state/calculator-session.js";

test("能力等级按正负九十九层封顶", () => {
  expect(abilityLevelMultiplier(99, 0)).toBeCloseTo(10.9);
  expect(abilityLevelMultiplier(100, 0)).toBeCloseTo(10.9);
  expect(abilityLevelMultiplier(-99, 0)).toBeCloseTo(1 / 10.9);
  expect(abilityLevelMultiplier(-100, 0)).toBeCloseTo(1 / 10.9);
});

const snapshot = {
  meta: { id: "s3-session", rulesVersion: "rules-v1" },
  spirits: [{ id: "alpha" }, { id: "beta" }],
  skills: [
    { id: "skill-a", name: "魔能爆", ruleId: "mana_burst" },
    {
      description: "造成伤害，5连击。",
      id: "skill-b",
      name: "连击",
      ruleId: "stack_scaled",
      ruleParams: { contextKey: "stackCount" },
    },
  ],
  learnsets: [
    { spiritId: "alpha", skillIds: ["skill-a", "skill-b"] },
    { spiritId: "beta", skillIds: ["skill-b"] },
  ],
};

function configuration(spiritId = "alpha") {
  return {
    displayIvs: {
      hp: 48,
      magicalAttack: 54,
      magicalDefense: 42,
      physicalAttack: 60,
      physicalDefense: 36,
      speed: 30,
    },
    natureId: "adamant",
    skills: {
      four: [
        {
          context: { energy: 3 },
          hitCount: 2,
          overrides: { basePower: 88 },
          skillId: "skill-a",
        },
        "skill-b",
        null,
        null,
      ],
      single: {
        context: { energy: 4 },
        hitCount: 3,
        overrides: { basePower: 99 },
        skillId: "skill-a",
      },
    },
    spiritId,
  };
}

function runtimeSkill(name) {
  return runtimeSnapshot.skills.find((skill) => skill.name === name);
}

function runtimeSkillControls(name) {
  const skill = runtimeSkill(name);
  return [
    ...getSkillEffectInputs(skill),
    ...getSkillStatusEffectInputs(skill),
  ];
}

function runtimeControl(name, contextKey) {
  return runtimeSkillControls(name).find(
    (control) => control.contextKey === contextKey,
  );
}

const fixtureEnergyId = getSkillEffectInputs(snapshot.skills[0]).find(
  (control) => control.contextKey === "energy",
).id;

describe("calculator session", () => {
  test("starts both compact sides with all six individual values at 60", () => {
    const state = createProductInitialState(runtimeSnapshot);

    for (const side of ["attacker", "defender"]) {
      expect(Object.values(state.sides[side].displayIvs)).toEqual([
        60,
        60,
        60,
        60,
        60,
        60,
      ]);
    }
  });

  test("auto-enables moon judgment against a leader and clears the default for a non-leader", () => {
    const moonSpirit = runtimeSnapshot.spirits.find(
      (spirit) => spirit.traitName === "月光审判",
    );
    const leader = runtimeSnapshot.spirits.find(
      (spirit) => spirit.stage === "首领",
    );
    const nonLeader = runtimeSnapshot.spirits.find(
      (spirit) => spirit.stage !== "首领" && spirit.id !== moonSpirit.id,
    );
    const trait = runtimeSnapshot.traits.find(
      (candidate) => candidate.name === "月光审判",
    );
    const activation = getTraitEffectInputs(trait, "attacker").find(
      (control) => control.contextKey === "traitActivated",
    );
    const initialState = createProductInitialState(runtimeSnapshot);

    const attackerSelected = selectSpirit(initialState, {
      initialState,
      personalConfiguration: null,
      side: "attacker",
      snapshot: runtimeSnapshot,
      spiritId: moonSpirit.id,
    });
    const leaderSelected = selectSpirit(attackerSelected.state, {
      initialState,
      personalConfiguration: null,
      side: "defender",
      snapshot: runtimeSnapshot,
      spiritId: leader.id,
    });

    expect(leaderSelected.state.directions.forward.context[activation.id]).toBe(
      true,
    );

    const nonLeaderSelected = selectSpirit(leaderSelected.state, {
      initialState,
      personalConfiguration: null,
      side: "defender",
      snapshot: runtimeSnapshot,
      spiritId: nonLeader.id,
    });
    expect(
      nonLeaderSelected.state.directions.forward.context[activation.id],
    ).toBe(false);
  });

  test("auto-enables moon judgment for every family member in its attack direction", () => {
    const family = runtimeSnapshot.spirits.filter(
      (spirit) => spirit.traitName === "月光审判",
    );
    const leader = runtimeSnapshot.spirits.find(
      (spirit) => spirit.stage === "首领",
    );
    const trait = runtimeSnapshot.traits.find(
      (candidate) => candidate.name === "月光审判",
    );
    const activation = getTraitEffectInputs(trait, "attacker").find(
      (control) => control.contextKey === "traitActivated",
    );

    expect(family.map((spirit) => spirit.fullName)).toEqual([
      "犀角鸟",
      "光纤兽",
      "疾光千兽",
    ]);
    for (const spirit of family) {
      const initialState = createProductInitialState(runtimeSnapshot);
      const defenderSelected = selectSpirit(initialState, {
        initialState,
        personalConfiguration: null,
        side: "defender",
        snapshot: runtimeSnapshot,
        spiritId: spirit.id,
      });
      const leaderSelected = selectSpirit(defenderSelected.state, {
        initialState,
        personalConfiguration: null,
        side: "attacker",
        snapshot: runtimeSnapshot,
        spiritId: leader.id,
      });

      expect(
        leaderSelected.state.directions.reverse.context[activation.id],
      ).toBe(true);
    }
  });

  test.each([
    ["personal", true, "attacker"],
    ["team", true, "attacker"],
    ["share", false, null],
  ])(
    "applies %s configuration with explicit remember=%s",
    (source, remember, rememberSide) => {
      const initialState = createProductInitialState(snapshot);
      const dirtyState = {
        ...initialState,
        directions: {
          forward: {
            ...initialState.directions.forward,
            context: { stale: true },
            currentHp: 1,
          },
          reverse: {
            ...initialState.directions.reverse,
            context: { stale: true },
            currentHp: 2,
          },
        },
      };

      const result = applyConfiguration(dirtyState, configuration(), {
        initialState,
        remember,
        side: "attacker",
        source,
      });

      expect(result.activeDirection).toBe("forward");
      expect(result.persistence.rememberSide).toBe(rememberSide);
      expect(result.state.sides.attacker).toMatchObject({
        nature: "adamant",
        spiritId: "alpha",
      });
      expect(result.state.directions.forward).toMatchObject({
        context: { energy: 4 },
        currentHp: null,
        hitCount: 3,
        overrides: { basePower: 99 },
      });
      expect(result.state.directions.reverse.context).toEqual({});
    },
  );

  test("requires source and remember instead of inferring persistence semantics", () => {
    const initialState = createProductInitialState(snapshot);

    expect(() =>
      applyConfiguration(initialState, configuration(), {
        initialState,
        side: "attacker",
      }),
    ).toThrow("source");
  });

  test("switching spirits restores only the saved loadout and clears battle state", () => {
    const initialState = createProductInitialState(snapshot);
    const dirtyState = {
      ...initialState,
      marks: {
        attacker: {
          negative: { id: "starfall", stacks: 7 },
          positive: { id: "defense", stacks: 2 },
        },
        defender: {
          negative: { id: "starfall", stacks: 3 },
          positive: null,
        },
      },
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          spiritId: "alpha",
        },
      },
      directions: {
        forward: {
          ...initialState.directions.forward,
          context: { statusApplied: true, weatherRainTurns: 8 },
          currentHp: 1,
          hitCount: 9,
          overrides: {
            basePower: 999,
            powerOverride: { mode: "panel", value: 321 },
          },
        },
        reverse: {
          ...initialState.directions.reverse,
          context: { statusApplied: true },
          currentHp: 2,
        },
      },
    };
    const personalConfiguration = {
      displayIvs: configuration().displayIvs,
      natureId: "timid",
      skills: {
        four: [{ context: {}, skillId: "skill-b" }, null, null, null],
        single: { context: {}, skillId: "skill-b" },
      },
      spiritId: "beta",
    };

    const result = selectSpirit(dirtyState, {
      initialState,
      personalConfiguration,
      side: "attacker",
      snapshot,
      spiritId: "beta",
    });

    expect(result.state.sides.attacker).toMatchObject({
      nature: "timid",
      spiritId: "beta",
    });
    expect(result.state.sides.attacker.skills.single).toMatchObject({
      context: {},
      skillId: "skill-b",
    });
    expect(result.state.directions.forward).toMatchObject({
      context: {},
      currentHp: null,
      hitCount: 1,
      overrides: {},
    });
    expect(result.state.directions.reverse.context).toEqual({});
    expect(result.state.directions.reverse.currentHp).toBeNull();
    expect(result.state.marks).toEqual(initialState.marks);
  });

  test("replaces share configuration without a persistence intent", () => {
    const initialState = createProductInitialState(snapshot);
    const sharedState = { ...initialState, mode: "single" };

    const result = replaceConfiguration(initialState, sharedState, {
      remember: false,
      source: "share",
    });

    expect(result.state).toBe(sharedState);
    expect(result.persistence.rememberSide).toBeNull();
  });

  test("deep-merges one four-skill slot without changing the other side", () => {
    const initialState = createProductInitialState(snapshot);
    const applied = applyConfiguration(initialState, configuration(), {
      initialState,
      remember: false,
      side: "attacker",
      source: "personal",
    }).state;

    const result = patchFourSkill(applied, {
      index: 0,
      patch: {
        context: { targetChanged: true },
        overrides: { displayedPower: 120 },
      },
      side: "attacker",
    });

    expect(result.state.sides.attacker.skills.four[0]).toEqual({
      context: { energy: 3, targetChanged: true },
      hitCount: 2,
      overrides: { basePower: 88, displayedPower: 120 },
      skillId: "skill-a",
    });
    expect(result.state.sides.defender).toBe(applied.sides.defender);
    expect(result.persistence.rememberSide).toBe("attacker");
  });

  test("keeps the gale turbine companion slot in a sanitized four-skill entry", () => {
    const initialState = createProductInitialState(runtimeSnapshot);
    const turbine = runtimeSkill("疾风涡轮");
    const learnerId = runtimeSnapshot.learnsets.find((learnset) =>
      learnset.skillIds.includes(turbine.id),
    ).spiritId;
    const state = {
      ...initialState,
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            ...initialState.sides.attacker.skills,
            four: [
              {
                context: {},
                hitCount: 1,
                overrides: {},
                skillId: turbine.id,
              },
              null,
              null,
              null,
            ],
          },
        },
      },
    };

    const result = patchFourSkill(state, {
      index: 0,
      patch: { context: { galeTurbineCompanionSlot: "2" } },
      side: "attacker",
      snapshot: runtimeSnapshot,
    });

    expect(
      result.state.sides.attacker.skills.four[0].context,
    ).toEqual({ galeTurbineCompanionSlot: "2" });
    expect(result.persistence.rememberSide).toBe("attacker");

    const restored = applyConfiguration(initialState, {
      ...initialState.sides.attacker,
      skills: result.state.sides.attacker.skills,
      spiritId: learnerId,
    }, {
      initialState,
      remember: false,
      side: "attacker",
      snapshot: runtimeSnapshot,
      source: "personal",
    });
    expect(
      restored.state.sides.attacker.skills.four[0].context,
    ).toEqual({ galeTurbineCompanionSlot: "2" });
  });

  test("keeps manual adjacent power inputs for 六自由度 and 钢钻", () => {
    const initialState = createProductInitialState(runtimeSnapshot);
    const sixDegrees = runtimeSkill("六自由度");
    const state = {
      ...initialState,
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            ...initialState.sides.attacker.skills,
            four: [
              {
                context: {},
                hitCount: 1,
                overrides: {},
                skillId: sixDegrees.id,
              },
              null,
              null,
              null,
            ],
          },
        },
      },
    };

    const result = patchFourSkill(state, {
      index: 0,
      patch: {
        context: {
          adjacentLeftDisplayedPowerOverride: 120,
          adjacentRightDisplayedPowerOverride: 80,
        },
      },
      side: "attacker",
      snapshot: runtimeSnapshot,
    });

    expect(result.state.sides.attacker.skills.four[0].context).toMatchObject({
      adjacentLeftDisplayedPowerOverride: 120,
      adjacentRightDisplayedPowerOverride: 80,
    });
  });

  test("clears the displayed fallback skill context when single memory is null", () => {
    const initialState = createProductInitialState(snapshot);
    const state = {
      ...initialState,
      directions: {
        ...initialState.directions,
        forward: {
          ...initialState.directions.forward,
          context: { energy: 7, keepMe: true, stackCount: 3 },
        },
      },
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            ...initialState.sides.attacker.skills,
            single: null,
          },
          spiritId: "alpha",
        },
      },
    };

    const result = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: "skill-b",
      snapshot,
    });

    expect(result.state.directions.forward.context).toEqual({ keepMe: true });
    expect(result.state.directions.forward.hitCount).toBe(5);
    expect(result.state.sides.attacker.skills.single).toMatchObject({
      context: {},
      hitCount: 5,
      skillId: "skill-b",
    });
  });

  test("keeps per-skill single memories and never carries an unrelated trigger into another skill", () => {
    const initialState = createProductInitialState(snapshot);
    let state = {
      ...initialState,
      directions: {
        ...initialState.directions,
        forward: {
          ...initialState.directions.forward,
          context: { "skill.energy": 7, keepBattle: true },
          hitCount: 2,
          overrides: { basePower: 123, powerMode: "base" },
        },
      },
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            ...initialState.sides.attacker.skills,
            single: {
              context: { "skill.energy": 7 },
              hitCount: 2,
              overrides: { basePower: 123, powerMode: "base" },
              skillId: "skill-a",
            },
          },
          spiritId: "alpha",
        },
      },
    };

    state = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: "skill-b",
      snapshot,
    }).state;
    expect(state.directions.forward).toMatchObject({
      context: { keepBattle: true },
      hitCount: 5,
      overrides: { basePower: null, displayedPower: null },
    });

    state = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: "skill-a",
      snapshot,
    }).state;
    expect(state.directions.forward).toMatchObject({
      context: { [fixtureEnergyId]: 7, keepBattle: true },
      hitCount: 2,
      overrides: { basePower: 123, powerMode: "base" },
    });
  });

  test("clears a temporary power override when selecting another single skill", () => {
    const initialState = createProductInitialState(snapshot);
    const state = {
      ...initialState,
      directions: {
        ...initialState.directions,
        forward: {
          ...initialState.directions.forward,
          overrides: {
            ...initialState.directions.forward.overrides,
            powerOverride: { mode: "static", value: 222 },
          },
        },
      },
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            ...initialState.sides.attacker.skills,
            single: { skillId: "skill-a" },
          },
          spiritId: "alpha",
        },
      },
    };

    const result = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: "skill-b",
      snapshot,
    });

    expect(result.state.directions.forward.overrides.powerOverride).toBeNull();
    expect(
      result.state.sides.attacker.skills.single.overrides.powerOverride,
    ).toBeUndefined();
  });

  test.each([
    ["魔能爆", "甜蜜陷阱", "energy", 7, 42],
    ["逆袭", "叠浪", "actualSkillCost", 12, 2],
  ])(
    "switches %s and %s without semantic collisions and restores each memory",
    (firstName, secondName, contextKey, firstValue, secondValue) => {
      const first = runtimeSkill(firstName);
      const second = runtimeSkill(secondName);
      const firstControl = runtimeControl(firstName, contextKey);
      const secondControl = runtimeControl(secondName, contextKey);
      let state = createProductInitialState(runtimeSnapshot);
      state.sides.attacker.skills.single = {
        context: { [firstControl.id]: firstValue },
        hitCount: 2,
        memoryBySkill: {},
        overrides: { basePower: 111, powerMode: "base" },
        skillId: first.id,
      };
      state.directions.forward = {
        ...state.directions.forward,
        context: { [firstControl.id]: firstValue },
        hitCount: 2,
        overrides: { basePower: 111, powerMode: "base" },
      };

      expect(() =>
        selectSingleSkill(state, {
          direction: "forward",
          side: "attacker",
          skillId: second.id,
          snapshot: runtimeSnapshot,
        }),
      ).not.toThrow();
      state = selectSingleSkill(state, {
        direction: "forward",
        side: "attacker",
        skillId: second.id,
        snapshot: runtimeSnapshot,
      }).state;
      state.directions.forward = {
        ...state.directions.forward,
        context: { [secondControl.id]: secondValue },
        hitCount: 4,
        overrides: { basePower: 222, powerMode: "base" },
      };
      state = selectSingleSkill(state, {
        direction: "forward",
        side: "attacker",
        skillId: first.id,
        snapshot: runtimeSnapshot,
      }).state;
      expect(state.directions.forward).toMatchObject({
        context: { [firstControl.id]: firstValue },
        hitCount: 2,
        overrides: { basePower: 111, powerMode: "base" },
      });
      state = selectSingleSkill(state, {
        direction: "forward",
        side: "attacker",
        skillId: second.id,
        snapshot: runtimeSnapshot,
      }).state;
      expect(state.directions.forward).toMatchObject({
        context: { [secondControl.id]: secondValue },
        hitCount: 4,
        overrides: { basePower: 222, powerMode: "base" },
      });
    },
  );

  test("keeps ordinary and conditional response controls in separate single-skill memories", () => {
    const ordinary = runtimeSkill("突袭");
    const conditional = runtimeSkill("友谊满溢");
    const ordinaryCounter = runtimeControl("突袭", "counterTriggered");
    const conditionalMode = runtimeControl("友谊满溢", "friendshipMode");
    const conditionalCounter = runtimeControl("友谊满溢", "counterTriggered");
    let state = createProductInitialState(runtimeSnapshot);
    state.sides.attacker.skills.single = {
      context: { [ordinaryCounter.id]: true },
      hitCount: 3,
      memoryBySkill: {},
      overrides: { basePower: 70, powerMode: "base" },
      skillId: ordinary.id,
    };
    state.directions.forward = {
      ...state.directions.forward,
      context: { [ordinaryCounter.id]: true },
      hitCount: 3,
      overrides: { basePower: 70, powerMode: "base" },
    };

    state = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: conditional.id,
      snapshot: runtimeSnapshot,
    }).state;
    state.directions.forward = {
      ...state.directions.forward,
      context: {
        [conditionalMode.id]: "counter",
        [conditionalCounter.id]: true,
      },
      hitCount: 4,
      overrides: { basePower: 90, powerMode: "base" },
    };
    state = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: ordinary.id,
      snapshot: runtimeSnapshot,
    }).state;
    expect(state.directions.forward).toMatchObject({
      context: { [ordinaryCounter.id]: true },
      hitCount: 3,
      overrides: { basePower: 70 },
    });
    state = selectSingleSkill(state, {
      direction: "forward",
      side: "attacker",
      skillId: conditional.id,
      snapshot: runtimeSnapshot,
    }).state;
    expect(state.directions.forward).toMatchObject({
      context: {
        [conditionalMode.id]: "counter",
        [conditionalCounter.id]: true,
      },
      hitCount: 4,
      overrides: { basePower: 90 },
    });
  });

  test("switches only the selected four-skill slot across colliding trigger schemas", () => {
    const manaBurst = runtimeSkill("魔能爆");
    const sweetTrap = runtimeSkill("甜蜜陷阱");
    const manaEnergy = runtimeControl("魔能爆", "energy");
    const state = createProductInitialState(runtimeSnapshot);
    state.directions.forward.context.negativeStatusUseCountsBySlot = {
      1: 2,
      2: 1,
    };
    const untouched = { skillId: runtimeSkill("突袭").id };
    state.sides.attacker.skills.four = [
      {
        context: { [manaEnergy.id]: 8 },
        hitCount: 2,
        overrides: { basePower: 130 },
        skillId: manaBurst.id,
      },
      untouched,
      null,
      null,
    ];

    const result = selectFourSkill(state, {
      index: 0,
      side: "attacker",
      skillId: sweetTrap.id,
      snapshot: runtimeSnapshot,
    });

    expect(result.state.sides.attacker.skills.four[0]).toMatchObject({
      context: {},
      skillId: sweetTrap.id,
    });
    expect(result.state.sides.attacker.skills.four[1]).toBe(untouched);
    expect(result.state.sides.defender).toBe(state.sides.defender);
    expect(
      result.state.directions.forward.context.negativeStatusUseCountsBySlot,
    ).toEqual({ 2: 1 });
  });

  test("stores direction traits with the selected single skill but excludes battle context from per-skill memory", () => {
    const initialState = createProductInitialState(snapshot);
    initialState.sides.attacker.spiritId = "alpha";
    initialState.sides.attacker.skills.single = { skillId: "skill-a" };
    initialState.directions.forward.context = {
      "attackerTrait.traitActivated": true,
      "skill.energy": 6,
      currentHpPercent: 80,
    };

    const result = rememberSingleSkill(initialState, {
      direction: "forward",
      side: "attacker",
      snapshot,
    });

    expect(result.state.sides.attacker.skills.single.context).toEqual({
      "attackerTrait.traitActivated": true,
      [fixtureEnergyId]: 6,
    });
    expect(
      result.state.sides.attacker.skills.single.memoryBySkill["skill-a"].context,
    ).toEqual({ [fixtureEnergyId]: 6 });
  });

  test("mirrors stable role-specific trait ids without corrupting the inner context key", () => {
    const state = createProductInitialState(snapshot);
    const result = updateMirroredTraitContext(state, {
      direction: "forward",
      key: "attackerTrait.attackerTraitStacks",
      value: 3,
    });

    expect(result.state.directions.forward.context).toMatchObject({
      "attackerTrait.attackerTraitStacks": 3,
    });
    expect(result.state.directions.reverse.context).toMatchObject({
      "defenderTrait.defenderTraitStacks": 3,
    });
  });

  test("mirrors fingerprinted trait ids to the symmetric role control", () => {
    const trait = runtimeSnapshot.traits.find((candidate) => {
      const attackerInputs = getTraitEffectInputs(candidate, "attacker");
      const defenderInputs = getTraitEffectInputs(candidate, "defender");
      return attackerInputs.some(
        (control) => control.contextKey === "attackerTraitStacks",
      ) && defenderInputs.some(
        (control) => control.contextKey === "defenderTraitStacks",
      );
    });
    const attackerControl = getTraitEffectInputs(trait, "attacker").find(
      (control) => control.contextKey === "attackerTraitStacks",
    );
    const defenderControl = getTraitEffectInputs(trait, "defender").find(
      (control) => control.contextKey === "defenderTraitStacks",
    );
    const state = createProductInitialState(runtimeSnapshot);

    const result = updateMirroredTraitContext(state, {
      direction: "forward",
      key: attackerControl.id,
      value: 3,
    });

    expect(attackerControl.id.split(".").at(-1)).toBe(
      defenderControl.id.split(".").at(-1),
    );
    expect(result.state.directions.reverse.context).toMatchObject({
      [defenderControl.id]: 3,
    });
  });

  test("稀兽花宝血脉选择同步到同一精灵的反向角色控件", () => {
    const trait = runtimeSnapshot.traits.find(({ name }) => name === "稀兽花宝");
    const attackerControl = getTraitEffectInputs(trait, "attacker").find(
      ({ contextKey }) => contextKey === "bloodlineType",
    );
    const defenderControl = getTraitEffectInputs(trait, "defender").find(
      ({ contextKey }) => contextKey === "bloodlineType",
    );
    const state = createProductInitialState(runtimeSnapshot);

    const result = updateMirroredTraitContext(state, {
      direction: "forward",
      key: attackerControl.id,
      value: "illusion",
    });

    expect(result.state.directions.forward.context[attackerControl.id]).toBe("illusion");
    expect(result.state.directions.reverse.context[defenderControl.id]).toBe("illusion");
  });

  test("无差别过滤勾选同步到同一精灵的反向角色控件", () => {
    const trait = runtimeSnapshot.traits.find(
      ({ name }) => name === "无差别过滤",
    );
    const attackerControl = getTraitEffectInputs(trait, "attacker")[0];
    const defenderControl = getTraitEffectInputs(trait, "defender")[0];
    const state = createProductInitialState(runtimeSnapshot);

    const result = updateMirroredTraitContext(state, {
      direction: "forward",
      key: attackerControl.id,
      value: true,
    });

    expect(result.state.directions.forward.context[attackerControl.id]).toBe(true);
    expect(result.state.directions.reverse.context[defenderControl.id]).toBe(true);
  });

  test("restores role-neutral personal trait values on both battle directions", () => {
    const trait = runtimeSnapshot.traits.find((candidate) => {
      const attackerInputs = getTraitEffectInputs(candidate, "attacker");
      const defenderInputs = getTraitEffectInputs(candidate, "defender");
      return attackerInputs.some(
        (control) => control.contextKey === "attackerTraitStacks",
      ) && defenderInputs.some(
        (control) => control.contextKey === "defenderTraitStacks",
      );
    });
    const spirit = runtimeSnapshot.spirits.find((candidate) =>
      candidate.traitIds?.includes(trait.id),
    );
    const attackerControl = getTraitEffectInputs(trait, "attacker").find(
      (control) => control.contextKey === "attackerTraitStacks",
    );
    const defenderControl = getTraitEffectInputs(trait, "defender").find(
      (control) => control.contextKey === "defenderTraitStacks",
    );
    const initialState = createProductInitialState(runtimeSnapshot);
    const preset = {
      ...configuration(spirit.id),
      traitValues: { [canonicalTraitControlKey(attackerControl)]: 3 },
    };

    const result = applyConfiguration(initialState, preset, {
      initialState,
      remember: false,
      side: "defender",
      snapshot: runtimeSnapshot,
      source: "personal",
    });

    expect(result.state.directions.forward.context[defenderControl.id]).toBe(3);
    expect(result.state.directions.reverse.context[attackerControl.id]).toBe(3);
  });

  test("switches one four-skill slot with semantic migration and leaves every other slot untouched", () => {
    const initialState = createProductInitialState(snapshot);
    const state = {
      ...initialState,
      sides: {
        ...initialState.sides,
        attacker: {
          ...initialState.sides.attacker,
          skills: {
            single: null,
            four: [
              {
                context: { "skill.energy": 8, stale: true },
                hitCount: 3,
                overrides: { basePower: 222 },
                skillId: "skill-a",
              },
              {
                context: { "skill.stackCount": 4 },
                hitCount: 5,
                overrides: { basePower: 77 },
                skillId: "skill-b",
              },
              null,
              null,
            ],
          },
          spiritId: "alpha",
        },
      },
    };

    const result = selectFourSkill(state, {
      index: 0,
      side: "attacker",
      skillId: "skill-b",
      snapshot,
    });

    expect(result.state.sides.attacker.skills.four[0]).toEqual({
      context: {},
      hitCount: 5,
      overrides: {},
      skillId: "skill-b",
    });
    expect(result.state.sides.attacker.skills.four[1]).toBe(
      state.sides.attacker.skills.four[1],
    );
    expect(result.state.sides.defender).toBe(state.sides.defender);
  });

  test("normalizes a full share URL and rejects unknown snapshot references", () => {
    expect(shareHashFromInput("https://example.test/#v1.payload.checksum")).toBe(
      "#v1.payload.checksum",
    );
    const sharedState = createProductInitialState(snapshot);
    sharedState.sides.attacker.spiritId = "unknown";
    expect(() => assertSnapshotReferences(sharedState, snapshot)).toThrow(
      "不存在的精灵",
    );

    sharedState.sides.attacker.spiritId = "alpha";
    sharedState.sides.attacker.skills.single = {
      memoryBySkill: { unknown: { context: {}, hitCount: 1, overrides: {} } },
      skillId: "skill-a",
    };
    expect(() => assertSnapshotReferences(sharedState, snapshot)).toThrow(
      "不存在的技能",
    );
  });

  test("migrates shared natures while preserving the remaining configuration", () => {
    const sharedState = createProductInitialState(snapshot);
    sharedState.sides.attacker.nature = "固执（+物攻，-魔攻）";

    const migrated = migrateSharedConfiguration(sharedState, {
      data: "current-data",
      rules: "current-rules",
    });

    expect(migrated.versions).toEqual({
      data: "current-data",
      rules: "current-rules",
    });
    expect(migrated.sides.attacker.nature).toBe("adamant");
    expect(migrated.sides.defender).toEqual(sharedState.sides.defender);
  });

  test("migrates legacy skill context keys to stable ids in directions, slots, and single memories", () => {
    const sharedState = createProductInitialState(snapshot);
    sharedState.sides.attacker.spiritId = "alpha";
    sharedState.sides.attacker.skills.single = {
      context: { energy: 4 },
      hitCount: 1,
      memoryBySkill: {
        "skill-a": {
          context: { energy: 6 },
          hitCount: 2,
          overrides: { basePower: 90 },
        },
      },
      skillId: "skill-a",
    };
    sharedState.sides.attacker.skills.four[0] = {
      context: { energy: 7 },
      hitCount: 1,
      skillId: "skill-a",
    };
    sharedState.directions.forward.context = {
      energy: 8,
      weatherRainTurns: 1,
    };

    const migrated = migrateSharedConfiguration(
      sharedState,
      sharedState.versions,
      snapshot,
    );

    expect(migrated.directions.forward.context).toEqual({
      [fixtureEnergyId]: 8,
      weatherRainTurns: 1,
    });
    expect(migrated.sides.attacker.skills.four[0].context).toEqual({
      [fixtureEnergyId]: 7,
    });
    expect(
      migrated.sides.attacker.skills.single.memoryBySkill["skill-a"].context,
    ).toEqual({ [fixtureEnergyId]: 6 });
  });

  test.each(["personal", "team"])(
    "restores only current slot and direction controls from an old %s preset",
    (source) => {
      const initialState = createProductInitialState(runtimeSnapshot);
      const manaBurst = runtimeSkill("魔能爆");
      const energyId = runtimeControl("魔能爆", "energy").id;
      const preset = {
        ...initialState.sides.attacker,
        skills: {
          ...initialState.sides.attacker.skills,
          single: {
            context: {
              attackerHpPercent: 44,
              energy: 6,
              "skill.attackerHpPercent": 33,
              "skill.unknown": 9,
            },
            hitCount: 2,
            memoryBySkill: {
              [manaBurst.id]: {
                context: {
                  attackerHpPercent: 55,
                  energy: 7,
                  "skill.unknown": 10,
                },
                hitCount: 3,
                overrides: { basePower: 90 },
              },
            },
            overrides: { basePower: 80 },
            skillId: manaBurst.id,
          },
        },
        spiritId: runtimeSnapshot.spirits[0].id,
      };

      const result = applyConfiguration(initialState, preset, {
        initialState,
        remember: false,
        side: "attacker",
        snapshot: runtimeSnapshot,
        source,
      });

      expect(result.state.directions.forward.context).toMatchObject({
        [energyId]: 6,
      });
      expect(result.state.directions.forward.context).not.toHaveProperty(
        "attackerHpPercent",
      );
      expect(result.state.directions.forward.context).not.toHaveProperty(
        "skill.attackerHpPercent",
      );
      expect(result.state.directions.forward.context).not.toHaveProperty(
        "skill.unknown",
      );
      expect(
        result.state.sides.attacker.skills.single.memoryBySkill[manaBurst.id]
          .context,
      ).toEqual({ [energyId]: 7 });
    },
  );
});
