import { describe, expect, test } from "vitest";
import {
  POWER_DISPLAY_STORAGE_KEY,
  readPowerDisplayMode,
  readTypeCoverageSetting,
  writePowerDisplayMode,
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

describe("power display setting", () => {
  test("defaults to actual power", () => {
    expect(readPowerDisplayMode(createStorage())).toBe("actual");
  });

  test("persists panel power", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(writePowerDisplayMode(storage, "panel")).toBe("panel");
    expect(values.get(POWER_DISPLAY_STORAGE_KEY)).toBe("panel");
    expect(readPowerDisplayMode(storage)).toBe("panel");
  });

  test("maps the old skill value to actual power", () => {
    const storage = {
      getItem: (key) => key === POWER_DISPLAY_STORAGE_KEY ? "skill" : null,
      setItem: () => {},
    };
    expect(readPowerDisplayMode(storage)).toBe("actual");
  });

  test("falls back to actual power for an unsupported value", () => {
    const storage = {
      getItem: (key) => key === POWER_DISPLAY_STORAGE_KEY ? "broken" : null,
      setItem: () => {},
    };
    expect(readPowerDisplayMode(storage)).toBe("actual");
    expect(writePowerDisplayMode(storage, "broken")).toBe("actual");
  });
});
