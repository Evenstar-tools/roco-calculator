export const SEASON_THEME_STORAGE_KEY = "rock-calculator.miniapp.season-theme.v1";

export const SEASON_THEMES = Object.freeze([
  { id: "s1", label: "S1 暗夜拾光" },
  { id: "s2", label: "S2 狂欢怪谈" },
  { id: "s3", label: "S3 铅字幻梦" },
  { id: "s4", label: "S4 月涌狂想" },
]);

function normalizePreference(value) {
  return value === "random" || SEASON_THEMES.some(({ id }) => id === value) ? value : "s4";
}

function resolveSelection(value, random) {
  const preference = normalizePreference(value);
  return {
    preference,
    id: preference === "random" ? SEASON_THEMES[Math.floor(random() * SEASON_THEMES.length)].id : preference,
  };
}

export function readSeasonTheme(storage, random = Math.random) {
  let preference;
  try { preference = storage.get(SEASON_THEME_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  return resolveSelection(preference, random);
}

export function writeSeasonTheme(value, storage, random = Math.random) {
  const selection = resolveSelection(value, random);
  try { storage.set(SEASON_THEME_STORAGE_KEY, selection.preference); } catch { /* Keep the current page usable. */ }
  return selection;
}
