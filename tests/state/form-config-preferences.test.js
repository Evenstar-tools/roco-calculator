import { expect, test } from "vitest";
import {
  FORM_CONFIG_PREFERENCES_STORAGE_KEY,
  readFormConfigPreferences,
  writeFormConfigPreference,
} from "../../src/state/form-config-preferences.js";

function createStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[FORM_CONFIG_PREFERENCES_STORAGE_KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("萌化配置偏好按攻防方和家族分别记住开启与关闭", () => {
  const storage = createStorage();
  expect(readFormConfigPreferences("attack", storage)).toEqual({});
  writeFormConfigPreference("attack", "family-a", false, storage);
  writeFormConfigPreference("attack", "family-b", true, storage);
  writeFormConfigPreference("defense", "family-a", true, storage);
  expect(readFormConfigPreferences("attack", storage)).toEqual({ "family-a": false, "family-b": true });
  expect(readFormConfigPreferences("defense", storage)).toEqual({ "family-a": true });
});

test("损坏或不可用的存储不影响开关本次会话操作", () => {
  const broken = createStorage("not json");
  expect(readFormConfigPreferences("attack", broken)).toEqual({});
  expect(writeFormConfigPreference("attack", "family-a", true, broken)).toBe(true);
  expect(readFormConfigPreferences("attack", broken)).toEqual({ "family-a": true });
  const denied = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  };
  expect(readFormConfigPreferences("attack", denied)).toEqual({});
  expect(writeFormConfigPreference("attack", "family-a", false, denied)).toBe(false);
});

test("只恢复布尔偏好，忽略异常家族记录和无关选择器", () => {
  const storage = createStorage(JSON.stringify({
    attack: { "family-a": true, "family-b": "false", "": true },
    defense: [true],
  }));
  expect(readFormConfigPreferences("attack", storage)).toEqual({ "family-a": true });
  expect(readFormConfigPreferences("defense", storage)).toEqual({});
  expect(readFormConfigPreferences("member", storage)).toEqual({});
  writeFormConfigPreference("member", "family-a", false, storage);
  expect(readFormConfigPreferences("attack", storage)).toEqual({ "family-a": true });
});
