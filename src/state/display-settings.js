export const TYPE_COVERAGE_STORAGE_KEY =
  "rock-calculator.settings.type-coverage.v1";

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
