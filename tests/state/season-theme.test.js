import { expect, test } from "vitest";
import { readLastRandomSeasonTheme, readSeasonThemePreference, SEASON_THEME_LAST_RANDOM_STORAGE_KEY, SEASON_THEME_STORAGE_KEY, writeLastRandomSeasonTheme, writeSeasonThemePreference } from "../../src/state/season-theme.js";
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

test.each(["s1", "s2", "s3", "s4"])("排除上次的 %s 后仍可均匀选择另外三季", (previous) => {
  const candidates = [0, 0.5, 0.999].map((value) => pickRandomSeasonThemeId(() => value, previous));
  expect(candidates).toEqual(["s1", "s2", "s3", "s4"].filter((id) => id !== previous));
});

test("随机记录独立保存且拒绝未知主题，旧字符串偏好保持兼容", () => {
  const values = new Map([[SEASON_THEME_STORAGE_KEY, "random"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  expect(readLastRandomSeasonTheme(storage)).toBeNull();
  expect(writeLastRandomSeasonTheme("s2", storage)).toBe("s2");
  expect(readLastRandomSeasonTheme(storage)).toBe("s2");
  expect(readSeasonThemePreference(storage)).toBe("random");
  expect(writeLastRandomSeasonTheme("toString", storage)).toBeNull();
  expect(readLastRandomSeasonTheme(storage)).toBe("s2");
  values.set(SEASON_THEME_LAST_RANDOM_STORAGE_KEY, "random");
  expect(readLastRandomSeasonTheme(storage)).toBeNull();
  values.set(SEASON_THEME_STORAGE_KEY, "s3");
  expect(readSeasonThemePreference(storage)).toBe("s3");
});

test("浏览器直接拒绝访问 localStorage 属性时仍使用可用的会话选择", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    expect(readSeasonThemePreference()).toBe("default");
    expect(readLastRandomSeasonTheme()).toBeNull();
    expect(writeSeasonThemePreference("s2")).toBe("s2");
    expect(writeLastRandomSeasonTheme("s2")).toBe("s2");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
