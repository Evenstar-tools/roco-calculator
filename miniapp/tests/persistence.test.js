import { describe, expect, test, vi } from "vitest";
import {
  MINIAPP_MEMORY_ENABLED_KEY,
  MINIAPP_NEGATIVE_STATUS_ENABLED_KEY,
  MINIAPP_PERSISTENCE_SCHEMA_VERSION,
  MINIAPP_QUICK_UNDO_ENABLED_KEY,
  MINIAPP_QUICK_UNDO_POSITION_KEY,
  MINIAPP_STATE_KEY,
  MINIAPP_TEAM_ANALYSIS_ENABLED_KEY,
  MINIAPP_TEAM_ANALYSIS_MEMBERS_KEY,
  createPersistence,
} from "../src/state/persistence.js";
import { getSkillEffectInputs } from "../src/shared/domain/skill-effects.js";
import { createInitialState } from "../src/shared/state/defaults.js";

const COMPLETE_RACE_STATS = {
  hp: 100,
  speed: 100,
  physicalAttack: 100,
  magicalAttack: 100,
  physicalDefense: 100,
  magicalDefense: 100,
};

function createSnapshot(dataVersion = "data-v1") {
  return {
    meta: {
      id: dataVersion,
      rulesVersion: "rules-v1",
    },
    spirits: [
      {
        id: "spirit-a",
        name: "攻击方",
        raceStats: COMPLETE_RACE_STATS,
        traitIds: ["trait-ignite"],
      },
      {
        id: "spirit-b",
        name: "防守方",
        raceStats: COMPLETE_RACE_STATS,
        traitIds: ["trait-ignite"],
      },
    ],
    skills: [
      { id: "skill-a", name: "技能 A" },
      { id: "skill-b", name: "技能 B" },
      { id: "skill-c", name: "技能 C" },
      { id: "skill-d", name: "技能 D" },
    ],
    traits: [
      {
        description: "每层增加双攻双防。",
        id: "trait-ignite",
        name: "点燃",
      },
      {
        description: "被铭记后生效。",
        id: "trait-old-toy",
        name: "旧日玩具",
      },
      {
        description: "被铭记后生效。",
        id: "trait-cold-light",
        name: "冷光",
      },
    ],
  };
}

function createMemoryStorage(initialValue, memoryEnabled) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(MINIAPP_STATE_KEY, initialValue);
  }
  if (memoryEnabled !== undefined) {
    values.set(MINIAPP_MEMORY_ENABLED_KEY, memoryEnabled);
  }

  return {
    get: vi.fn((key) => values.get(key)),
    set: vi.fn((key, value) => values.set(key, value)),
    remove: vi.fn((key) => values.delete(key)),
  };
}

function createConfiguredState(snapshot = createSnapshot()) {
  const state = createInitialState(snapshot);
  return {
    ...state,
    mode: "four",
    sides: {
      attacker: {
        ...state.sides.attacker,
        spiritId: "spirit-a",
        nature: "adamant",
        skills: {
          single: "skill-b",
          four: ["skill-a", "skill-b", "skill-c", "skill-d"],
        },
        traitValues: {
          "trait.traitStacks.53103d7d": 3,
        },
      },
      defender: {
        ...state.sides.defender,
        spiritId: "spirit-b",
        traitValues: {
          "trait.traitEffect.ddee82fa": 120,
        },
      },
    },
    marks: {
      ...state.marks,
      attacker: {
        ...state.marks.attacker,
        positive: { id: "sprout", stacks: 3 },
      },
    },
    calculationOptions: { includeNegativeStatusSettlement: true },
    negativeStatuses: {
      attacker: { burn: 3, electrified: 2, freeze: 1, parasitism: 0, poison: 4 },
      defender: { burn: 2, electrified: 0, freeze: 0, parasitism: 3, poison: 1 },
    },
    directions: {
      ...state.directions,
      forward: {
        ...state.directions.forward,
        selectedSkillIndex: 2,
        currentHp: 88,
      },
    },
    result: { damage: 999 },
    calculation: { damage: 999 },
  };
}

function createExpectedDefaults(snapshot) {
  const state = createInitialState(snapshot);
  for (const side of Object.values(state.sides)) {
    side.acquiredTraitIds = [];
    side.acquiredTraitValues = {};
  }
  return state;
}

describe("createPersistence", () => {
  test("preserves negative status calculation inputs in configuration memory", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);

    persistence.save(state);
    expect(persistence.load(snapshot)).toMatchObject({
      calculationOptions: { includeNegativeStatusSettlement: true },
      negativeStatuses: state.negativeStatuses,
    });
  });

  test("persists the minimum snapshot needed to avoid replaying a status action", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    const actionSnapshot = {
      directions: {
        forward: {
          context: {},
          currentHp: null,
          finalDamageMultiplier: 1,
          hitCount: 1,
          overrides: {},
          reduction: 1,
          starfallStacks: 0,
        },
        reverse: {
          context: {},
          currentHp: null,
          finalDamageMultiplier: 1,
          hitCount: 1,
          overrides: {},
          reduction: 1,
          starfallStacks: 0,
        },
      },
      marks: state.marks,
    };
    state.sides.attacker.skills.four[0] = {
      skillId: "skill-a",
      statusAction: {
        actionKey: "skill:attacker:four:0",
        after: actionSnapshot,
        before: actionSnapshot,
      },
    };

    persistence.save(state);

    expect(persistence.load(snapshot).sides.attacker.skills.four[0])
      .toMatchObject({
        skillId: "skill-a",
        statusAction: {
          actionKey: "skill:attacker:four:0",
          before: { directions: { forward: { hitCount: 1 } } },
        },
      });
  });

  test("defaults only configuration memory and quick undo to on", () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });

    expect(persistence.getNegativeStatusEnabled()).toBe(false);
    expect(persistence.getQuickUndoEnabled()).toBe(true);
    expect(persistence.getQuickUndoPosition()).toBeNull();
    expect(persistence.getTeamAnalysisEnabled()).toBe(false);
    persistence.setNegativeStatusEnabled(true);
    persistence.setQuickUndoEnabled(true);
    persistence.setQuickUndoPosition({ bottom: 128, right: 18 });
    persistence.setTeamAnalysisEnabled(true);
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_NEGATIVE_STATUS_ENABLED_KEY,
      true,
    );
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_QUICK_UNDO_ENABLED_KEY,
      true,
    );
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_QUICK_UNDO_POSITION_KEY,
      { bottom: 128, right: 18 },
    );
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_TEAM_ANALYSIS_ENABLED_KEY,
      true,
    );
  });

  test("stores at most six valid team analysis members", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });

    expect(persistence.getTeamAnalysisMembers(snapshot)).toEqual([
      null, null, null, null, null, null,
    ]);
    persistence.setTeamAnalysisMembers([
      "spirit-a",
      "removed-spirit",
      "spirit-b",
      "spirit-a",
      "spirit-b",
      "spirit-a",
      "spirit-b",
    ], snapshot);

    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_TEAM_ANALYSIS_MEMBERS_KEY,
      ["spirit-a", null, "spirit-b", "spirit-a", "spirit-b", "spirit-a"],
    );
    expect(persistence.getTeamAnalysisMembers(snapshot)).toEqual([
      "spirit-a", null, "spirit-b", "spirit-a", "spirit-b", "spirit-a",
    ]);
  });

  test("stores the type analysis display setting independently", () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });

    expect(persistence.getTypeAnalysisEnabled()).toBe(false);
    expect(persistence.setTypeAnalysisEnabled(true)).toBe(true);
    expect(persistence.getTypeAnalysisEnabled()).toBe(true);
    expect(persistence.setTypeAnalysisEnabled(false)).toBe(false);
    expect(persistence.getTypeAnalysisEnabled()).toBe(false);
  });

  test("publishes persistence schema 2", () => {
    expect(MINIAPP_PERSISTENCE_SCHEMA_VERSION).toBe(2);
  });

  test("requires storage removal support for local data clearing", () => {
    expect(() =>
      createPersistence({
        storage: {
          get() {},
          set() {},
        },
      }),
    ).toThrow(/同步 storage/u);
  });

  test("saves only versioned calculator inputs and restores them", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });

    persistence.save(createConfiguredState(snapshot));

    const saved = storage.set.mock.calls[0][1];
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_STATE_KEY,
      expect.any(Object),
    );
    expect(saved).toEqual({
      schemaVersion: 2,
      dataVersion: "data-v1",
      state: {
        mode: "four",
        marks: expect.any(Object),
        calculationOptions: {
          includeNegativeStatusSettlement: true,
        },
        negativeStatuses: createConfiguredState(snapshot).negativeStatuses,
        sides: expect.any(Object),
        directions: expect.any(Object),
      },
    });
    expect(saved).not.toHaveProperty("result");
    expect(saved.state).not.toHaveProperty("result");
    expect(saved.state).not.toHaveProperty("calculation");

    expect(persistence.load(snapshot)).toMatchObject({
      schemaVersion: 1,
      versions: {
        data: "data-v1",
        rules: "rules-v1",
      },
      mode: "four",
      marks: {
        attacker: {
          positive: { id: "sprout", stacks: 3 },
        },
      },
      sides: {
        attacker: {
          spiritId: "spirit-a",
          nature: "adamant",
          skills: {
            single: "skill-b",
            four: ["skill-a", "skill-b", "skill-c", "skill-d"],
          },
          traitValues: {
            "trait.traitStacks.53103d7d": 3,
          },
        },
        defender: {
          spiritId: "spirit-b",
          traitValues: {
            "trait.traitEffect.ddee82fa": 120,
          },
        },
      },
      directions: {
        forward: {
          selectedSkillIndex: 2,
          currentHp: 88,
        },
      },
    });
  });

  test("safely saves and restores multiple acquired traits with isolated scalar values", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    state.sides.attacker.acquiredTraitIds = [
      "trait-old-toy",
      "trait-cold-light",
      "trait-old-toy",
      "../bad",
      "trait-unknown",
    ];
    state.sides.attacker.acquiredTraitValues = {
      "trait-old-toy": {
        "trait.traitStacks.12345678": 2,
        "trait.invalid.deadbeef": { nested: "private" },
        openid: "secret-openid",
      },
      "trait-cold-light": {
        "trait.previousTurnWingSkillUsed.87654321": true,
        "trait.contractBallType.cafebabe": "prism",
        "trait.invalid.facefeed": Number.POSITIVE_INFINITY,
      },
      "trait-unknown": {
        "trait.traitActivated.aaaaaaaa": true,
      },
      "trait-not-selected": {
        "trait.traitActivated.bbbbbbbb": true,
      },
    };

    persistence.save(state);

    const saved = storage.set.mock.calls[0][1];
    expect(saved.state.sides.attacker).toMatchObject({
      acquiredTraitIds: [
        "trait-old-toy",
        "trait-cold-light",
        "trait-unknown",
      ],
      acquiredTraitValues: {
        "trait-old-toy": {
          "trait.traitStacks.12345678": 2,
        },
        "trait-cold-light": {
          "trait.previousTurnWingSkillUsed.87654321": true,
          "trait.contractBallType.cafebabe": "prism",
        },
        "trait-unknown": {
          "trait.traitActivated.aaaaaaaa": true,
        },
      },
    });
    expect(JSON.stringify(saved)).not.toMatch(/private|secret-openid/u);

    expect(persistence.load(snapshot).sides.attacker).toMatchObject({
      acquiredTraitIds: ["trait-old-toy", "trait-cold-light"],
      acquiredTraitValues: {
        "trait-old-toy": {
          "trait.traitStacks.12345678": 2,
        },
        "trait-cold-light": {
          "trait.previousTurnWingSkillUsed.87654321": true,
          "trait.contractBallType.cafebabe": "prism",
        },
      },
    });
  });

  test("keeps at most five acquired traits and their isolated values", () => {
    const snapshot = createSnapshot();
    const acquiredTraitIds = Array.from(
      { length: 6 },
      (_, index) => `trait-extra-${index + 1}`,
    );
    snapshot.traits.push(
      ...acquiredTraitIds.map((id, index) => ({
        description: "被铭记后生效。",
        id,
        name: `额外特性 ${index + 1}`,
      })),
    );
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    state.sides.attacker.acquiredTraitIds = acquiredTraitIds;
    state.sides.attacker.acquiredTraitValues = Object.fromEntries(
      acquiredTraitIds.map((traitId) => [
        traitId,
        { "trait.traitActivated.aaaaaaaa": true },
      ]),
    );

    persistence.save(state);

    const expectedIds = acquiredTraitIds.slice(0, 5);
    const saved = storage.set.mock.calls[0][1];
    expect(saved.state.sides.attacker.acquiredTraitIds).toEqual(expectedIds);
    expect(Object.keys(saved.state.sides.attacker.acquiredTraitValues)).toEqual(
      expectedIds,
    );
    expect(persistence.load(snapshot).sides.attacker).toMatchObject({
      acquiredTraitIds: expectedIds,
      acquiredTraitValues: Object.fromEntries(
        expectedIds.map((traitId) => [
          traitId,
          { "trait.traitActivated.aaaaaaaa": true },
        ]),
      ),
    });
  });

  test("fills empty acquired trait state when loading an existing schema 2 snapshot", () => {
    const snapshot = createSnapshot();
    const legacyState = createConfiguredState(snapshot);
    for (const side of Object.values(legacyState.sides)) {
      delete side.acquiredTraitIds;
      delete side.acquiredTraitValues;
    }
    const persistence = createPersistence({
      storage: createMemoryStorage({
        dataVersion: "data-v1",
        schemaVersion: 2,
        state: legacyState,
      }),
    });

    const restored = persistence.load(snapshot);

    expect(restored.sides.attacker.acquiredTraitIds).toEqual([]);
    expect(restored.sides.attacker.acquiredTraitValues).toEqual({});
    expect(restored.sides.defender.acquiredTraitIds).toEqual([]);
    expect(restored.sides.defender.acquiredTraitValues).toEqual({});
  });

  test("saves and restores only schema-known nested calculator inputs", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    state.sides.attacker.skills.single = {
      basePowerOverride: 90,
      context: {
        counterDefenseSucceeded: true,
        counterTriggered: true,
        identity: { openid: "secret-openid" },
        incomingHitCount: 2,
        result: { totalDamage: 999 },
        token: "private-token",
      },
      fixedPowerAdd: 10,
      hitCount: 3,
      identity: { openid: "secret-openid" },
      memoryBySkill: {
        "skill-a": {
          context: {
            counterDefenseSucceeded: true,
            enemyEnergy: 4,
            openid: "secret-openid",
            password: "hunter2",
            token: "private-token",
          },
          hitCount: 2,
          identity: { openid: "secret-openid" },
          overrides: {
            context: {
              enemyEnergy: 5,
              token: "private-token",
            },
            displayedPower: 120,
            privateMultiplier: 9,
            powerMode: "displayed",
            result: { totalDamage: 999 },
          },
          result: { totalDamage: 999 },
        },
        "skill-c": {
          context: { token: "private-token" },
          identity: { openid: "secret-openid" },
          result: { totalDamage: 999 },
        },
      },
      otherPowerMultipliers: [1.1],
      overrides: {
        basePower: 95,
        costOverride: 4,
        context: {
          counterTriggered: true,
          token: "private-token",
        },
        fixedPowerAddsBySlot: [0, 10, 20],
        identity: { openid: "secret-openid" },
        privateMultiplier: 9,
        powerOverride: { mode: "panel", value: 175 },
        result: { totalDamage: 999 },
      },
      result: { totalDamage: 999 },
      skillId: "skill-b",
      skillPowerPercentAdds: [0.2],
    };
    state.directions.forward.context = {
      counterDefenseSucceeded: true,
      currentHpPercent: 80,
      incomingHitCount: 2,
      identity: { openid: "secret-openid" },
      result: { totalDamage: 999 },
      token: "private-token",
    };
    state.directions.forward.overrides = {
      attackLevelStage: 2,
      basePower: 90,
      costOverride: 3,
      context: {
        enemyEnergy: 5,
        token: "private-token",
      },
      identity: { openid: "secret-openid" },
      privateMultiplier: 9,
      powerOverride: { mode: "static", value: 110 },
      result: { totalDamage: 999 },
    };

    persistence.save(state);

    const expectedSkill = {
      basePowerOverride: 90,
      context: {
        counterDefenseSucceeded: true,
        counterTriggered: true,
        incomingHitCount: 2,
      },
      fixedPowerAdd: 10,
      hitCount: 3,
      memoryBySkill: {
        "skill-a": {
          context: {
            counterDefenseSucceeded: true,
            enemyEnergy: 4,
          },
          hitCount: 2,
          overrides: {
            context: { enemyEnergy: 5 },
            displayedPower: 120,
            powerMode: "displayed",
          },
        },
      },
      otherPowerMultipliers: [1.1],
      overrides: {
        basePower: 95,
        costOverride: 4,
        context: { counterTriggered: true },
        fixedPowerAddsBySlot: [0, 10, 20],
        powerOverride: { mode: "panel", value: 175 },
      },
      skillId: "skill-b",
      skillPowerPercentAdds: [0.2],
    };
    const saved = storage.set.mock.calls[0][1];
    expect(saved.state.sides.attacker.skills.single).toEqual(expectedSkill);
    expect(saved.state.directions.forward.context).toEqual({
      counterDefenseSucceeded: true,
      currentHpPercent: 80,
      incomingHitCount: 2,
    });
    expect(saved.state.directions.forward.overrides).toEqual({
      attackLevelStage: 2,
      basePower: 90,
      costOverride: 3,
      context: { enemyEnergy: 5 },
      powerOverride: { mode: "static", value: 110 },
    });

    const restored = persistence.load(snapshot);
    expect(restored.sides.attacker.skills.single).toEqual(expectedSkill);
    expect(restored.directions.forward.context).toEqual({
      counterDefenseSucceeded: true,
      currentHpPercent: 80,
      incomingHitCount: 2,
    });
    expect(restored.directions.forward.overrides).toEqual({
      attackLevelStage: 2,
      basePower: 90,
      costOverride: 3,
      context: { enemyEnergy: 5 },
      powerOverride: { mode: "static", value: 110 },
    });
  });

  test("rejects malformed skill entries before they reach storage", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    state.sides.attacker.skills.single = [
      {
        identity: { openid: "array-secret" },
        skillId: "skill-a",
      },
    ];
    state.sides.attacker.skills.four[0] = {
      context: { counterTriggered: true },
      skillId: { identity: { openid: "object-secret" } },
    };

    persistence.save(state);

    const saved = storage.set.mock.calls[0][1];
    expect(saved.state.sides.attacker.skills.single).toBeNull();
    expect(saved.state.sides.attacker.skills.four[0]).toBeNull();
    expect(JSON.stringify(saved)).not.toMatch(/array-secret|object-secret/u);
  });

  test("preserves energy values accepted by the sweet trap runtime control", () => {
    const energyControl = getSkillEffectInputs({ name: "甜蜜陷阱" }).find(
      (input) => input.contextKey === "energy",
    );
    expect(energyControl).toMatchObject({ max: 99, min: 0 });

    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(snapshot);
    state.sides.attacker.skills.single = {
      context: { energy: 50 },
      skillId: "skill-a",
    };

    persistence.save(state);

    const saved = storage.set.mock.calls[0][1];
    expect(saved.state.sides.attacker.skills.single).toEqual({
      context: { energy: 50 },
      skillId: "skill-a",
    });
    expect(persistence.load(snapshot).sides.attacker.skills.single).toEqual({
      context: { energy: 50 },
      skillId: "skill-a",
    });
  });

  test.each([
    ["missing state", undefined],
    ["corrupted JSON", "{not-json"],
    [
      "unsupported schema",
      JSON.stringify({
        schemaVersion: 3,
        dataVersion: "data-v1",
        state: createConfiguredState(),
      }),
    ],
  ])("falls back to current defaults for %s", (_label, storedValue) => {
    const snapshot = createSnapshot();
    const persistence = createPersistence({
      storage: createMemoryStorage(storedValue),
    });

    expect(persistence.load(snapshot)).toEqual(createExpectedDefaults(snapshot));
  });

  test("repairs unknown spirit and skill references against the current snapshot", () => {
    const oldSnapshot = createSnapshot("data-old");
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    const state = createConfiguredState(oldSnapshot);
    state.sides.attacker.spiritId = "removed-spirit";
    state.sides.attacker.skills.single = "removed-skill";
    state.sides.attacker.skills.four = [
      "skill-d",
      "removed-skill",
      null,
      "skill-a",
      "extra-slot",
    ];

    persistence.save(state);

    const currentSnapshot = createSnapshot("data-current");
    const restored = persistence.load(currentSnapshot);
    expect(restored).toMatchObject({
      versions: {
        data: "data-current",
        rules: "rules-v1",
      },
      mode: "four",
      sides: {
        attacker: {
          spiritId: "spirit-a",
          nature: "adamant",
          skills: {
            single: "skill-a",
            four: ["skill-d", "skill-b", null, "skill-a"],
          },
        },
        defender: {
          spiritId: "spirit-b",
        },
      },
    });
    expect(restored.sides.attacker.skills.four).toHaveLength(4);
  });

  test("repairs an invalid selected skill slot", () => {
    const snapshot = createSnapshot();
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    persistence.save(createConfiguredState(snapshot));
    storage.set.mock.calls[0][1].state.directions.forward.selectedSkillIndex =
      99;

    const restored = persistence.load(snapshot);

    expect(restored.directions.forward.selectedSkillIndex).toBe(0);
  });

  test("migrates schema 1 marks and filters unknown or sensitive fields", () => {
    const snapshot = createSnapshot();
    const legacyState = createConfiguredState(snapshot);
    delete legacyState.marks;
    legacyState.directions.forward.starfallStacks = 4;
    legacyState.sides.attacker.password = "hunter2";
    legacyState.sides.defender.openid = "secret-openid";
    legacyState.sides.attacker.skills.single = {
      context: { counterTriggered: true, password: "hunter2" },
      openid: "secret-openid",
      skillId: "skill-b",
    };
    legacyState.directions.forward.overrides = {
      basePower: 90,
      openid: "secret-openid",
    };
    legacyState.sides.attacker.traitValues = {
      ...legacyState.sides.attacker.traitValues,
      "trait.unknown.deadbeef": true,
      openid: "secret-openid",
      password: "hunter2",
    };
    const persistence = createPersistence({
      storage: createMemoryStorage({
        dataVersion: "data-v1",
        schemaVersion: 1,
        state: legacyState,
      }),
    });

    const restored = persistence.load(snapshot);

    expect(restored.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 4,
    });
    expect(restored.sides.attacker.traitValues).toEqual({
      "trait.traitStacks.53103d7d": 3,
    });
    expect(restored.sides.attacker.acquiredTraitIds).toEqual([]);
    expect(restored.sides.attacker.acquiredTraitValues).toEqual({});
    expect(restored.sides.attacker).not.toHaveProperty("password");
    expect(restored.sides.defender).not.toHaveProperty("openid");
    expect(restored.sides.attacker.skills.single).not.toHaveProperty(
      "openid",
    );
    expect(
      restored.sides.attacker.skills.single.context,
    ).not.toHaveProperty("password");
    expect(restored.directions.forward.overrides).not.toHaveProperty(
      "openid",
    );
  });

  test("rejects malformed persisted state without partially applying it", () => {
    const snapshot = createSnapshot();
    const storedValue = JSON.stringify({
      schemaVersion: 1,
      dataVersion: "data-v1",
      state: {
        mode: "four",
        sides: null,
        directions: {},
      },
    });
    const persistence = createPersistence({
      storage: createMemoryStorage(storedValue),
    });

    expect(persistence.load(snapshot)).toEqual(createExpectedDefaults(snapshot));
  });

  test("clears only the mini program calculator state key", () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });

    persistence.clear();

    expect(storage.remove).toHaveBeenCalledWith(MINIAPP_STATE_KEY);
  });

  test("enables configuration memory by default", () => {
    const persistence = createPersistence({
      storage: createMemoryStorage(),
    });

    expect(persistence.getMemoryEnabled()).toBe(true);
  });

  test("disabling configuration memory clears the old snapshot and blocks restore and save", () => {
    const snapshot = createSnapshot();
    const oldState = createConfiguredState(snapshot);
    const storage = createMemoryStorage();
    const persistence = createPersistence({ storage });
    persistence.save(oldState);
    storage.set.mockClear();
    storage.remove.mockClear();

    persistence.setMemoryEnabled(false);

    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_MEMORY_ENABLED_KEY,
      false,
    );
    expect(storage.remove).toHaveBeenCalledWith(MINIAPP_STATE_KEY);
    expect(persistence.load(snapshot)).toEqual(createExpectedDefaults(snapshot));
    persistence.save(oldState);
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  test("re-enabling configuration memory saves and restores the current page", () => {
    const snapshot = createSnapshot();
    const currentState = createConfiguredState(snapshot);
    const storage = createMemoryStorage(undefined, false);
    const persistence = createPersistence({ storage });

    persistence.setMemoryEnabled(true);
    persistence.save(currentState);

    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_MEMORY_ENABLED_KEY,
      true,
    );
    expect(persistence.load(snapshot).mode).toBe("four");
  });
});
