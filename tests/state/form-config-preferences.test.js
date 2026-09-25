import { expect, test } from "vitest";
import {
  FORM_CONFIG_PREFERENCES_STORAGE_KEY,
  canPreserveBattleFormConfig,
  initializeFormConfigSession,
  readFormConfigPreferences,
  writeFormConfigPreference,
} from "../../src/state/form-config-preferences.js";

function createStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[FORM_CONFIG_PREFERENCES_STORAGE_KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test.each(["navigate", "reload", "back_forward"])("%s：新访问不继承另一页的开关，刷新与历史返回保留", (navigationType) => {
  const storage = createStorage(JSON.stringify({ attack: true, defense: false }));
  storage.setItem("personal-presets", "untouched");
  initializeFormConfigSession(navigationType, storage);
  expect(readFormConfigPreferences("attack", storage)).toBe(navigationType === "navigate" ? undefined : true);
  expect(readFormConfigPreferences("defense", storage)).toBe(navigationType === "navigate" ? undefined : false);
  expect(storage.getItem("personal-presets")).toBe("untouched");
});

test.each([
  ["同阶不同 ID", { id: "branch-a", stage: "三阶" }, { id: "branch-b", stage: "三阶" }, false],
  ["底座本人", { id: "branch-a", stage: "三阶" }, { id: "branch-a", stage: "三阶" }, true],
  ["高阶降阶", { id: "branch-a", stage: "三阶" }, { id: "lower", stage: "二阶" }, true],
  ["低阶升阶", { id: "lower", stage: "二阶" }, { id: "branch-a", stage: "三阶" }, false],
])("%s：仅安全的萌化切换沿用底座配置", (_name, source, target, expected) => {
  expect(canPreserveBattleFormConfig(source, target)).toBe(expected);
});

test("萌化配置偏好只按攻防方记忆，不绑定精灵家族", () => {
  const storage = createStorage();
  expect(readFormConfigPreferences("attack", storage)).toBeUndefined();
  expect(readFormConfigPreferences("defense", storage)).toBeUndefined();
  writeFormConfigPreference("attack", false, storage);
  writeFormConfigPreference("defense", true, storage);
  expect(readFormConfigPreferences("attack", storage)).toBe(false);
  expect(readFormConfigPreferences("defense", storage)).toBe(true);
  writeFormConfigPreference("attack", true, storage);
  expect(readFormConfigPreferences("attack", storage)).toBe(true);
  expect(readFormConfigPreferences("defense", storage)).toBe(true);
});

test("损坏或不可用的会话存储不影响本次页面内开关操作", () => {
  const broken = createStorage("not json");
  expect(readFormConfigPreferences("attack", broken)).toBeUndefined();
  expect(writeFormConfigPreference("attack", true, broken)).toBe(true);
  expect(readFormConfigPreferences("attack", broken)).toBe(true);
  const denied = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  };
  expect(readFormConfigPreferences("attack", denied)).toBeUndefined();
  expect(writeFormConfigPreference("attack", false, denied)).toBe(false);
});

test("只恢复攻防两侧的布尔值，忽略旧家族映射和无关选择器", () => {
  const storage = createStorage(JSON.stringify({
    attack: { "family-a": true, "family-b": "false", "": true },
    defense: false,
    member: true,
  }));
  expect(readFormConfigPreferences("attack", storage)).toBeUndefined();
  expect(readFormConfigPreferences("defense", storage)).toBe(false);
  expect(readFormConfigPreferences("member", storage)).toBeUndefined();
  writeFormConfigPreference("member", true, storage);
  expect(readFormConfigPreferences("attack", storage)).toBeUndefined();
  expect(readFormConfigPreferences("defense", storage)).toBe(false);
});
