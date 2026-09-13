import { describe, expect, test, vi } from "vitest";
import {
  configEntrySignature,
  createConfigLibraryRepository,
  MINIAPP_CONFIG_LIBRARY_KEY,
} from "../src/state/config-library.js";
import { createFavoritesRepository } from "../src/state/favorites.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    get: vi.fn((key) => values.get(key)),
    remove: vi.fn((key) => values.delete(key)),
    set: vi.fn((key, value) => values.set(key, value)),
  };
}

const snapshot = {
  meta: { id: "data-v1", rulesVersion: "rules-v1" },
  skills: [{ id: "skill-a" }, { id: "skill-b" }],
  spirits: [
    { id: "spirit-a", fullName: "测试精灵 A" },
    { id: "spirit-b", fullName: "测试精灵 B" },
    { id: "spirit-c", fullName: "测试精灵 C" },
  ],
};

function entry({
  natureId = "adamant",
  skillId = "skill-a",
  spiritId = "spirit-a",
} = {}) {
  return {
    displayIvs: {
      hp: 60,
      magicalAttack: 0,
      magicalDefense: 60,
      physicalAttack: 60,
      physicalDefense: 60,
      speed: 60,
    },
    natureId,
    skills: [skillId, null, null, null],
    spiritId,
    traitValues: {},
  };
}

function library({
  entries = [entry()],
  exportedAt = "2026-08-25T09:37:52.028Z",
} = {}) {
  return JSON.stringify({
    entryCount: entries.length,
    entries,
    exportedAt,
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
    versions: { data: "data-v1", rules: "rules-v1" },
  });
}

describe("createConfigLibraryRepository", () => {
  test("收藏配点可持久化，后续修改只更新性格个体并保留技能和导入标记", () => {
    const storage = createMemoryStorage();
    const repository = createConfigLibraryRepository({ storage });
    const before = { entries: [entry()], commonConfig: { bundleId: "bundle", entrySignatures: { "spirit-a": "original" } }, schemaVersion: 1 };
    storage.set(MINIAPP_CONFIG_LIBRARY_KEY, before);
    const saved = repository.saveAllocation({ ...entry({ natureId: "timid" }), skills: { four: ["skill-b", null, null, null] }, displayIvs: { ...entry().displayIvs, magicalDefense: 0 } }, snapshot);
    expect(saved.entries[0]).toMatchObject({ natureId: "timid", skills: ["skill-a", null, null, null], displayIvs: { magicalDefense: 0 } });
    expect(saved.commonConfig).toEqual(before.commonConfig);
    repository.saveAllocation({ ...entry({ spiritId: "spirit-b" }), skills: { four: ["skill-b", null, null, null] } }, snapshot);
    expect(repository.load(snapshot).entries).toHaveLength(2);
    expect(repository.load(snapshot).entries[1].skills[0]).toBe("skill-b");
    expect(() => repository.saveAllocation({ spiritId: "spirit-a" }, snapshot)).toThrow("预设配点无效");
    expect(repository.load(snapshot).entries).toHaveLength(2);
  });
  test("imports a bundled configuration into favorites and persistent presets", () => {
    const storage = createMemoryStorage();
    const favoritesRepository = createFavoritesRepository({ storage });
    favoritesRepository.load(snapshot);
    const repository = createConfigLibraryRepository({
      favoritesRepository,
      storage,
    });

    const committed = repository.commit(
      repository.preview(library(), snapshot),
      snapshot,
    );

    expect(committed.entries).toEqual([
      expect.objectContaining({
        natureId: "adamant",
        spiritId: "spirit-a",
      }),
    ]);
    expect(committed.favorites).toEqual(["spirit-a"]);
    expect(favoritesRepository.list()).toEqual(["spirit-a"]);
    expect(repository.load(snapshot).entries).toEqual(committed.entries);
    expect(repository.load(snapshot).commonConfig.bundleId)
      .toBe(committed.commonConfig.bundleId);
  });

  test("updates untouched bundled entries while preserving user-edited entries", () => {
    const storage = createMemoryStorage();
    const favoritesRepository = createFavoritesRepository({ storage });
    favoritesRepository.load(snapshot);
    const repository = createConfigLibraryRepository({
      favoritesRepository,
      storage,
    });
    const oldA = entry();
    const oldB = entry({ spiritId: "spirit-b" });
    const editedB = entry({
      natureId: "timid",
      skillId: "skill-b",
      spiritId: "spirit-b",
    });
    storage.set(MINIAPP_CONFIG_LIBRARY_KEY, {
      entries: [oldA, editedB],
      schemaVersion: 1,
    });
    const parsed = repository.preview(library({
      entries: [
        entry({ natureId: "brave" }),
        entry({ natureId: "brave", spiritId: "spirit-b" }),
        entry({ spiritId: "spirit-c" }),
      ],
      exportedAt: "2026-08-26T09:00:00.000Z",
    }), snapshot);

    const committed = repository.commit(parsed, snapshot, {
      legacyEntrySignatures: {
        "spirit-a": configEntrySignature(oldA),
        "spirit-b": configEntrySignature(oldB),
      },
    });

    expect(committed.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ natureId: "brave", spiritId: "spirit-a" }),
      expect.objectContaining({
        natureId: "timid",
        skills: ["skill-b", null, null, null],
        spiritId: "spirit-b",
      }),
      expect.objectContaining({ spiritId: "spirit-c" }),
    ]));
    expect(committed.preview.preserved).toBe(1);
    expect(committed.commonConfig.bundleId).toBe(parsed.bundleId);
    expect(repository.load(snapshot).commonConfig.bundleId)
      .toBe(parsed.bundleId);
  });
});
