import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";

const initialState = {
  directions: {
    forward: {
      reduction: 1,
      finalDamageMultiplier: 1,
    },
    reverse: {
      reduction: 0.8,
      finalDamageMultiplier: 1.2,
    },
  },
};

describe("calculatorReducer", () => {
  test("updates one side negative status and swaps it with the spirits", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }],
    });
    const updated = calculatorReducer(state, {
      key: "poison",
      side: "defender",
      type: "negative-status/update",
      value: 120,
    });
    expect(updated.negativeStatuses.defender.poison).toBe(99);
    const swapped = calculatorReducer(updated, { type: "sides/swap" });
    expect(swapped.negativeStatuses.attacker.poison).toBe(99);
    expect(swapped.negativeStatuses.defender.poison).toBe(0);
  });

  test("stores the optional settlement switch independently from display-only state", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }],
    });
    const next = calculatorReducer(state, {
      type: "calculation-option/set-negative-status",
      value: true,
    });
    expect(next.calculationOptions.includeNegativeStatusSettlement).toBe(true);
  });

  test("stores canonical trait values on the owning side", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      skills: [{ id: "skill-a" }],
      spirits: [{ id: "spirit-a" }, { id: "spirit-b" }],
    };
    const state = createInitialState(snapshot);
    const next = calculatorReducer(state, {
      type: "side/set-trait-value",
      side: "attacker",
      key: "trait.traitActivated.activation",
      value: true,
    });

    expect(next.sides.attacker.traitValues).toEqual({
      "trait.traitActivated.activation": true,
    });
    expect(next.sides.defender.traitValues).toEqual({});
  });

  test("updates one side and one polarity of marks without touching the other slots", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }],
    });

    const next = calculatorReducer(state, {
      type: "mark/update",
      side: "defender",
      polarity: "negative",
      value: { id: "starfall", stacks: 4 },
    });

    expect(next.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 4,
    });
    expect(next.marks.defender.positive).toBe(state.marks.defender.positive);
    expect(next.marks.attacker).toBe(state.marks.attacker);
  });

  test("updates only the selected direction", () => {
    const next = calculatorReducer(initialState, {
      type: "direction/set-reduction",
      direction: "forward",
      value: 0.5,
    });

    expect(next.directions.forward.reduction).toBe(0.5);
    expect(next.directions.reverse).toEqual(initialState.directions.reverse);
    expect(next.directions.reverse).toBe(initialState.directions.reverse);
  });

  test("swaps complete spirit configurations", () => {
    const state = {
      ...initialState,
      sides: {
        attacker: {
          spiritId: "spirit_attacker",
          nature: "勇敢",
          displayIvs: { hp: 60, physicalAttack: 54 },
          skills: {
            single: "skill_attacker_single",
            four: ["skill_a", "skill_b", null, null],
          },
        },
        defender: {
          spiritId: "spirit_defender",
          nature: "胆小",
          displayIvs: { hp: 48, physicalDefense: 42 },
          skills: {
            single: "skill_defender_single",
            four: ["skill_c", null, null, null],
          },
        },
      },
    };

    const next = calculatorReducer(state, { type: "sides/swap" });

    expect(next.sides.attacker).toEqual(state.sides.defender);
    expect(next.sides.defender).toEqual(state.sides.attacker);
    expect(next.sides.attacker).toBe(state.sides.defender);
    expect(next.sides.defender).toBe(state.sides.attacker);
    expect(next.directions).toBe(state.directions);
  });

  test("switches single and four-skill modes without discarding either setup", () => {
    const state = {
      ...initialState,
      mode: "single",
      sides: {
        attacker: {
          skills: {
            single: "skill_single",
            four: ["skill_a", "skill_b", "skill_c", "skill_d"],
          },
        },
        defender: {
          skills: {
            single: "skill_reverse_single",
            four: ["skill_w", "skill_x", "skill_y", "skill_z"],
          },
        },
      },
    };

    const four = calculatorReducer(state, {
      type: "mode/set",
      value: "four",
    });
    const single = calculatorReducer(four, {
      type: "mode/set",
      value: "single",
    });

    expect(four.mode).toBe("four");
    expect(four.sides).toBe(state.sides);
    expect(four.directions).toBe(state.directions);
    expect(single.mode).toBe("single");
    expect(single.sides).toEqual(state.sides);
  });

  test("updates one side's raw inputs without changing the other side", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }, { id: "skill_b" }],
    });

    const withSpirit = calculatorReducer(state, {
      type: "side/set-spirit",
      side: "attacker",
      value: "attacker_variant",
    });
    const withNature = calculatorReducer(withSpirit, {
      type: "side/set-nature",
      side: "attacker",
      value: "brave",
    });
    const withIv = calculatorReducer(withNature, {
      type: "side/set-iv",
      side: "attacker",
      stat: "physicalAttack",
      value: 54,
    });
    const next = calculatorReducer(withIv, {
      type: "side/set-four-skill",
      side: "attacker",
      index: 2,
      value: "skill_c",
    });

    expect(next.sides.attacker).toMatchObject({
      spiritId: "attacker_variant",
      nature: "brave",
      displayIvs: { physicalAttack: 54 },
      skills: {
        single: "skill_a",
        four: ["skill_a", "skill_b", "skill_c", null],
      },
    });
    expect(next.sides.defender).toBe(state.sides.defender);
    expect(state.sides.attacker).toMatchObject({
      spiritId: "attacker",
      nature: "neutral",
      displayIvs: { physicalAttack: 60 },
      skills: {
        four: ["skill_a", "skill_b", null, null],
      },
    });
  });

  test("reconciles the changed spirit's skills while preserving its nature and ivs", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      skills: [{ id: "fire-a" }, { id: "fire-b" }],
      spirits: [{ id: "fire-spirit" }, { id: "defender" }],
    });
    state.sides.attacker.nature = "adamant";
    state.sides.attacker.displayIvs.physicalAttack = 54;
    state.sides.attacker.skills = {
      four: ["fire-a", "fire-b", null, null],
      single: "fire-a",
    };
    state.sides.attacker.traitValues = {
      "trait.traitActivated.activation": true,
    };

    const next = calculatorReducer(state, {
      legalSkillIds: ["water-a", "water-b"],
      side: "attacker",
      type: "side/set-spirit",
      value: "water-spirit",
    });

    expect(next.sides.attacker).toMatchObject({
      displayIvs: { physicalAttack: 54 },
      nature: "adamant",
      skills: {
        four: ["water-a", "water-b", null, null],
        single: "water-a",
      },
      spiritId: "water-spirit",
      traitValues: {},
    });
    expect(next.sides.defender).toBe(state.sides.defender);
  });

  test("reconciles a seven-slot spirit without truncating its extra slots", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      skills: [{ id: "old-skill" }],
      spirits: [{ id: "attacker" }, { id: "defender" }],
    });

    const next = calculatorReducer(state, {
      capacity: 7,
      legalSkillIds: Array.from({ length: 7 }, (_, index) => `skill-${index + 1}`),
      side: "attacker",
      type: "side/set-spirit",
      value: "rainbow-unicorn",
    });

    expect(next.sides.attacker.skills.four).toEqual([
      "skill-1",
      "skill-2",
      "skill-3",
      "skill-4",
      "skill-5",
      "skill-6",
      "skill-7",
    ]);
  });

  test("atomically applies a complete team member to one side", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      skills: [{ id: "skill-a" }],
      spirits: [{ id: "attacker" }, { id: "defender" }],
    });
    const member = {
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
            context: { energy: 3, nested: { stacks: 2 } },
            hitCount: 2,
            memoryBySkill: {
              "skill-a": {
                context: { energy: 4, nested: { stacks: 3 } },
                hitCount: 3,
                overrides: { basePower: 90 },
              },
            },
            skillId: "skill-a",
          },
          null,
          null,
          null,
        ],
        single: null,
      },
      spiritId: "team-spirit",
      traitValues: {
        "trait.attackerTraitStacks.stack": 3,
      },
    };

    const next = calculatorReducer(state, {
      side: "attacker",
      type: "side/apply-preset",
      value: member,
    });

    expect(next.sides.attacker).toEqual({
      displayIvs: member.displayIvs,
      nature: "adamant",
      skills: {
        four: member.skills.four,
        single: member.skills.four[0],
      },
      spiritId: "team-spirit",
      traitValues: member.traitValues,
    });
    expect(next.sides.attacker.displayIvs).not.toBe(member.displayIvs);
    expect(next.sides.attacker.skills.four).not.toBe(member.skills.four);
    expect(next.sides.attacker.skills.four[0]).not.toBe(
      member.skills.four[0],
    );
    expect(next.sides.attacker.skills.four[0].memoryBySkill).not.toBe(
      member.skills.four[0].memoryBySkill,
    );
    expect(next.sides.attacker.traitValues).not.toBe(member.traitValues);
    expect(
      next.sides.attacker.skills.four[0].memoryBySkill["skill-a"].context,
    ).not.toBe(
      member.skills.four[0].memoryBySkill["skill-a"].context,
    );
    next.sides.attacker.skills.four[0].context.nested.stacks = 8;
    next.sides.attacker.skills.four[0].memoryBySkill[
      "skill-a"
    ].context.nested.stacks = 9;
    expect(member.skills.four[0].context.nested.stacks).toBe(2);
    expect(
      member.skills.four[0].memoryBySkill["skill-a"].context.nested.stacks,
    ).toBe(3);
    expect(next.sides.defender).toBe(state.sides.defender);
    expect(next.directions).toBe(state.directions);
  });

  test("rejects incomplete team members", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      skills: [{ id: "skill-a" }],
      spirits: [{ id: "attacker" }],
    });

    expect(() =>
      calculatorReducer(state, {
        side: "attacker",
        type: "side/apply-preset",
        value: null,
      }),
    ).toThrow("队伍成员配置无效");
    expect(() =>
      calculatorReducer(state, {
        side: "attacker",
        type: "side/apply-preset",
        value: {
          displayIvs: state.sides.attacker.displayIvs,
          natureId: "neutral",
          skills: { four: ["skill-a"], single: "skill-a" },
          spiritId: "attacker",
        },
      }),
    ).toThrow("队伍成员技能槽数量无效");
  });

  test("updates a complete direction environment without cross-direction fallback", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }],
    });

    const next = calculatorReducer(state, {
      type: "direction/update",
      direction: "reverse",
      value: {
        selectedSkillIndex: 2,
        reduction: 0.75,
        hitCount: 3,
        starfallStacks: 4,
        finalDamageMultiplier: 1.25,
        currentHp: 320,
        context: { energy: 5, abnormalStacks: 2 },
        overrides: { basePower: 120, stab: 1.4 },
      },
    });

    expect(next.directions.reverse).toMatchObject({
      selectedSkillIndex: 2,
      reduction: 0.75,
      hitCount: 3,
      starfallStacks: 4,
      finalDamageMultiplier: 1.25,
      currentHp: 320,
      context: { energy: 5, abnormalStacks: 2 },
      overrides: { basePower: 120, stab: 1.4 },
    });
    expect(next.directions.forward).toBe(state.directions.forward);
    expect(state.directions.reverse).toMatchObject({
      selectedSkillIndex: 0,
      reduction: 1,
      context: {},
      overrides: {},
    });
  });

  test("atomically replaces state with decoded share inputs", () => {
    const state = createInitialState({
      meta: { id: "s3", rulesVersion: "rules-v1" },
      spirits: [{ id: "attacker" }, { id: "defender" }],
      skills: [{ id: "skill_a" }],
    });
    const imported = {
      ...state,
      mode: "four",
      versions: { data: "s2", rules: "rules-v0" },
      directions: {
        ...state.directions,
        reverse: {
          ...state.directions.reverse,
          reduction: 0.4,
        },
      },
    };

    const next = calculatorReducer(state, {
      type: "state/replace",
      value: imported,
    });

    expect(next).toBe(imported);
  });
});

describe("createInitialState", () => {
  test("creates complete side and direction inputs from snapshot versions", () => {
    const state = createInitialState({
      meta: {
        id: "s3-2026-07-15",
        rulesVersion: "rules-2026.07",
      },
      spirits: [
        { id: "spirit_attacker" },
        { id: "spirit_defender" },
      ],
      skills: [
        { id: "skill_a" },
        { id: "skill_b" },
        { id: "skill_c" },
      ],
    });

    expect(state).toMatchObject({
      schemaVersion: 1,
      versions: {
        data: "s3-2026-07-15",
        rules: "rules-2026.07",
      },
      mode: "single",
      sides: {
        attacker: {
          spiritId: "spirit_attacker",
          nature: "neutral",
          displayIvs: {
            hp: 60,
            speed: 60,
            physicalAttack: 60,
            magicalAttack: 60,
            physicalDefense: 60,
            magicalDefense: 60,
          },
          skills: {
            single: "skill_a",
            four: ["skill_a", "skill_b", "skill_c", null],
          },
          traitValues: {},
        },
        defender: {
          spiritId: "spirit_defender",
          traitValues: {},
        },
      },
      directions: {
        forward: {
          selectedSkillIndex: 0,
          reduction: 1,
          hitCount: 1,
          starfallStacks: 0,
          finalDamageMultiplier: 1,
          currentHp: null,
          context: {},
          overrides: {},
        },
        reverse: {
          selectedSkillIndex: 0,
          reduction: 1,
          hitCount: 1,
          starfallStacks: 0,
          finalDamageMultiplier: 1,
          currentHp: null,
          context: {},
          overrides: {},
        },
      },
    });

    expect(state.sides.defender).not.toBe(state.sides.attacker);
    expect(state.sides.defender.displayIvs).not.toBe(
      state.sides.attacker.displayIvs,
    );
    expect(state.sides.defender.skills.four).not.toBe(
      state.sides.attacker.skills.four,
    );
    expect(state.directions.reverse).not.toBe(state.directions.forward);
    expect(state.directions.reverse.context).not.toBe(
      state.directions.forward.context,
    );
  });
});
