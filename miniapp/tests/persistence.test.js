import { describe, expect, test, vi } from "vitest";
import {
  MINIAPP_MEMORY_ENABLED_KEY,
  MINIAPP_PERSISTENCE_SCHEMA_VERSION,
  MINIAPP_STATE_KEY,
  createPersistence,
} from "../src/state/persistence.js";
import { getSkillEffectInputs } from "../src/shared/domain/skill-effects.js";
import { createInitialState } from "../src/shared/state/defaults.js";

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
        traitIds: ["trait-ignite"],
      },
      {
        id: "spirit-b",
        name: "防守方",
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

describe("createPersistence", () => {
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
        context: {
          counterTriggered: true,
          token: "private-token",
        },
        fixedPowerAddsBySlot: [0, 10, 20],
        identity: { openid: "secret-openid" },
        privateMultiplier: 9,
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
      context: {
        enemyEnergy: 5,
        token: "private-token",
      },
      identity: { openid: "secret-openid" },
      privateMultiplier: 9,
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
        context: { counterTriggered: true },
        fixedPowerAddsBySlot: [0, 10, 20],
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
      context: { enemyEnergy: 5 },
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
      context: { enemyEnergy: 5 },
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

    expect(persistence.load(snapshot)).toEqual(createInitialState(snapshot));
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

    expect(persistence.load(snapshot)).toEqual(createInitialState(snapshot));
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
    expect(persistence.load(snapshot)).toEqual(createInitialState(snapshot));
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
