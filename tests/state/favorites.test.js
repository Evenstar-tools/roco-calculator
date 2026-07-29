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
  test("returns an empty collection for bad JSON without overwriting it", () => {
    const storage = memoryStorage({
      [FAVORITES_STORAGE_KEY]: "{unreadable",
    });
    const repository = favoritesRepository(storage);

    expect(repository.list()).toEqual([]);
    expect(storage.raw()).toBe("{unreadable");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
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
