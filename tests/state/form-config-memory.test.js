// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  FORM_CONFIG_MEMORY_STORAGE_KEY,
  FORM_CONFIG_PREFERENCES_STORAGE_KEY,
  initializeFormConfigSession,
  readFormConfigMemoryEnabled,
  readFormConfigPreferences,
  subscribeFormConfigPreferences,
  writeFormConfigMemoryEnabled,
  writeFormConfigPreference,
} from "../../src/state/form-config-preferences.js";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  vi.restoreAllMocks();
  writeFormConfigMemoryEnabled(false);
  localStorage.clear(); sessionStorage.clear();
});

test("默认不跨页面记忆；开启后攻防分别保存且新访问可恢复", () => {
  expect(readFormConfigMemoryEnabled()).toBe(false);
  writeFormConfigPreference("attack", true);
  writeFormConfigPreference("defense", false);
  expect(localStorage.getItem(FORM_CONFIG_MEMORY_STORAGE_KEY)).toBeNull();
  writeFormConfigMemoryEnabled(true);
  initializeFormConfigSession("navigate");
  expect(sessionStorage.getItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY)).toBeNull();
  expect(readFormConfigMemoryEnabled()).toBe(true);
  expect(readFormConfigPreferences("attack")).toBe(true);
  expect(readFormConfigPreferences("defense")).toBe(false);
  writeFormConfigPreference("attack", false);
  writeFormConfigPreference("defense", true);
  sessionStorage.clear();
  expect(readFormConfigPreferences("attack")).toBe(false);
  expect(readFormConfigPreferences("defense")).toBe(true);
});

test("关闭只清除长期状态，不重置本页、不改个人预设；下次新访问回到默认", () => {
  localStorage.setItem("personal-presets", "untouched");
  writeFormConfigPreference("attack", true);
  writeFormConfigPreference("defense", false);
  writeFormConfigMemoryEnabled(true);
  sessionStorage.clear();
  writeFormConfigMemoryEnabled(false);
  expect(readFormConfigPreferences("attack")).toBe(true);
  expect(readFormConfigPreferences("defense")).toBe(false);
  expect(JSON.parse(localStorage.getItem(FORM_CONFIG_MEMORY_STORAGE_KEY))).toEqual({ enabled: false });
  initializeFormConfigSession("navigate");
  expect(readFormConfigPreferences("attack")).toBeUndefined();
  expect(localStorage.getItem("personal-presets")).toBe("untouched");
});

test("未操作的一侧保持未设置，不把三三默认开关固化为全局选择", () => {
  writeFormConfigPreference("attack", false);
  writeFormConfigMemoryEnabled(true);
  expect(readFormConfigPreferences("defense")).toBeUndefined();
  expect(JSON.parse(localStorage.getItem(FORM_CONFIG_MEMORY_STORAGE_KEY))).toEqual({ enabled: true, attack: false });
});

test("另一页面变更通知订阅者，关闭记忆后保留最后状态，不回退旧会话值", () => {
  writeFormConfigPreference("attack", false);
  const listener = vi.fn();
  const unsubscribe = subscribeFormConfigPreferences(listener);
  try {
    const enabled = JSON.stringify({ enabled: true, attack: true, defense: false });
    localStorage.setItem(FORM_CONFIG_MEMORY_STORAGE_KEY, enabled);
    window.dispatchEvent(new StorageEvent("storage", { key: FORM_CONFIG_MEMORY_STORAGE_KEY, storageArea: localStorage, newValue: enabled }));
    expect(readFormConfigPreferences("attack")).toBe(true);
    // 新页可能尚无会话缓存；关闭事件应保留旧的长期值。
    sessionStorage.clear();
    localStorage.setItem(FORM_CONFIG_MEMORY_STORAGE_KEY, '{"enabled":false}');
    window.dispatchEvent(new StorageEvent("storage", { key: FORM_CONFIG_MEMORY_STORAGE_KEY, storageArea: localStorage, oldValue: enabled }));
    expect(readFormConfigMemoryEnabled()).toBe(false);
    expect(readFormConfigPreferences("attack")).toBe(true);
    expect(readFormConfigPreferences("defense")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  } finally { unsubscribe(); }
});

test("旧记录、损坏数据与非布尔值不会启用记忆", () => {
  localStorage.setItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY, '{"attack":true}');
  for (const value of ['broken', 'null', '[]', '{"enabled":"true","attack":true}']) {
    localStorage.setItem(FORM_CONFIG_MEMORY_STORAGE_KEY, value);
    expect(readFormConfigMemoryEnabled()).toBe(false);
    expect(readFormConfigPreferences("attack")).toBeUndefined();
  }
  localStorage.setItem(FORM_CONFIG_MEMORY_STORAGE_KEY, '{"enabled":true,"attack":"false"}');
  expect(readFormConfigPreferences("attack")).toBeUndefined();
});

test("持久存储拒绝访问不阻塞本页开关", () => {
  const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("denied"); });
  try {
    writeFormConfigMemoryEnabled(true);
    writeFormConfigPreference("attack", true);
    expect(readFormConfigMemoryEnabled()).toBe(true);
    expect(readFormConfigPreferences("attack")).toBe(true);
    writeFormConfigMemoryEnabled(false);
    expect(readFormConfigPreferences("attack")).toBe(true);
  } finally { spy.mockRestore(); }
});

test("存储可读但写满时，记忆开关与双方选择仍可在本页切换", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  writeFormConfigMemoryEnabled(true);
  writeFormConfigPreference("attack", true);
  expect(readFormConfigMemoryEnabled()).toBe(true);
  expect(readFormConfigPreferences("attack")).toBe(true);
  writeFormConfigMemoryEnabled(false);
  expect(readFormConfigMemoryEnabled()).toBe(false);
  expect(readFormConfigPreferences("attack")).toBe(true);
});
