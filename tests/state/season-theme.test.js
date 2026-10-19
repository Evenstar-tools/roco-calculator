import { expect, test } from "vitest";
import { readSeasonThemePreference, SEASON_THEME_STORAGE_KEY, writeSeasonThemePreference } from "../../src/state/season-theme.js";
import { getSeasonTheme, normalizeSeasonThemePreference, pickRandomSeasonThemeId } from "../../src/theme/season-themes.js";

test("赛季外观独立记忆，不覆盖亮暗或计算设置，无效值恢复 S4", () => {
  const values = new Map([["rock-calculator.settings.theme.v1", "dark"], ["calculator-session", "kept"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  expect(readSeasonThemePreference(storage)).toBe("default");
  expect(getSeasonTheme(readSeasonThemePreference(storage)).id).toBe("s4");
  for (const id of ["s1", "s2", "s3", "s4", "random"]) {
    expect(writeSeasonThemePreference(id, storage)).toBe(id);
    expect(readSeasonThemePreference(storage)).toBe(id);
  }
  expect(writeSeasonThemePreference("toString", storage)).toBe("default");
  expect(values.get(SEASON_THEME_STORAGE_KEY)).toBe("default");
  expect(getSeasonTheme("toString").id).toBe("s4");
  expect(normalizeSeasonThemePreference(null)).toBe("default");
  expect(values.get("rock-calculator.settings.theme.v1")).toBe("dark");
  expect(values.get("calculator-session")).toBe("kept");
});

test("存储被禁用时仍允许本次选择外观", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  expect(readSeasonThemePreference(storage)).toBe("default");
  expect(writeSeasonThemePreference("s2", storage)).toBe("s2");
  expect(writeSeasonThemePreference("random", storage)).toBe("random");
});

test("随机只从四季主题选择，不抽到默认或无效主题", () => {
  expect([0, 0.25, 0.5, 0.999].map((value) => pickRandomSeasonThemeId(() => value)))
    .toEqual(["s1", "s2", "s3", "s4"]);
});
