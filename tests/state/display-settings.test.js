import { describe, expect, test } from "vitest";
import {
  DURABILITY_OVERVIEW_STORAGE_KEY,
  POWER_DISPLAY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  readPowerDisplayMode,
  readDurabilityOverviewSetting,
  readThemeSetting,
  readTypeCoverageSetting,
  writePowerDisplayMode,
  writeDurabilityOverviewSetting,
  writeThemeSetting,
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

describe("durability overview display setting", () => {
  test("defaults to off", () => {
    expect(DURABILITY_OVERVIEW_STORAGE_KEY).toBe(
      "rock-calculator.settings.durability-overview.v1",
    );
    expect(readDurabilityOverviewSetting(createStorage())).toBe(false);
  });

  test("persists an enabled setting independently", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(writeDurabilityOverviewSetting(storage, true)).toBe(true);
    expect(values.get(DURABILITY_OVERVIEW_STORAGE_KEY)).toBe("1");
    expect(readDurabilityOverviewSetting(storage)).toBe(true);
  });

  test("falls back safely when local storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(readDurabilityOverviewSetting(storage)).toBe(false);
    expect(writeDurabilityOverviewSetting(storage, true)).toBe(true);
  });
});

describe("power display setting", () => {
  test("defaults to static power", () => {
    expect(readPowerDisplayMode(createStorage())).toBe("static");
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

  test.each(["skill", "actual"])("maps the old %s value to static power", (value) => {
    const storage = {
      getItem: (key) => key === POWER_DISPLAY_STORAGE_KEY ? value : null,
      setItem: () => {},
    };
    expect(readPowerDisplayMode(storage)).toBe("static");
  });

  test("falls back to static power for an unsupported value", () => {
    const storage = {
      getItem: (key) => key === POWER_DISPLAY_STORAGE_KEY ? "broken" : null,
      setItem: () => {},
    };
    expect(readPowerDisplayMode(storage)).toBe("static");
    expect(writePowerDisplayMode(storage, "broken")).toBe("static");
  });
});

describe("theme setting", () => {
  test("defaults to light", () => {
    expect(readThemeSetting(createStorage())).toBe("light");
  });

  test("persists dark theme", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(writeThemeSetting(storage, "dark")).toBe("dark");
    expect(values.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemeSetting(storage)).toBe("dark");
  });

  test("treats unexpected stored values as light", () => {
    const storage = {
      getItem: (key) => (key === THEME_STORAGE_KEY ? "broken" : null),
      setItem: () => {},
    };
    expect(readThemeSetting(storage)).toBe("light");
    expect(writeThemeSetting(storage, "broken")).toBe("light");
  });

  test("read failures fall back to light", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(readThemeSetting(storage)).toBe("light");
  });
});
