export const SEASON_THEME_STORAGE_KEY = "rock-calculator.miniapp.season-theme.v1";
export const SEASON_THEME_LAST_RANDOM_STORAGE_KEY = "rock-calculator.miniapp.season-theme-last-random.v1";
export const CLASSIC_CALCULATOR_COLORS_STORAGE_KEY = "rock-calculator.miniapp.classic-calculator-colors.v1";

export const SEASON_THEMES = Object.freeze([
  { id: "s1", label: "S1 暗夜拾光" },
  { id: "s2", label: "S2 狂欢怪谈" },
  { id: "s3", label: "S3 铅字幻梦" },
  { id: "s4", label: "S4 月涌狂想" },
]);

function normalizePreference(value) {
  return value === "random" || SEASON_THEMES.some(({ id }) => id === value) ? value : "s4";
}

function resolveSelection(value, random, excludeId) {
  const preference = normalizePreference(value);
  const candidates = SEASON_THEMES.filter(({ id }) => id !== excludeId);
  return {
    preference,
    id: preference === "random" ? candidates[Math.floor(random() * candidates.length)].id : preference,
  };
}

export function readSeasonTheme(storage, random = Math.random) {
  let preference;
  let previous;
  try {
    preference = storage.get(SEASON_THEME_STORAGE_KEY);
    previous = storage.get(SEASON_THEME_LAST_RANDOM_STORAGE_KEY);
  } catch { /* Storage may be unavailable. */ }
  return resolveSelection(preference, random, previous);
}

export function writeSeasonTheme(value, storage, random = Math.random, excludeId) {
  const selection = resolveSelection(value, random, excludeId);
  try { storage.set(SEASON_THEME_STORAGE_KEY, selection.preference); } catch { /* Keep the current page usable. */ }
  return selection;
}

export function writeLastRandomSeasonTheme(value, storage) {
  if (!SEASON_THEMES.some(({ id }) => id === value)) return;
  try { storage.set(SEASON_THEME_LAST_RANDOM_STORAGE_KEY, value); } catch { /* Current-page draws remain usable. */ }
}

export function readClassicCalculatorColors(storage) {
  try {
    const value = storage.get(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY);
    return value === true || value === "true";
  } catch { return false; }
}

export function writeClassicCalculatorColors(value, storage) {
  const enabled = value === true;
  try { storage.set(CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, enabled); } catch { /* Keep this session usable. */ }
  return enabled;
}
