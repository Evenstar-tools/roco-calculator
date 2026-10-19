import { expect, test } from "vitest";
import { readSeasonThemePreference, writeSeasonThemePreference } from "../../src/state/season-theme.js";
import { resolveSeasonPreviewId, resolveSeasonThemeId } from "../../src/theme/season-themes.js";

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
});
