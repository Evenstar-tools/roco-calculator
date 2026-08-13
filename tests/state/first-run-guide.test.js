import { describe, expect, test, vi } from "vitest";
import {
  FIRST_RUN_GUIDE_STORAGE_KEY,
  completeFirstRunGuide,
  isFirstRunGuideCompleted,
} from "../../src/state/first-run-guide.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: vi.fn((key) => (values.has(key) ? values.get(key) : null)),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    raw: () => values.get(FIRST_RUN_GUIDE_STORAGE_KEY) ?? null,
  };
}

describe("first run guide state", () => {
  test("opens only until the user skips or completes the guide", () => {
    const storage = memoryStorage();

    expect(isFirstRunGuideCompleted(storage)).toBe(false);

    expect(completeFirstRunGuide(storage)).toBe(true);
    expect(storage.raw()).toBe("1");
    expect(isFirstRunGuideCompleted(storage)).toBe(true);
  });

  test("treats stale values as incomplete and survives unavailable storage", () => {
    const staleStorage = memoryStorage({
      [FIRST_RUN_GUIDE_STORAGE_KEY]: "true",
    });
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(isFirstRunGuideCompleted(staleStorage)).toBe(false);
    expect(isFirstRunGuideCompleted(unavailableStorage)).toBe(false);
    expect(completeFirstRunGuide(unavailableStorage)).toBe(false);
  });
});
