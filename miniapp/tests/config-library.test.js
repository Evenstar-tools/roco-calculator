import { describe, expect, test, vi } from "vitest";
import {
  createConfigLibraryRepository,
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
  skills: [{ id: "skill-a" }],
  spirits: [{ id: "spirit-a", fullName: "测试精灵" }],
};

function library() {
  return JSON.stringify({
    entryCount: 1,
    entries: [{
      displayIvs: {
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 60,
        physicalAttack: 60,
        physicalDefense: 60,
        speed: 60,
      },
      natureId: "adamant",
      skills: ["skill-a", null, null, null],
      spiritId: "spirit-a",
      traitValues: {},
    }],
    format: "rock-calculator.favorite-config-library",
    schemaVersion: 1,
  });
}

describe("createConfigLibraryRepository", () => {
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
  });
});
