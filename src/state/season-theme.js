import { normalizeSeasonThemePreference } from "../theme/season-themes.js";
import { createServerStorage, serverStorageKey } from "./server-storage.js";

export const SEASON_THEME_STORAGE_KEY = "rock-calculator.settings.season-theme.v1";
export const SEASON_THEME_LAST_RANDOM_STORAGE_KEY = "rock-calculator.settings.season-theme-last-random.v1";
export const CLASSIC_CALCULATOR_COLORS_STORAGE_KEY = "rock-calculator.settings.classic-calculator-colors.v1";

// Keep the original (storage) signatures usable while all runtime calls name their server.
function storageTarget(serverOrStorage, storage) {
  const serverId = typeof serverOrStorage === "string" ? serverOrStorage : "cn";
  const supplied = typeof serverOrStorage === "string" ? storage : serverOrStorage;
  return { serverId, storage: supplied === undefined ? globalThis.localStorage : supplied };
}

function readSetting(key, serverOrStorage, storage) {
  const target = storageTarget(serverOrStorage, storage);
  const value = target.storage?.getItem(serverStorageKey(target.serverId, key));
  // Read legacy CN appearance without mutating storage during React initialization.
  return value ?? (target.serverId === "cn" ? target.storage?.getItem(key) : null);
}

function writeSetting(key, value, serverOrStorage, storage) {
  const target = storageTarget(serverOrStorage, storage);
  createServerStorage(target.serverId, target.storage).setItem(key, value);
}

export function readClassicCalculatorColorsSetting(serverId = "cn", storage) {
  try { return readSetting(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, serverId, storage) === "1"; }
  catch { return false; }
}

export function writeClassicCalculatorColorsSetting(enabled, serverId = "cn", storage) {
  const normalized = Boolean(enabled);
  try { writeSetting(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, normalized ? "1" : "0", serverId, storage); }
  catch { /* Keep the current session usable when appearance preferences cannot be saved. */ }
  return normalized;
}

export function readSeasonThemePreference(serverId = "cn", storage) {
  try { return normalizeSeasonThemePreference(readSetting(SEASON_THEME_STORAGE_KEY, serverId, storage)); }
  catch { return "default"; }
}

export function writeSeasonThemePreference(value, serverId = "cn", storage) {
  const preference = normalizeSeasonThemePreference(value);
  try { writeSetting(SEASON_THEME_STORAGE_KEY, preference, serverId, storage); }
  catch { /* A blocked store must not prevent this session's appearance from changing. */ }
  return preference;
}

export function readLastRandomSeasonTheme(serverId = "cn", storage) {
  try {
    const id = normalizeSeasonThemePreference(readSetting(SEASON_THEME_LAST_RANDOM_STORAGE_KEY, serverId, storage));
    return id === "default" || id === "random" ? null : id;
  } catch { return null; }
}

export function writeLastRandomSeasonTheme(value, serverId = "cn", storage) {
  const id = normalizeSeasonThemePreference(value);
  if (id === "default" || id === "random") return null;
  try { writeSetting(SEASON_THEME_LAST_RANDOM_STORAGE_KEY, id, serverId, storage); }
  catch { /* Excluding the current theme still works in memory if storage is blocked. */ }
  return id;
}
