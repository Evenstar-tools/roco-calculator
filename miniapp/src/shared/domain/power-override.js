const MAX_POWER = 9999;

function finitePower(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_POWER
    ? numeric
    : null;
}

function validCurrentOverride(current) {
  if (!current || typeof current !== "object") return null;
  const value = finitePower(current.value);
  if (value === null) return null;
  if (current.mode === "panel") {
    return Number.isInteger(value)
      ? { mode: "panel", source: "manual-panel", value }
      : null;
  }
  if (current.mode === "actual") {
    const precision = Math.round(value * 1_000_000) / 1_000_000;
    return precision === value
      ? { mode: "actual", source: "manual-actual", value }
      : null;
  }
  return null;
}

export function resolvePowerOverride({
  current,
  legacyBasePower,
  legacyDisplayedPower,
  legacyPowerMode,
} = {}) {
  const resolvedCurrent = validCurrentOverride(current);
  if (resolvedCurrent) return resolvedCurrent;

  if (legacyPowerMode === "displayed") {
    const value = finitePower(legacyDisplayedPower);
    if (value !== null && Number.isInteger(value)) {
      return { mode: "panel", source: "legacy-displayed", value };
    }
  }

  const legacyValue = finitePower(legacyBasePower);
  if (legacyValue !== null) {
    return {
      mode: "legacy-base",
      source: "legacy-base",
      value: legacyValue,
    };
  }

  return { mode: "automatic", source: "automatic", value: null };
}
