import { normalizeSeasonThemePreference } from "../theme/season-themes.js";

export const SEASON_THEME_STORAGE_KEY = "rock-calculator.settings.season-theme.v1";

export function readSeasonThemePreference(storage = globalThis.localStorage) {
  try {
    return normalizeSeasonThemePreference(storage?.getItem(SEASON_THEME_STORAGE_KEY));
  } catch {
    return "default";
  }
}

export function writeSeasonThemePreference(value, storage = globalThis.localStorage) {
  const preference = normalizeSeasonThemePreference(value);
  try {
    storage?.setItem(SEASON_THEME_STORAGE_KEY, preference);
  } catch {
    // A blocked store must not prevent this session's appearance from changing.
  }
  return preference;
}
