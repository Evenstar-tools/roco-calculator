import { describe, expect, test } from "vitest";
import {
  SPIRIT_CONFIG_STORAGE_KEY,
  isCompleteSpiritConfig,
  spiritConfigsRepository,
} from "../../src/state/spirit-configs.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function snapshot() {
  return {
    skills: [
      { id: "skill-a", name: "友谊满溢" },
      { id: "skill-b", name: "虹光冲击" },
      { id: "skill-c", name: "火焰切割" },
    ],
    spirits: [
      { fullName: "绒光优优", id: "spirit-a" },
      { fullName: "恶魔狼王", id: "spirit-b" },
    ],
  };
}

function configuredSide() {
  return {
    displayIvs: {
      hp: 0,
      speed: 54,
      physicalAttack: 60,
      magicalAttack: 27,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    nature: "adamant",
    skills: {
      four: [
        {
          context: { counterTriggered: true },
          hitCount: 2,
          overrides: { basePower: 100 },
          skillId: "skill-a",
        },
        "skill-b",
        null,
        null,
      ],
      single: {
        context: { counterTriggered: true },
        overrides: { basePower: 100 },
        skillId: "skill-a",
      },
    },
    spiritId: "spirit-a",
  };
}

describe("isCompleteSpiritConfig", () => {
  test("requires a positive nature, three positive IVs, and two four-skill slots", () => {
    const complete = configuredSide();

    expect(isCompleteSpiritConfig(complete)).toBe(true);
    expect(
      isCompleteSpiritConfig({ ...complete, nature: "neutral" }),
    ).toBe(false);
    expect(
      isCompleteSpiritConfig({
        ...complete,
        displayIvs: {
          ...complete.displayIvs,
          magicalAttack: 0,
        },
      }),
    ).toBe(false);
    expect(
      isCompleteSpiritConfig({
        ...complete,
        skills: {
          ...complete.skills,
          four: [complete.skills.four[0], null, null, null],
        },
      }),
    ).toBe(false);
  });

  test("counts detailed-mode IV values above zero without requiring 60", () => {
    const complete = configuredSide();
    complete.displayIvs = {
      hp: 1,
      speed: 2,
      physicalAttack: 3,
      magicalAttack: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    };

    expect(isCompleteSpiritConfig(complete)).toBe(true);
  });
});

describe("spiritConfigsRepository", () => {
  test("migrates the previous app namespace without losing spirit memory", () => {
    const legacyKey = "lovepvp.spirit-configs.v1";
    const stored = {
      configs: {},
      schemaVersion: 1,
    };
    const storage = memoryStorage({
      [legacyKey]: JSON.stringify(stored),
    });

    expect(spiritConfigsRepository({ storage }).load(snapshot())).toEqual(
      stored,
    );
    expect(JSON.parse(storage.getItem(SPIRIT_CONFIG_STORAGE_KEY))).toEqual(
      stored,
    );
    expect(storage.getItem(legacyKey)).toBeNull();
  });

  test("persists the complete nested skill configuration without shared references", () => {
    const storage = memoryStorage();
    const repository = spiritConfigsRepository({
      now: () => "2026-07-29T12:00:00.000Z",
      storage,
    });
    const side = configuredSide();

    const saved = repository.save(repository.load(snapshot()), side);

    expect(saved.configs["spirit-a"]).toEqual({
      displayIvs: side.displayIvs,
      natureId: "adamant",
      skills: side.skills,
      spiritId: "spirit-a",
      updatedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(saved.configs["spirit-a"].skills).not.toBe(side.skills);
    side.skills.four[0].context.counterTriggered = false;
    expect(saved.configs["spirit-a"].skills.four[0].context).toEqual({
      counterTriggered: true,
    });
    expect(
      JSON.parse(storage.getItem(SPIRIT_CONFIG_STORAGE_KEY)),
    ).toEqual(saved);
  });

  test("uses one global entry per spirit and lets the last side overwrite it", () => {
    const repository = spiritConfigsRepository({
      now: () => "2026-07-29T12:00:00.000Z",
      storage: memoryStorage(),
    });
    let state = repository.save(repository.load(snapshot()), configuredSide());
    const defenderVersion = configuredSide();
    defenderVersion.nature = "smart";
    defenderVersion.displayIvs.physicalAttack = 0;
    defenderVersion.displayIvs.magicalDefense = 60;

    state = repository.save(state, defenderVersion);

    expect(Object.keys(state.configs)).toEqual(["spirit-a"]);
    expect(state.configs["spirit-a"].natureId).toBe("smart");
    expect(state.configs["spirit-a"].displayIvs.magicalDefense).toBe(60);
  });

  test("repairs stale snapshot references without discarding the valid configuration", () => {
    const stored = {
      schemaVersion: 1,
      configs: {
        "spirit-a": {
          ...configuredSide(),
          natureId: "adamant",
          skills: {
            four: ["skill-a", "missing-skill", "skill-b", null],
            single: "missing-skill",
          },
          updatedAt: "2026-07-29T12:00:00.000Z",
        },
        "missing-spirit": {
          ...configuredSide(),
          spiritId: "missing-spirit",
          updatedAt: "2026-07-29T12:00:00.000Z",
        },
      },
    };
    const repository = spiritConfigsRepository({
      storage: memoryStorage({
        [SPIRIT_CONFIG_STORAGE_KEY]: JSON.stringify(stored),
      }),
    });

    const restored = repository.load(snapshot());

    expect(restored.configs["missing-spirit"]).toBeUndefined();
    expect(restored.configs["spirit-a"]).toMatchObject({
      natureId: "adamant",
      skills: {
        four: ["skill-a", null, "skill-b", null],
        single: null,
      },
    });
  });

  test("falls back to an empty state for corrupt JSON and clear removes all memory", () => {
    const storage = memoryStorage({
      [SPIRIT_CONFIG_STORAGE_KEY]: "{not-json",
    });
    const repository = spiritConfigsRepository({ storage });

    expect(repository.load(snapshot())).toEqual({
      configs: {},
      schemaVersion: 1,
    });
    repository.save(repository.load(snapshot()), configuredSide());
    expect(storage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).not.toBeNull();

    expect(repository.clear()).toEqual({
      configs: {},
      schemaVersion: 1,
    });
    expect(storage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).toBeNull();
  });
});
