import { expect, test } from "vitest";
import { readClassicCalculatorColorsSetting, writeClassicCalculatorColorsSetting, readLastRandomSeasonTheme, readSeasonThemePreference, CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, SEASON_THEME_LAST_RANDOM_STORAGE_KEY, SEASON_THEME_STORAGE_KEY, writeLastRandomSeasonTheme, writeSeasonThemePreference } from "../../src/state/season-theme.js";
import { serverStorageKey } from "../../src/state/server-storage.js";
import { getSeasonTheme, normalizeSeasonThemePreference, pickRandomSeasonThemeId, resolveSeasonPreviewId, resolveSeasonThemeId } from "../../src/theme/season-themes.js";

test("赛季外观独立记忆，不覆盖亮暗或计算设置，无效值恢复 S4", () => {
  const values = new Map([["rock-calculator.settings.theme.v1", "dark"], ["calculator-session", "kept"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  expect(readSeasonThemePreference(storage)).toBe("default");
  expect(getSeasonTheme(resolveSeasonThemeId({ preference: readSeasonThemePreference(storage) })).id).toBe("s4");
  for (const id of ["s1", "s2", "s3", "s4", "random"]) {
    expect(writeSeasonThemePreference(id, storage)).toBe(id);
    expect(readSeasonThemePreference(storage)).toBe(id);
  }
  expect(writeSeasonThemePreference("toString", storage)).toBe("default");
  expect(values.get(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe("default");
  expect(getSeasonTheme("toString").id).toBe("neutral");
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
  values.set(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY), "random");
  expect(readLastRandomSeasonTheme(storage)).toBeNull();
  values.set(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY), "s3");
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

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("season preferences are isolated by server and invalid values restore that server's default", () => {
  const storage = memoryStorage();
  expect(readSeasonThemePreference("cn", storage)).toBe("default");
  expect(readSeasonThemePreference("global", storage)).toBe("default");
  writeSeasonThemePreference("s1", "cn", storage);
  writeSeasonThemePreference("s3", "global", storage);
  expect(readSeasonThemePreference("cn", storage)).toBe("s1");
  expect(readSeasonThemePreference("global", storage)).toBe("s3");
  expect(resolveSeasonThemeId({ serverId: "cn", preference: "s1" })).toBe("s1");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "s3" })).toBe("s3");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "toString" })).toBe("neutral");
  writeSeasonThemePreference("s5", "cn", storage);
  expect(resolveSeasonThemeId({ serverId: "cn", preference: readSeasonThemePreference("cn", storage) })).toBe("s4");
  expect(storage.getItem("rock-calculator.settings.theme.v1")).toBeNull();
});

test("preview overrides a saved theme only on loopback and never becomes a preference", () => {
  expect(resolveSeasonThemeId({ serverId: "global", preference: "s3", hostname: "localhost", search: "?seasonPreview=s1" })).toBe("s1");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "s3", hostname: "rococalc.top", search: "?seasonPreview=s1" })).toBe("s3");
  expect(resolveSeasonPreviewId({ hostname: "rococalc.top", search: "?seasonPreview=s1" })).toBeNull();
});

test("unavailable storage keeps a normalized in-memory choice without throwing", () => {
  const storage = { getItem: () => { throw new Error("blocked"); } };
  expect(readSeasonThemePreference("global", storage)).toBe("default");
  expect(writeSeasonThemePreference("s2", "global", storage)).toBe("s2");
  expect(writeSeasonThemePreference("random", "global", storage)).toBe("random");
});

test.each([[0, "s1"], [0.25, "s2"], [0.5, "s3"], [0.99999, "s4"]])("random draw %s selects %s from the four artwork themes", (random, id) => {
  expect(pickRandomSeasonThemeId(() => random)).toBe(id);
});

test("random mode persists independently without saving its transient draw or bypassing local preview", () => {
  const storage = memoryStorage();
  writeSeasonThemePreference("s2", "cn", storage);
  writeSeasonThemePreference("random", "global", storage);
  expect(readSeasonThemePreference("cn", storage)).toBe("s2");
  expect(readSeasonThemePreference("global", storage)).toBe("random");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "random", randomThemeId: "s3" })).toBe("s3");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "random", randomThemeId: "s3", hostname: "localhost", search: "?seasonPreview=s1" })).toBe("s1");
  expect(resolveSeasonThemeId({ serverId: "global", preference: "random", randomThemeId: "s3", hostname: "rococalc.top", search: "?seasonPreview=s1" })).toBe("s3");
  writeSeasonThemePreference("s3", "global", storage);
  expect(readSeasonThemePreference("global", storage)).toBe("s3");
  expect(readSeasonThemePreference("cn", storage)).toBe("s2");
});

test("legacy CN appearance is preserved without leaking random history or classic colors into Global", () => {
  const values = new Map([[SEASON_THEME_STORAGE_KEY, "random"], [SEASON_THEME_LAST_RANDOM_STORAGE_KEY, "s2"], [CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, "1"]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  expect(readSeasonThemePreference("cn", storage)).toBe("random");
  expect(readLastRandomSeasonTheme("cn", storage)).toBe("s2");
  expect(readClassicCalculatorColorsSetting("cn", storage)).toBe(true);
  expect(values.has(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe(false);
  expect(readSeasonThemePreference("global", storage)).toBe("default");
  expect(readLastRandomSeasonTheme("global", storage)).toBeNull();
  expect(readClassicCalculatorColorsSetting("global", storage)).toBe(false);
  writeSeasonThemePreference("s3", "global", storage);
  writeLastRandomSeasonTheme("s4", "global", storage);
  writeClassicCalculatorColorsSetting(false, "global", storage);
  writeSeasonThemePreference("random", "cn", storage);
  expect(readSeasonThemePreference("cn", storage)).toBe("random");
  expect(readLastRandomSeasonTheme("cn", storage)).toBe("s2");
  expect(readClassicCalculatorColorsSetting("cn", storage)).toBe(true);
  expect(readLastRandomSeasonTheme("global", storage)).toBe("s4");
  expect(readSeasonThemePreference("global", storage)).toBe("s3");
  expect(values.get(SEASON_THEME_STORAGE_KEY)).toBe("random");
});
