import { normalizeSeasonThemePreference } from "../theme/season-themes.js";
import { createServerStorage } from "./server-storage.js";

export const SEASON_THEME_STORAGE_KEY = "rock-calculator.settings.season-theme.v1";

export function readSeasonThemePreference(serverId = "cn", storage = globalThis.localStorage) {
  try {
    return normalizeSeasonThemePreference(createServerStorage(serverId, storage).getItem(SEASON_THEME_STORAGE_KEY));
  } catch {
    return "default";
  }
}

export function writeSeasonThemePreference(value, serverId = "cn", storage = globalThis.localStorage) {
  const preference = normalizeSeasonThemePreference(value);
  try {
    createServerStorage(serverId, storage).setItem(SEASON_THEME_STORAGE_KEY, preference);
  } catch {
    // A blocked store must not prevent changing the current session's appearance.
  }
  return preference;
}
