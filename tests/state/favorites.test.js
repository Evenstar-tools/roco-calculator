import { describe, expect, test, vi } from "vitest";
import {
  FAVORITES_STORAGE_KEY,
  favoritesRepository,
} from "../../src/state/favorites.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: vi.fn((key) => (values.has(key) ? values.get(key) : null)),
    setItem: vi.fn((key, nextValue) => {
      values.set(key, String(nextValue));
    }),
    removeItem: vi.fn((key) => {
      values.delete(key);
    }),
    raw: (key = FAVORITES_STORAGE_KEY) => values.get(key) ?? null,
  };
}

describe("favoritesRepository", () => {
  test("backs up corrupt JSON and returns an empty collection without overwriting it", () => {
    const storage = memoryStorage({
      [FAVORITES_STORAGE_KEY]: "{unreadable",
    });
    const repository = favoritesRepository(storage, {
      now: () => "2026-09-01T00:00:00.000Z",
    });

    expect(repository.list()).toEqual([]);
    expect(storage.raw()).toBe("{unreadable");
    expect(
      storage.raw(`${FAVORITES_STORAGE_KEY}.corrupt.2026-09-01T00:00:00.000Z`),
    ).toBe("{unreadable");
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test("does not throw when favorite writes hit storage quota", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      const error = new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
      throw error;
    });
    const repository = favoritesRepository(storage);

    expect(() => repository.save({ id: "a", name: "配置 A" })).not.toThrow();
    expect(repository.save({ id: "a", name: "配置 A" })).toBeNull();
    expect(repository.replace([{ id: "b", name: "配置 B" }])).toBeNull();
    expect(repository.list()).toEqual([]);
  });

  test("migrates the previous app namespace without losing favorites", () => {
    const legacyKey = "lovepvp.favorites.v1";
    const favorites = [{ id: "spirit:a", name: "绒光优优" }];
    const storage = memoryStorage({
      [legacyKey]: JSON.stringify(favorites),
    });

    expect(favoritesRepository(storage).list()).toEqual(favorites);
    expect(JSON.parse(storage.raw())).toEqual(favorites);
    expect(storage.raw(legacyKey)).toBeNull();
  });

  test("exports and imports favorite configurations as JSON", () => {
    const favorites = [
      {
        id: "sonic-dog-vs-water-spirit",
        name: "音速犬 → 水灵",
        state: {
          schemaVersion: 1,
          versions: { data: "s3", rules: "rules-v1" },
          sides: {
            attacker: { spiritId: "sonic-dog" },
            defender: { spiritId: "water-spirit" },
          },
        },
      },
    ];
    const source = favoritesRepository(
      memoryStorage({
        [FAVORITES_STORAGE_KEY]: JSON.stringify(favorites),
      }),
    );
    const targetStorage = memoryStorage();
    const target = favoritesRepository(targetStorage);

    const exported = source.exportJson();
    const imported = target.importJson(exported);

    expect(imported).toEqual(favorites);
    expect(target.list()).toEqual(favorites);
    expect(JSON.parse(targetStorage.raw())).toEqual(favorites);
  });

  test("saves, replaces, and removes favorites by stable id", () => {
    const storage = memoryStorage();
    const repository = favoritesRepository(storage);

    repository.save({ id: "a", name: "配置 A" });
    repository.save({ id: "b", name: "配置 B" });
    repository.save({ id: "a", name: "配置 A（更新）" });

    expect(repository.list()).toEqual([
      { id: "a", name: "配置 A（更新）" },
      { id: "b", name: "配置 B" },
    ]);
    expect(repository.remove("b")).toEqual([
      { id: "a", name: "配置 A（更新）" },
    ]);
    expect(repository.list()).toEqual([
      { id: "a", name: "配置 A（更新）" },
    ]);
  });
});
