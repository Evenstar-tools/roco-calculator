import { normalizeSeasonThemePreference } from "../theme/season-themes.js";

export const SEASON_THEME_STORAGE_KEY = "rock-calculator.settings.season-theme.v1";
export const SEASON_THEME_LAST_RANDOM_STORAGE_KEY = "rock-calculator.settings.season-theme-last-random.v1";
export const CLASSIC_CALCULATOR_COLORS_STORAGE_KEY = "rock-calculator.settings.classic-calculator-colors.v1";

export function readClassicCalculatorColorsSetting(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return target?.getItem(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeClassicCalculatorColorsSetting(enabled, storage) {
  const normalized = Boolean(enabled);
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target?.setItem(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, normalized ? "1" : "0");
  } catch {
    // Keep the current session usable when appearance preferences cannot be saved.
  }
  return normalized;
}

export function readSeasonThemePreference(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return normalizeSeasonThemePreference(target?.getItem(SEASON_THEME_STORAGE_KEY));
  } catch {
    return "default";
  }
}

export function writeSeasonThemePreference(value, storage) {
  const preference = normalizeSeasonThemePreference(value);
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target?.setItem(SEASON_THEME_STORAGE_KEY, preference);
  } catch {
    // A blocked store must not prevent this session's appearance from changing.
  }
  return preference;
}

export function readLastRandomSeasonTheme(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const id = normalizeSeasonThemePreference(target?.getItem(SEASON_THEME_LAST_RANDOM_STORAGE_KEY));
    return id === "default" || id === "random" ? null : id;
  } catch {
    return null;
  }
}

export function writeLastRandomSeasonTheme(value, storage) {
  const id = normalizeSeasonThemePreference(value);
  if (id === "default" || id === "random") return null;
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target?.setItem(SEASON_THEME_LAST_RANDOM_STORAGE_KEY, id);
  } catch {
    // Excluding the current theme still works in memory if storage is blocked.
  }
  return id;
}
