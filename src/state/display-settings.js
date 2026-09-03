export const TYPE_COVERAGE_STORAGE_KEY =
  "rock-calculator.settings.type-coverage.v1";
export const POWER_DISPLAY_STORAGE_KEY =
  "rock-calculator.settings.power-display.v1";
export const NEGATIVE_STATUS_SETTLEMENT_STORAGE_KEY =
  "rock-calculator.settings.negative-status-settlement.v1";
export const DURABILITY_OVERVIEW_STORAGE_KEY =
  "rock-calculator.settings.durability-overview.v1";
export const THEME_STORAGE_KEY = "rock-calculator.settings.theme.v1";

function normalizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

export function readThemeSetting(storage = globalThis.localStorage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function writeThemeSetting(storage = globalThis.localStorage, theme) {
  const normalized = normalizeTheme(theme);
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    return normalized;
  }
  return normalized;
}

function normalizePowerDisplayMode(value) {
  return value === "panel" ? "panel" : "static";
}

export function readPowerDisplayMode(storage = globalThis.localStorage) {
  try {
    return normalizePowerDisplayMode(storage?.getItem(POWER_DISPLAY_STORAGE_KEY));
  } catch {
    return "static";
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

export function readDurabilityOverviewSetting(
  storage = globalThis.localStorage,
) {
  try {
    return storage?.getItem(DURABILITY_OVERVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDurabilityOverviewSetting(
  storage = globalThis.localStorage,
  enabled,
) {
  const normalized = Boolean(enabled);
  try {
    storage?.setItem(
      DURABILITY_OVERVIEW_STORAGE_KEY,
      normalized ? "1" : "0",
    );
  } catch {
    return normalized;
  }
  return normalized;
}

export function readNegativeStatusSettlementSetting(
  storage = globalThis.localStorage,
) {
  try {
    return storage?.getItem(NEGATIVE_STATUS_SETTLEMENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeNegativeStatusSettlementSetting(
  storage = globalThis.localStorage,
  enabled,
) {
  const normalized = Boolean(enabled);
  try {
    storage?.setItem(
      NEGATIVE_STATUS_SETTLEMENT_STORAGE_KEY,
      normalized ? "1" : "0",
    );
  } catch {
    return normalized;
  }
  return normalized;
}
