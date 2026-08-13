import { describe, expect, test } from "vitest";
import {
  readTypeCoverageSetting,
  writeTypeCoverageSetting,
} from "../../src/state/display-settings.js";

function createStorage(value = null) {
  const values = new Map(value === null ? [] : [["rock-calculator.settings.type-coverage.v1", value]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
  };
}

describe("type coverage display setting", () => {
  test("defaults to off", () => {
    expect(readTypeCoverageSetting(createStorage())).toBe(false);
  });

  test("persists an enabled setting", () => {
    const storage = createStorage();
    writeTypeCoverageSetting(storage, true);
    expect(readTypeCoverageSetting(storage)).toBe(true);
  });

  test("treats unexpected stored values as off", () => {
    expect(readTypeCoverageSetting(createStorage("broken"))).toBe(false);
  });
});
