// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createFormConfigPreferences } from "../../src/state/form-config-preferences.js";
import { readViewModeSetting, writeViewModeSetting, readNegativeStatusSettlementSetting, writeNegativeStatusSettlementSetting } from "../../src/state/display-settings.js";
import { readShortcutSettings, writeShortcutSettings } from "../../src/state/shortcut-settings.js";
import { createServerStorage, serverStorageKey } from "../../src/state/server-storage.js";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

test("view, battle, and shortcut preferences do not leak between servers", () => {
  writeViewModeSetting("detailed", "cn");
  expect(readViewModeSetting("global")).toBe("compact");
  writeViewModeSetting("compact", "global");
  expect(readViewModeSetting("cn")).toBe("detailed");
  writeNegativeStatusSettlementSetting(undefined, true, "cn");
  expect(readNegativeStatusSettlementSetting(undefined, "global")).toBe(false);
  writeNegativeStatusSettlementSetting(createServerStorage("global"), false);
  expect(readNegativeStatusSettlementSetting(undefined, "cn")).toBe(true);
  writeShortcutSettings({ enabled: false, bindings: {} }, "cn");
  expect(readShortcutSettings("global").enabled).toBe(true);
});

test("form configuration memory and session preferences are independent, including storage events", () => {
  localStorage.setItem("rock-calculator.settings.form-config-memory.v1", JSON.stringify({ enabled: true, attack: true }));
  const cn = createFormConfigPreferences("cn");
  const global = createFormConfigPreferences("global");
  expect(cn.readPreferences("attack")).toBe(true);
  expect(global.readMemoryEnabled()).toBe(false);
  global.writePreference("attack", false);
  global.writeMemoryEnabled(true);
  expect(global.readPreferences("attack")).toBe(false);
  expect(cn.readPreferences("attack")).toBe(true);
  const cnChanged = vi.fn();
  const unsubscribe = cn.subscribe(cnChanged);
  window.dispatchEvent(new StorageEvent("storage", { key: serverStorageKey("global", "settings.form-config-memory.v1"), storageArea: localStorage }));
  expect(cnChanged).not.toHaveBeenCalled();
  unsubscribe();
  expect(createFormConfigPreferences("global").readPreferences("attack")).toBe(false);
  expect(localStorage.getItem("rock-calculator.settings.form-config-memory.v1")).toBe(JSON.stringify({ enabled: true, attack: true }));
});
