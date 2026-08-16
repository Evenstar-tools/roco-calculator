export const TYPE_COVERAGE_STORAGE_KEY =
  "rock-calculator.settings.type-coverage.v1";
export const POWER_DISPLAY_STORAGE_KEY =
  "rock-calculator.settings.power-display.v1";

function normalizePowerDisplayMode(value) {
  return value === "panel" ? "panel" : "skill";
}

export function readPowerDisplayMode(storage = globalThis.localStorage) {
  try {
    return normalizePowerDisplayMode(storage?.getItem(POWER_DISPLAY_STORAGE_KEY));
  } catch {
    return "skill";
  }
}

export function writePowerDisplayMode(
  storage = globalThis.localStorage,
  mode,
) {
  const normalized = normalizePowerDisplayMode(mode);
  try {
    storage?.setItem(POWER_DISPLAY_STORAGE_KEY, normalized);
  } catch {
    return normalized;
  }
  return normalized;
}

export function readTypeCoverageSetting(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(TYPE_COVERAGE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeTypeCoverageSetting(
  storage = globalThis.localStorage,
  enabled,
) {
  const normalized = Boolean(enabled);
  try {
    storage?.setItem(TYPE_COVERAGE_STORAGE_KEY, normalized ? "1" : "0");
  } catch {
    return normalized;
  }
  return normalized;
}
