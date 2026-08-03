import { describe, expect, test, vi } from "vitest";
import {
  MINIAPP_STATE_KEY,
  createPersistence,
} from "../src/state/persistence.js";
import { createInitialState } from "../src/shared/state/defaults.js";

function createSnapshot(dataVersion = "data-v1") {
  return {
    meta: {
      id: dataVersion,
      rulesVersion: "rules-v1",
    },
    spirits: [
      { id: "spirit-a", name: "攻击方" },
      { id: "spirit-b", name: "防守方" },
    ],
    skills: [
      { id: "skill-a", name: "技能 A" },
      { id: "skill-b", name: "技能 B" },
      { id: "skill-c", name: "技能 C" },
      { id: "skill-d", name: "技能 D" },
    ],
  };
}

function createMemoryStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(MINIAPP_STATE_KEY, initialValue);
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
      },
      defender: {
        ...state.sides.defender,
        spiritId: "spirit-b",
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
      schemaVersion: 1,
      dataVersion: "data-v1",
      state: {
        mode: "four",
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
      sides: {
        attacker: {
          spiritId: "spirit-a",
          nature: "adamant",
          skills: {
            single: "skill-b",
            four: ["skill-a", "skill-b", "skill-c", "skill-d"],
          },
        },
        defender: {
          spiritId: "spirit-b",
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

  test.each([
    ["missing state", undefined],
    ["corrupted JSON", "{not-json"],
    [
      "unsupported schema",
      JSON.stringify({
        schemaVersion: 2,
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
});
